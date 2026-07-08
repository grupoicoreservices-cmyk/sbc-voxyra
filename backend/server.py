"""SBC Manager - Session Border Controller Management Backend.

Exposes REST API for:
- JWT auth (admin seed)
- Operadoras (SIP Trunks)
- IPBXs externos
- Rotas / LCR
- ACL (whitelist / blacklist)
- CDR (histórico de chamadas)
- Chamadas ativas (live channels - simulated)
- Anti-fraude
- Configurações FreeSWITCH (XML generator)
- Usuários
- Dashboard metrics
"""
from dotenv import load_dotenv
from pathlib import Path

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / ".env")

import os
import uuid
import bcrypt
import jwt
import random
import ipaddress
import asyncio
import logging
from datetime import datetime, timezone, timedelta
from typing import List, Optional, Literal
from contextlib import asynccontextmanager

from fastapi import FastAPI, APIRouter, HTTPException, Depends, Request, Response, Query
from fastapi.responses import PlainTextResponse
from starlette.middleware.cors import CORSMiddleware
from motor.motor_asyncio import AsyncIOMotorClient
from pydantic import BaseModel, Field, ConfigDict, EmailStr

from esl import ESLClient


# ---------------------------------------------------------------------------
# Setup
# ---------------------------------------------------------------------------
logging.basicConfig(level=logging.INFO, format="%(asctime)s - %(levelname)s - %(message)s")
logger = logging.getLogger("sbc")

MONGO_URL = os.environ["MONGO_URL"]
DB_NAME = os.environ["DB_NAME"]
JWT_SECRET = os.environ["JWT_SECRET"]
JWT_ALGO = "HS256"
ADMIN_EMAIL = os.environ.get("ADMIN_EMAIL", "admin@sbcmanager.com")
ADMIN_PASSWORD = os.environ.get("ADMIN_PASSWORD", "Admin@2026")

FS_ESL_ENABLED = os.environ.get("FS_ESL_ENABLED", "false").lower() in ("1", "true", "yes")
FS_ESL_HOST = os.environ.get("FS_ESL_HOST", "127.0.0.1")
FS_ESL_PORT = int(os.environ.get("FS_ESL_PORT", "8021"))
FS_ESL_PASSWORD = os.environ.get("FS_ESL_PASSWORD", "ClueCon")

# Runtime state
esl_client: ESLClient | None = None
fs_state = {
    "esl_enabled": FS_ESL_ENABLED,
    "esl_connected": False,
    "uptime": None,
    "version": None,
    "channels_count": 0,
    "last_error": None,
    "source": "simulator" if not FS_ESL_ENABLED else "esl",
    "last_sync": None,
}

client = AsyncIOMotorClient(MONGO_URL)
db = client[DB_NAME]


# ---------------------------------------------------------------------------
# Helpers - password + JWT
# ---------------------------------------------------------------------------
def hash_password(pw: str) -> str:
    return bcrypt.hashpw(pw.encode("utf-8"), bcrypt.gensalt()).decode("utf-8")


def verify_password(pw: str, hashed: str) -> bool:
    try:
        return bcrypt.checkpw(pw.encode("utf-8"), hashed.encode("utf-8"))
    except Exception:
        return False


def create_access_token(user_id: str, email: str, role: str) -> str:
    payload = {
        "sub": user_id,
        "email": email,
        "role": role,
        "type": "access",
        "exp": datetime.now(timezone.utc) + timedelta(hours=8),
    }
    return jwt.encode(payload, JWT_SECRET, algorithm=JWT_ALGO)


def create_refresh_token(user_id: str) -> str:
    payload = {
        "sub": user_id,
        "type": "refresh",
        "exp": datetime.now(timezone.utc) + timedelta(days=7),
    }
    return jwt.encode(payload, JWT_SECRET, algorithm=JWT_ALGO)


def set_auth_cookies(response: Response, access: str, refresh: str) -> None:
    response.set_cookie("access_token", access, httponly=True, secure=True,
                        samesite="none", max_age=8 * 3600, path="/")
    response.set_cookie("refresh_token", refresh, httponly=True, secure=True,
                        samesite="none", max_age=7 * 24 * 3600, path="/")


async def get_current_user(request: Request) -> dict:
    token = request.cookies.get("access_token")
    if not token:
        auth = request.headers.get("Authorization", "")
        if auth.startswith("Bearer "):
            token = auth[7:]
    if not token:
        raise HTTPException(status_code=401, detail="Não autenticado")
    try:
        payload = jwt.decode(token, JWT_SECRET, algorithms=[JWT_ALGO])
        if payload.get("type") != "access":
            raise HTTPException(status_code=401, detail="Tipo de token inválido")
        user = await db.users.find_one({"id": payload["sub"]}, {"_id": 0, "password_hash": 0})
        if not user:
            raise HTTPException(status_code=401, detail="Usuário não encontrado")
        return user
    except jwt.ExpiredSignatureError:
        raise HTTPException(status_code=401, detail="Token expirado")
    except jwt.InvalidTokenError:
        raise HTTPException(status_code=401, detail="Token inválido")


async def require_admin(user: dict = Depends(get_current_user)) -> dict:
    if user.get("role") != "admin":
        raise HTTPException(status_code=403, detail="Requer permissão de admin")
    return user


# ---------------------------------------------------------------------------
# Models
# ---------------------------------------------------------------------------
def _uuid() -> str:
    return str(uuid.uuid4())


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


class LoginIn(BaseModel):
    email: EmailStr
    password: str


class UserOut(BaseModel):
    id: str
    email: str
    name: str
    role: str
    created_at: str


class UserCreate(BaseModel):
    email: EmailStr
    password: str
    name: str
    role: Literal["admin", "operator", "viewer"] = "operator"


class Operadora(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str = Field(default_factory=_uuid)
    nome: str
    host: str
    porta: int = 5060
    protocolo: Literal["udp", "tcp", "tls"] = "udp"
    usuario: Optional[str] = None
    senha: Optional[str] = None
    codec: str = "PCMA,PCMU,G729"
    canais_max: int = 30
    prefixo: Optional[str] = None
    enabled: bool = True
    status: Literal["online", "offline", "degraded"] = "offline"
    created_at: str = Field(default_factory=_now_iso)


class IPBX(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str = Field(default_factory=_uuid)
    nome: str
    host: str
    porta: int = 5060
    protocolo: Literal["udp", "tcp", "tls"] = "udp"
    codec: str = "PCMA,PCMU"
    canais_max: int = 60
    enabled: bool = True
    status: Literal["online", "offline", "degraded"] = "offline"
    created_at: str = Field(default_factory=_now_iso)


class Rota(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str = Field(default_factory=_uuid)
    nome: str
    padrao: str  # regex or prefix (ex: ^55.*)
    operadora_id: str
    ipbx_id: Optional[str] = None
    prioridade: int = 100  # lower = higher priority
    custo: float = 0.0
    enabled: bool = True
    created_at: str = Field(default_factory=_now_iso)


class ACLEntry(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str = Field(default_factory=_uuid)
    ip: str  # CIDR ou IP
    tipo: Literal["allow", "deny"] = "allow"
    direcao: Literal["inbound", "outbound", "both"] = "both"
    descricao: Optional[str] = None
    created_at: str = Field(default_factory=_now_iso)


class CDR(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str = Field(default_factory=_uuid)
    call_id: str
    src: str
    dst: str
    operadora_id: Optional[str] = None
    ipbx_id: Optional[str] = None
    src_ip: Optional[str] = None
    started_at: str
    answered_at: Optional[str] = None
    ended_at: Optional[str] = None
    duration: int = 0  # seconds (talk time)
    billsec: int = 0
    hangup_cause: str = "NORMAL_CLEARING"
    codec: str = "PCMA"
    disposition: Literal["ANSWERED", "NO ANSWER", "BUSY", "FAILED", "CONGESTION"] = "ANSWERED"
    direction: Literal["inbound", "outbound"] = "inbound"


class LiveChannel(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str = Field(default_factory=_uuid)
    call_id: str
    src: str
    dst: str
    src_ip: str
    codec: str = "PCMA"
    operadora: Optional[str] = None
    ipbx: Optional[str] = None
    status: Literal["Ringing", "Active", "Hold"] = "Ringing"
    direction: Literal["inbound", "outbound"] = "inbound"
    started_at: str = Field(default_factory=_now_iso)


class AntiFraudRule(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str = Field(default_factory=_uuid)
    nome: str
    tipo: Literal["max_channels_per_ip", "max_calls_per_minute", "destination_blocklist", "cost_limit"]
    valor: str  # depends on tipo
    acao: Literal["block", "alert"] = "block"
    enabled: bool = True
    created_at: str = Field(default_factory=_now_iso)


# ---------------------------------------------------------------------------
# App + Router
# ---------------------------------------------------------------------------
@asynccontextmanager
async def lifespan(app: FastAPI):
    # indexes
    await db.users.create_index("email", unique=True)
    await db.users.create_index("id", unique=True)
    await db.operadoras.create_index("id", unique=True)
    await db.ipbxs.create_index("id", unique=True)
    await db.rotas.create_index("id", unique=True)
    await db.acl.create_index("id", unique=True)
    await db.cdr.create_index("id", unique=True)
    await db.cdr.create_index("started_at")
    await db.live_channels.create_index("id", unique=True)
    await db.antifraud.create_index("id", unique=True)

    # seed admin
    existing = await db.users.find_one({"email": ADMIN_EMAIL})
    if not existing:
        await db.users.insert_one({
            "id": _uuid(),
            "email": ADMIN_EMAIL,
            "password_hash": hash_password(ADMIN_PASSWORD),
            "name": "Administrador",
            "role": "admin",
            "created_at": _now_iso(),
        })
        logger.info("Admin seeded: %s", ADMIN_EMAIL)
    else:
        if not verify_password(ADMIN_PASSWORD, existing["password_hash"]):
            await db.users.update_one({"email": ADMIN_EMAIL},
                                      {"$set": {"password_hash": hash_password(ADMIN_PASSWORD)}})
            logger.info("Admin password updated")

    # seed sample data (only once)
    if await db.operadoras.count_documents({}) == 0:
        await _seed_sample_data()

    # start background workers
    global esl_client
    tasks = []
    if FS_ESL_ENABLED:
        esl_client = ESLClient(FS_ESL_HOST, FS_ESL_PORT, FS_ESL_PASSWORD)
        tasks.append(asyncio.create_task(_esl_sync_loop()))
        logger.info("FreeSWITCH ESL integration ENABLED (%s:%s)", FS_ESL_HOST, FS_ESL_PORT)
    else:
        tasks.append(asyncio.create_task(_call_simulator()))
        logger.info("FreeSWITCH ESL disabled - running simulator")
    try:
        yield
    finally:
        for t in tasks:
            t.cancel()
        if esl_client:
            await esl_client.close()
        client.close()


app = FastAPI(title="SBC Manager API", lifespan=lifespan)
api = APIRouter(prefix="/api")


# ---------------------------------------------------------------------------
# Auth endpoints
# ---------------------------------------------------------------------------
@api.post("/auth/login")
async def login(payload: LoginIn, response: Response):
    email = payload.email.lower()
    user = await db.users.find_one({"email": email})
    if not user or not verify_password(payload.password, user["password_hash"]):
        raise HTTPException(status_code=401, detail="Credenciais inválidas")
    access = create_access_token(user["id"], user["email"], user["role"])
    refresh = create_refresh_token(user["id"])
    set_auth_cookies(response, access, refresh)
    return {
        "id": user["id"], "email": user["email"], "name": user["name"],
        "role": user["role"], "created_at": user["created_at"],
    }


@api.get("/auth/me")
async def me(user: dict = Depends(get_current_user)):
    return user


@api.post("/auth/logout")
async def logout(response: Response):
    response.delete_cookie("access_token", path="/")
    response.delete_cookie("refresh_token", path="/")
    return {"ok": True}


@api.post("/auth/refresh")
async def refresh_token(request: Request, response: Response):
    token = request.cookies.get("refresh_token")
    if not token:
        raise HTTPException(status_code=401, detail="Refresh token ausente")
    try:
        payload = jwt.decode(token, JWT_SECRET, algorithms=[JWT_ALGO])
        if payload.get("type") != "refresh":
            raise HTTPException(status_code=401, detail="Tipo inválido")
        user = await db.users.find_one({"id": payload["sub"]})
        if not user:
            raise HTTPException(status_code=401, detail="Usuário não encontrado")
        access = create_access_token(user["id"], user["email"], user["role"])
        response.set_cookie("access_token", access, httponly=True, secure=True,
                            samesite="none", max_age=8 * 3600, path="/")
        return {"ok": True}
    except jwt.InvalidTokenError:
        raise HTTPException(status_code=401, detail="Token inválido")


# ---------------------------------------------------------------------------
# Users CRUD
# ---------------------------------------------------------------------------
@api.get("/users")
async def list_users(_: dict = Depends(get_current_user)):
    return await db.users.find({}, {"_id": 0, "password_hash": 0}).sort("created_at", -1).to_list(1000)


@api.post("/users")
async def create_user(payload: UserCreate, _: dict = Depends(require_admin)):
    email = payload.email.lower()
    if await db.users.find_one({"email": email}):
        raise HTTPException(status_code=400, detail="Email já cadastrado")
    doc = {
        "id": _uuid(),
        "email": email,
        "password_hash": hash_password(payload.password),
        "name": payload.name,
        "role": payload.role,
        "created_at": _now_iso(),
    }
    await db.users.insert_one(doc)
    return {k: v for k, v in doc.items() if k not in ("password_hash", "_id")}


@api.delete("/users/{user_id}")
async def delete_user(user_id: str, current: dict = Depends(require_admin)):
    if user_id == current["id"]:
        raise HTTPException(status_code=400, detail="Não pode excluir a si mesmo")
    r = await db.users.delete_one({"id": user_id})
    if not r.deleted_count:
        raise HTTPException(status_code=404, detail="Usuário não encontrado")
    return {"ok": True}


# ---------------------------------------------------------------------------
# Generic CRUD helper
# ---------------------------------------------------------------------------
def make_crud(path: str, collection_name: str, Model):
    coll = db[collection_name]

    @api.get(f"/{path}")
    async def _list(_: dict = Depends(get_current_user)):
        return await coll.find({}, {"_id": 0}).sort("created_at", -1).to_list(2000)

    @api.post(f"/{path}")
    async def _create(payload: Model, _: dict = Depends(get_current_user)):
        doc = payload.model_dump()
        if not doc.get("id"):
            doc["id"] = _uuid()
        if not doc.get("created_at"):
            doc["created_at"] = _now_iso()
        await coll.insert_one(doc)
        doc.pop("_id", None)
        return doc

    @api.put(f"/{path}/{{item_id}}")
    async def _update(item_id: str, payload: Model, _: dict = Depends(get_current_user)):
        data = payload.model_dump(exclude_unset=True)
        data.pop("id", None)
        data.pop("created_at", None)
        r = await coll.update_one({"id": item_id}, {"$set": data})
        if not r.matched_count:
            raise HTTPException(status_code=404, detail="Não encontrado")
        return await coll.find_one({"id": item_id}, {"_id": 0})

    @api.delete(f"/{path}/{{item_id}}")
    async def _delete(item_id: str, _: dict = Depends(get_current_user)):
        r = await coll.delete_one({"id": item_id})
        if not r.deleted_count:
            raise HTTPException(status_code=404, detail="Não encontrado")
        return {"ok": True}


make_crud("operadoras", "operadoras", Operadora)
make_crud("ipbxs", "ipbxs", IPBX)
make_crud("rotas", "rotas", Rota)
make_crud("acl", "acl", ACLEntry)
make_crud("antifraud", "antifraud", AntiFraudRule)


# ---------------------------------------------------------------------------
# CDR
# ---------------------------------------------------------------------------
@api.get("/cdr")
async def list_cdr(
    _: dict = Depends(get_current_user),
    limit: int = Query(200, le=2000),
    disposition: Optional[str] = None,
    src: Optional[str] = None,
    dst: Optional[str] = None,
):
    q: dict = {}
    if disposition:
        q["disposition"] = disposition
    if src:
        q["src"] = {"$regex": src, "$options": "i"}
    if dst:
        q["dst"] = {"$regex": dst, "$options": "i"}
    return await db.cdr.find(q, {"_id": 0}).sort("started_at", -1).limit(limit).to_list(limit)


@api.get("/cdr/export.csv", response_class=PlainTextResponse)
async def export_cdr_csv(_: dict = Depends(get_current_user)):
    rows = await db.cdr.find({}, {"_id": 0}).sort("started_at", -1).limit(5000).to_list(5000)
    header = "call_id,src,dst,started_at,answered_at,ended_at,duration,billsec,disposition,direction,codec,hangup_cause\n"
    lines = [header]
    for r in rows:
        lines.append(",".join([
            str(r.get("call_id", "")), str(r.get("src", "")), str(r.get("dst", "")),
            str(r.get("started_at", "")), str(r.get("answered_at", "") or ""),
            str(r.get("ended_at", "") or ""), str(r.get("duration", 0)),
            str(r.get("billsec", 0)), str(r.get("disposition", "")),
            str(r.get("direction", "")), str(r.get("codec", "")),
            str(r.get("hangup_cause", "")),
        ]) + "\n")
    return "".join(lines)


# ---------------------------------------------------------------------------
# Live channels
# ---------------------------------------------------------------------------
@api.get("/live-channels")
async def list_live_channels(_: dict = Depends(get_current_user)):
    return await db.live_channels.find({}, {"_id": 0}).sort("started_at", -1).to_list(500)


@api.delete("/live-channels/{cid}")
async def kill_channel(cid: str, _: dict = Depends(get_current_user)):
    doc = await db.live_channels.find_one({"id": cid}, {"_id": 0})
    if not doc:
        raise HTTPException(status_code=404, detail="Canal não encontrado")

    # If ESL is enabled, kill the channel in FreeSWITCH by uuid.
    # Actual CDR will be written by mod_json_cdr webhook.
    if FS_ESL_ENABLED and esl_client:
        await esl_client.api(f"uuid_kill {doc.get('call_id') or cid}")
        await db.live_channels.delete_one({"id": cid})
        return {"ok": True, "source": "esl"}

    # Simulator path: delete + write CDR manually
    await db.live_channels.delete_one({"id": cid})
    started = datetime.fromisoformat(doc["started_at"])
    ended = datetime.now(timezone.utc)
    dur = int((ended - started).total_seconds())
    await db.cdr.insert_one({
        "id": _uuid(), "call_id": doc["call_id"], "src": doc["src"], "dst": doc["dst"],
        "src_ip": doc.get("src_ip"), "started_at": doc["started_at"],
        "answered_at": doc["started_at"], "ended_at": ended.isoformat(),
        "duration": dur, "billsec": dur, "codec": doc.get("codec", "PCMA"),
        "hangup_cause": "MANAGER_REQUEST",
        "disposition": "ANSWERED", "direction": doc.get("direction", "inbound"),
    })
    return {"ok": True, "source": "simulator"}


# ---------------------------------------------------------------------------
# Dashboard metrics
# ---------------------------------------------------------------------------
@api.get("/metrics/dashboard")
async def dashboard(_: dict = Depends(get_current_user)):
    now = datetime.now(timezone.utc)
    today = now.replace(hour=0, minute=0, second=0, microsecond=0).isoformat()
    total_today = await db.cdr.count_documents({"started_at": {"$gte": today}})
    answered = await db.cdr.count_documents({"started_at": {"$gte": today}, "disposition": "ANSWERED"})
    failed = await db.cdr.count_documents({"started_at": {"$gte": today},
                                            "disposition": {"$in": ["FAILED", "NO ANSWER", "BUSY", "CONGESTION"]}})
    asr = round((answered / total_today) * 100, 1) if total_today else 0.0
    active = await db.live_channels.count_documents({})
    operadoras_total = await db.operadoras.count_documents({})
    operadoras_online = await db.operadoras.count_documents({"status": "online"})
    ipbxs_total = await db.ipbxs.count_documents({})
    ipbxs_online = await db.ipbxs.count_documents({"status": "online"})
    acl_deny = await db.acl.count_documents({"tipo": "deny"})
    acl_allow = await db.acl.count_documents({"tipo": "allow"})

    # ACD (average call duration for answered)
    pipeline_acd = [
        {"$match": {"started_at": {"$gte": today}, "disposition": "ANSWERED"}},
        {"$group": {"_id": None, "avg": {"$avg": "$billsec"}}},
    ]
    acd_cur = db.cdr.aggregate(pipeline_acd)
    acd_val = 0
    async for r in acd_cur:
        acd_val = round(r.get("avg") or 0, 1)

    # calls per hour (last 24h)
    since_24h = (now - timedelta(hours=24)).isoformat()
    hourly = []
    for h in range(24):
        start = (now - timedelta(hours=23 - h)).replace(minute=0, second=0, microsecond=0)
        end = start + timedelta(hours=1)
        count = await db.cdr.count_documents({
            "started_at": {"$gte": start.isoformat(), "$lt": end.isoformat()}
        })
        hourly.append({"hour": start.strftime("%H:00"), "chamadas": count})

    # top destinations
    top_dest = []
    async for r in db.cdr.aggregate([
        {"$match": {"started_at": {"$gte": since_24h}}},
        {"$group": {"_id": {"$substr": ["$dst", 0, 4]}, "total": {"$sum": 1}}},
        {"$sort": {"total": -1}},
        {"$limit": 6},
    ]):
        top_dest.append({"prefixo": r["_id"], "total": r["total"]})

    return {
        "active_channels": active,
        "calls_today": total_today,
        "asr": asr,
        "acd": acd_val,
        "answered": answered,
        "failed": failed,
        "operadoras": {"total": operadoras_total, "online": operadoras_online},
        "ipbxs": {"total": ipbxs_total, "online": ipbxs_online},
        "acl": {"allow": acl_allow, "deny": acl_deny},
        "hourly": hourly,
        "top_destinations": top_dest,
        "server": {
            "uptime": "0d 0h",  # placeholder - filled in frontend from process start
            "version": "1.0.0",
        },
    }


# ---------------------------------------------------------------------------
# FreeSWITCH config generator
# ---------------------------------------------------------------------------
@api.get("/freeswitch/config", response_class=PlainTextResponse)
async def freeswitch_config(_: dict = Depends(get_current_user)):
    """Generate a bundled FreeSWITCH XML config from Operadoras + ACL + Rotas."""
    operadoras = await db.operadoras.find({"enabled": True}, {"_id": 0}).to_list(500)
    ipbxs = await db.ipbxs.find({"enabled": True}, {"_id": 0}).to_list(500)
    rotas = await db.rotas.find({"enabled": True}, {"_id": 0}).sort("prioridade", 1).to_list(1000)
    acls = await db.acl.find({}, {"_id": 0}).to_list(1000)

    op_map = {o["id"]: o for o in operadoras}
    ipbx_map = {i["id"]: i for i in ipbxs}

    parts: List[str] = []
    parts.append('<?xml version="1.0" encoding="UTF-8"?>')
    parts.append("<!-- SBC Manager - Auto-generated FreeSWITCH config -->")
    parts.append(f"<!-- Generated: {_now_iso()} -->")
    parts.append("<include>")

    # ACL
    parts.append('  <!-- ACL (/etc/freeswitch/autoload_configs/acl.conf.xml) -->')
    parts.append('  <configuration name="acl.conf" description="Network Lists">')
    parts.append('    <network-lists>')
    parts.append('      <list name="sbc_trusted" default="deny">')
    for a in acls:
        parts.append(f'        <node type="{a["tipo"]}" cidr="{a["ip"]}"/> <!-- {a.get("descricao","")} -->')
    parts.append('      </list>')
    parts.append('    </network-lists>')
    parts.append('  </configuration>')

    # Gateways (operadoras + ipbxs)
    parts.append('  <!-- Gateways (/etc/freeswitch/sip_profiles/external/*.xml) -->')
    parts.append('  <include>')
    for o in operadoras:
        parts.append(f'    <gateway name="op_{o["id"][:8]}">')
        parts.append(f'      <param name="username" value="{o.get("usuario") or ""}"/>')
        parts.append(f'      <param name="password" value="{o.get("senha") or ""}"/>')
        parts.append(f'      <param name="realm" value="{o["host"]}"/>')
        parts.append(f'      <param name="proxy" value="{o["host"]}:{o["porta"]}"/>')
        parts.append(f'      <param name="register" value="{"true" if o.get("usuario") else "false"}"/>')
        parts.append('      <param name="expire-seconds" value="600"/>')
        parts.append('      <param name="context" value="public"/>')
        parts.append('    </gateway>')
    for i in ipbxs:
        parts.append(f'    <gateway name="ipbx_{i["id"][:8]}">')
        parts.append(f'      <param name="realm" value="{i["host"]}"/>')
        parts.append(f'      <param name="proxy" value="{i["host"]}:{i["porta"]}"/>')
        parts.append('      <param name="register" value="false"/>')
        parts.append('      <param name="context" value="public"/>')
        parts.append('    </gateway>')
    parts.append('  </include>')

    # Dialplan (rotas LCR)
    parts.append('  <!-- Dialplan (/etc/freeswitch/dialplan/public/sbc_routes.xml) -->')
    parts.append('  <context name="public">')
    for r in rotas:
        op = op_map.get(r["operadora_id"])
        ipbx = ipbx_map.get(r.get("ipbx_id") or "")
        gw = f'op_{r["operadora_id"][:8]}' if op else ""
        target = f'ipbx_{r["ipbx_id"][:8]}' if ipbx else gw
        parts.append(f'    <extension name="rota_{r["id"][:8]}_{r["nome"]}">')
        parts.append(f'      <condition field="destination_number" expression="{r["padrao"]}">')
        parts.append('        <action application="set" data="hangup_after_bridge=true"/>')
        parts.append(f'        <action application="set" data="sbc_rota_id={r["id"]}"/>')
        parts.append(f'        <action application="bridge" data="sofia/gateway/{target}/$1"/>')
        parts.append('      </condition>')
        parts.append('    </extension>')
    parts.append('  </context>')

    parts.append("</include>")
    return "\n".join(parts)


# ---------------------------------------------------------------------------
# Install script (Ubuntu 24.04)
# ---------------------------------------------------------------------------
@api.get("/freeswitch/install-script", response_class=PlainTextResponse)
async def install_script(_: dict = Depends(get_current_user)):
    return """#!/usr/bin/env bash
# =============================================================
# SBC Manager - Instalação FreeSWITCH 1.10 no Ubuntu 24.04 LTS
# Execute como root:  sudo bash install-freeswitch.sh
# =============================================================
set -euo pipefail

echo "[1/7] Atualizando sistema..."
apt update && apt -y upgrade

echo "[2/7] Instalando dependências..."
apt -y install wget gnupg2 lsb-release ca-certificates curl \\
                sngrep tcpdump net-tools ufw fail2ban unzip

echo "[3/7] Adicionando repositório SignalWire (FreeSWITCH 1.10)..."
TOKEN="SUBSTITUA_PELO_SEU_TOKEN_SIGNALWIRE"
wget --http-user=signalwire --http-password=$TOKEN \\
    -O /usr/share/keyrings/signalwire-freeswitch-repo.gpg \\
    https://freeswitch.signalwire.com/repo/deb/debian-release/signalwire-freeswitch-repo.gpg
echo "machine freeswitch.signalwire.com login signalwire password $TOKEN" > /etc/apt/auth.conf
chmod 600 /etc/apt/auth.conf
echo "deb [signed-by=/usr/share/keyrings/signalwire-freeswitch-repo.gpg] https://freeswitch.signalwire.com/repo/deb/debian-release/ $(lsb_release -sc) main" \\
    > /etc/apt/sources.list.d/freeswitch.list
apt update

echo "[4/7] Instalando FreeSWITCH..."
apt -y install freeswitch-meta-all

echo "[5/7] Configurando firewall (UFW)..."
ufw allow 22/tcp
ufw allow 5060/udp   # SIP
ufw allow 5061/tcp   # SIP TLS
ufw allow 16384:32768/udp  # RTP
ufw --force enable

echo "[6/7] Baixando configuração gerada pelo SBC Manager..."
# Faça login no SBC Manager e baixe o XML pelo endpoint:
# curl -b cookies.txt https://SEU_SBC_MANAGER/api/freeswitch/config -o /etc/freeswitch/autoload_configs/sbc_manager.xml
# Depois inclua no freeswitch.xml principal, ou copie as seções manualmente.

echo "[7/7] Habilitando e iniciando FreeSWITCH..."
systemctl enable freeswitch
systemctl start freeswitch
systemctl status freeswitch --no-pager | head -n 15

echo "===================================================="
echo "FreeSWITCH instalado com sucesso!"
echo "CLI: fs_cli"
echo "Logs: journalctl -u freeswitch -f"
echo "===================================================="
"""


# ---------------------------------------------------------------------------
# FreeSWITCH real integration: status, CDR webhook, ESL sync
# ---------------------------------------------------------------------------
@api.get("/freeswitch/status")
async def freeswitch_status(_: dict = Depends(get_current_user)):
    return fs_state


@api.post("/freeswitch/reload")
async def freeswitch_reload(_: dict = Depends(get_current_user)):
    """Send reloadxml + reloadacl to FreeSWITCH via ESL."""
    if not FS_ESL_ENABLED or not esl_client:
        raise HTTPException(status_code=400, detail="ESL não habilitado")
    await esl_client.api("reloadxml")
    await esl_client.api("reloadacl")
    return {"ok": True}


@api.post("/cdr/webhook")
async def cdr_webhook(request: Request):
    """Receive CDR from mod_json_cdr (mounted on nginx as localhost-only).

    mod_json_cdr POSTs a large JSON with `variables`, `callflow`, etc.
    We extract the important fields and store them in db.cdr.
    """
    # Localhost-only guard (nginx should already restrict, but double-check)
    client_ip = request.client.host if request.client else ""
    if client_ip not in ("127.0.0.1", "::1", "localhost"):
        raise HTTPException(status_code=403, detail="webhook restrito ao localhost")

    try:
        body = await request.json()
    except Exception:
        # some mod_xml_cdr configs use form encoding
        raw = await request.body()
        try:
            import json as _json
            body = _json.loads(raw.decode("utf-8", errors="replace"))
        except Exception:
            raise HTTPException(status_code=400, detail="payload inválido")

    v = (body.get("variables") or {})
    _ = (body.get("callflow") or [{}])

    def _to_iso(us: str | None) -> str | None:
        if not us:
            return None
        try:
            # FreeSWITCH times are microseconds since epoch
            s = int(us) / 1_000_000
            return datetime.fromtimestamp(s, tz=timezone.utc).isoformat()
        except Exception:
            return None

    disposition_map = {
        "NORMAL_CLEARING": "ANSWERED",
        "NO_ANSWER": "NO ANSWER",
        "USER_BUSY": "BUSY",
        "CALL_REJECTED": "FAILED",
        "SUBSCRIBER_ABSENT": "NO ANSWER",
        "ORIGINATOR_CANCEL": "NO ANSWER",
        "NORMAL_TEMPORARY_FAILURE": "FAILED",
        "SWITCH_CONGESTION": "CONGESTION",
    }
    hangup = v.get("hangup_cause", "NORMAL_CLEARING")
    billsec = int(v.get("billsec", 0) or 0)
    disposition = "ANSWERED" if billsec > 0 and hangup == "NORMAL_CLEARING" else disposition_map.get(hangup, "FAILED")

    direction = v.get("direction") or v.get("call_direction") or "inbound"
    if direction not in ("inbound", "outbound"):
        direction = "inbound"

    doc = {
        "id": _uuid(),
        "call_id": v.get("uuid") or v.get("call_uuid") or _uuid(),
        "src": v.get("caller_id_number", "") or v.get("ani", ""),
        "dst": v.get("destination_number", ""),
        "src_ip": v.get("sip_network_ip") or v.get("network_addr"),
        "started_at": _to_iso(v.get("start_stamp") or v.get("start_epoch") and str(int(v["start_epoch"]) * 1_000_000)) or _now_iso(),
        "answered_at": _to_iso(v.get("answer_stamp") or v.get("answered_time")),
        "ended_at": _to_iso(v.get("end_stamp")) or _now_iso(),
        "duration": int(v.get("duration", 0) or 0),
        "billsec": billsec,
        "hangup_cause": hangup,
        "codec": v.get("read_codec", "PCMA"),
        "disposition": disposition,
        "direction": direction,
        "operadora_id": None,
        "ipbx_id": None,
    }
    await db.cdr.insert_one(doc)
    logger.info("CDR received via webhook: %s %s->%s (%s, %ds)",
                doc["call_id"][:8], doc["src"], doc["dst"], disposition, billsec)
    doc.pop("_id", None)
    return {"ok": True, "id": doc["id"]}


async def _esl_sync_loop() -> None:
    """Continuously sync live channels + status from FreeSWITCH via ESL."""
    import json as _json
    logger.info("ESL sync loop started")
    while True:
        try:
            if not esl_client:
                await asyncio.sleep(3)
                continue
            if not esl_client.connected:
                ok = await esl_client.connect()
                if not ok:
                    fs_state["esl_connected"] = False
                    fs_state["last_error"] = "Falha ao conectar no ESL"
                    await asyncio.sleep(5)
                    continue

            # Status
            status_out = await esl_client.api("status")
            if status_out:
                fs_state["esl_connected"] = True
                fs_state["last_error"] = None
                for line in status_out.splitlines():
                    line = line.strip()
                    if line.startswith("UP "):
                        fs_state["uptime"] = line.replace("UP", "").strip()
                    elif line.startswith("FreeSWITCH "):
                        fs_state["version"] = line

            # Channels
            channels_out = await esl_client.api("show channels as json")
            rows = []
            if channels_out:
                try:
                    data = _json.loads(channels_out)
                    rows = data.get("rows") or []
                except Exception:
                    rows = []
            fs_state["channels_count"] = len(rows)
            fs_state["last_sync"] = _now_iso()

            # Upsert into db.live_channels using FS uuid as `id`
            fs_uuids = set()
            for r in rows:
                uuid_ = r.get("uuid")
                if not uuid_:
                    continue
                fs_uuids.add(uuid_)
                # Map FS state to our status
                fs_state_name = (r.get("callstate") or r.get("state") or "").upper()
                status = "Active" if fs_state_name in ("ACTIVE", "CS_EXECUTE", "ANSWERED") \
                    else "Hold" if fs_state_name == "HELD" \
                    else "Ringing"
                doc = {
                    "id": uuid_,
                    "call_id": uuid_,
                    "src": r.get("cid_num") or "",
                    "dst": r.get("dest") or "",
                    "src_ip": r.get("ip_addr") or "",
                    "codec": r.get("read_codec") or "PCMA",
                    "operadora": r.get("presence_id") or "",
                    "ipbx": "",
                    "status": status,
                    "direction": (r.get("direction") or "inbound").lower(),
                    "started_at": r.get("created") or _now_iso(),
                }
                await db.live_channels.update_one({"id": uuid_}, {"$set": doc}, upsert=True)

            # Remove channels no longer active
            if fs_uuids:
                await db.live_channels.delete_many({"id": {"$nin": list(fs_uuids)}})
            else:
                await db.live_channels.delete_many({})

        except asyncio.CancelledError:
            break
        except Exception as e:
            logger.exception("ESL sync error: %s", e)
            fs_state["esl_connected"] = False
            fs_state["last_error"] = str(e)
            if esl_client:
                await esl_client.close()
            await asyncio.sleep(3)
        await asyncio.sleep(2)



# ---------------------------------------------------------------------------
# Simulator (mock live calls + CDR)
# ---------------------------------------------------------------------------
async def _seed_sample_data() -> None:
    now = _now_iso()
    ops = [
        {"id": _uuid(), "nome": "Vivo SIP Trunk", "host": "sip.vivo.com.br", "porta": 5060,
         "protocolo": "udp", "usuario": "vivo_user", "senha": "***", "codec": "PCMA,PCMU",
         "canais_max": 60, "prefixo": "0011", "enabled": True, "status": "online", "created_at": now},
        {"id": _uuid(), "nome": "Claro SIP", "host": "sip.claro.com.br", "porta": 5060,
         "protocolo": "udp", "usuario": "claro_user", "senha": "***", "codec": "G729,PCMA",
         "canais_max": 30, "prefixo": "0021", "enabled": True, "status": "online", "created_at": now},
        {"id": _uuid(), "nome": "Algar Telecom", "host": "sip.algar.com.br", "porta": 5060,
         "protocolo": "tcp", "usuario": "algar", "senha": "***", "codec": "PCMA",
         "canais_max": 20, "prefixo": "0031", "enabled": True, "status": "degraded", "created_at": now},
    ]
    await db.operadoras.insert_many([{**o} for o in ops])

    ipbxs = [
        {"id": _uuid(), "nome": "PBX Matriz SP", "host": "10.20.30.10", "porta": 5060,
         "protocolo": "udp", "codec": "PCMA,PCMU", "canais_max": 120, "enabled": True,
         "status": "online", "created_at": now},
        {"id": _uuid(), "nome": "PBX Filial RJ", "host": "10.20.31.10", "porta": 5060,
         "protocolo": "udp", "codec": "PCMA", "canais_max": 60, "enabled": True,
         "status": "online", "created_at": now},
    ]
    await db.ipbxs.insert_many([{**i} for i in ipbxs])

    acls = [
        {"id": _uuid(), "ip": "10.20.30.0/24", "tipo": "allow", "direcao": "both",
         "descricao": "Rede matriz SP", "created_at": now},
        {"id": _uuid(), "ip": "10.20.31.0/24", "tipo": "allow", "direcao": "both",
         "descricao": "Rede filial RJ", "created_at": now},
        {"id": _uuid(), "ip": "200.150.10.5", "tipo": "allow", "direcao": "inbound",
         "descricao": "IP público Vivo", "created_at": now},
        {"id": _uuid(), "ip": "45.83.66.0/24", "tipo": "deny", "direcao": "inbound",
         "descricao": "Rede maliciosa", "created_at": now},
    ]
    await db.acl.insert_many([{**a} for a in acls])

    rotas = [
        {"id": _uuid(), "nome": "Nacional Vivo", "padrao": "^0?[1-9][1-9][0-9]{8}$",
         "operadora_id": ops[0]["id"], "ipbx_id": ipbxs[0]["id"], "prioridade": 10,
         "custo": 0.09, "enabled": True, "created_at": now},
        {"id": _uuid(), "nome": "Nacional Claro", "padrao": "^0?[1-9][1-9][0-9]{8}$",
         "operadora_id": ops[1]["id"], "ipbx_id": ipbxs[0]["id"], "prioridade": 20,
         "custo": 0.11, "enabled": True, "created_at": now},
        {"id": _uuid(), "nome": "Móvel Algar", "padrao": "^0?[1-9][1-9]9[0-9]{8}$",
         "operadora_id": ops[2]["id"], "ipbx_id": ipbxs[1]["id"], "prioridade": 30,
         "custo": 0.14, "enabled": True, "created_at": now},
    ]
    await db.rotas.insert_many([{**r} for r in rotas])

    antifraud = [
        {"id": _uuid(), "nome": "Máx 10 canais por IP", "tipo": "max_channels_per_ip",
         "valor": "10", "acao": "block", "enabled": True, "created_at": now},
        {"id": _uuid(), "nome": "Máx 60 chamadas/min", "tipo": "max_calls_per_minute",
         "valor": "60", "acao": "alert", "enabled": True, "created_at": now},
        {"id": _uuid(), "nome": "Bloqueio internacional", "tipo": "destination_blocklist",
         "valor": "^00[0-9]+", "acao": "block", "enabled": True, "created_at": now},
    ]
    await db.antifraud.insert_many([{**r} for r in antifraud])

    # Seed some CDRs
    cdrs = []
    for i in range(80):
        started = datetime.now(timezone.utc) - timedelta(minutes=random.randint(1, 60 * 20))
        billsec = random.choice([0, random.randint(5, 320)])
        disposition = random.choices(
            ["ANSWERED", "NO ANSWER", "BUSY", "FAILED"], weights=[70, 15, 10, 5]
        )[0]
        cdrs.append({
            "id": _uuid(),
            "call_id": f"a-{uuid.uuid4().hex[:16]}",
            "src": f"+551133{random.randint(100000, 999999)}",
            "dst": f"+551{random.choice(['1','2','3'])}9{random.randint(10000000, 99999999)}",
            "operadora_id": random.choice(ops)["id"],
            "ipbx_id": random.choice(ipbxs)["id"],
            "src_ip": random.choice(["200.150.10.5", "10.20.30.15", "10.20.31.22"]),
            "started_at": started.isoformat(),
            "answered_at": (started + timedelta(seconds=random.randint(2, 15))).isoformat() if disposition == "ANSWERED" else None,
            "ended_at": (started + timedelta(seconds=billsec + 15)).isoformat(),
            "duration": billsec + 15,
            "billsec": billsec,
            "hangup_cause": random.choice(["NORMAL_CLEARING", "USER_BUSY", "NO_ANSWER", "ORIGINATOR_CANCEL"]),
            "codec": random.choice(["PCMA", "PCMU", "G729"]),
            "disposition": disposition,
            "direction": random.choice(["inbound", "outbound"]),
        })
    await db.cdr.insert_many(cdrs)


async def _call_simulator() -> None:
    """Every ~5s: promote a Ringing->Active or complete an Active call to CDR, and create a new one."""
    logger.info("Call simulator started")
    while True:
        try:
            await asyncio.sleep(random.uniform(3, 6))
            # advance ringing -> active
            ringing = await db.live_channels.find({"status": "Ringing"}, {"_id": 0}).to_list(50)
            for r in ringing:
                if random.random() < 0.65:
                    await db.live_channels.update_one({"id": r["id"]}, {"$set": {"status": "Active"}})
                else:
                    await db.live_channels.delete_one({"id": r["id"]})
                    # create no-answer CDR
                    started = datetime.fromisoformat(r["started_at"])
                    await db.cdr.insert_one({
                        "id": _uuid(), "call_id": r["call_id"], "src": r["src"], "dst": r["dst"],
                        "src_ip": r.get("src_ip"), "started_at": r["started_at"],
                        "answered_at": None, "ended_at": _now_iso(),
                        "duration": int((datetime.now(timezone.utc) - started).total_seconds()),
                        "billsec": 0, "codec": r.get("codec", "PCMA"),
                        "hangup_cause": "NO_ANSWER", "disposition": "NO ANSWER",
                        "direction": r.get("direction", "inbound"),
                    })
            # end some active calls (random)
            active_count = await db.live_channels.count_documents({"status": "Active"})
            if active_count > 0:
                for _ in range(random.randint(0, min(2, active_count))):
                    doc = await db.live_channels.find_one({"status": "Active"}, {"_id": 0})
                    if not doc:
                        break
                    started = datetime.fromisoformat(doc["started_at"])
                    dur = int((datetime.now(timezone.utc) - started).total_seconds())
                    if dur < 8:
                        continue
                    await db.live_channels.delete_one({"id": doc["id"]})
                    await db.cdr.insert_one({
                        "id": _uuid(), "call_id": doc["call_id"], "src": doc["src"], "dst": doc["dst"],
                        "src_ip": doc.get("src_ip"), "started_at": doc["started_at"],
                        "answered_at": doc["started_at"], "ended_at": _now_iso(),
                        "duration": dur, "billsec": max(0, dur - 3),
                        "codec": doc.get("codec", "PCMA"),
                        "hangup_cause": "NORMAL_CLEARING",
                        "disposition": "ANSWERED", "direction": doc.get("direction", "inbound"),
                    })

            # add new ringing call if under cap
            live_total = await db.live_channels.count_documents({})
            if live_total < 12 and random.random() < 0.8:
                ops = await db.operadoras.find({"enabled": True}, {"_id": 0}).to_list(20)
                ipbxs = await db.ipbxs.find({"enabled": True}, {"_id": 0}).to_list(20)
                if not ops or not ipbxs:
                    continue
                op = random.choice(ops)
                ipbx = random.choice(ipbxs)
                await db.live_channels.insert_one({
                    "id": _uuid(),
                    "call_id": f"a-{uuid.uuid4().hex[:16]}",
                    "src": f"+551133{random.randint(100000, 999999)}",
                    "dst": f"+551{random.choice(['1','2','3'])}9{random.randint(10000000, 99999999)}",
                    "src_ip": random.choice(["200.150.10.5", "10.20.30.15", "10.20.31.22", "177.20.31.4"]),
                    "codec": random.choice(["PCMA", "PCMU", "G729"]),
                    "operadora": op["nome"],
                    "ipbx": ipbx["nome"],
                    "status": "Ringing",
                    "direction": random.choice(["inbound", "outbound"]),
                    "started_at": _now_iso(),
                })
        except asyncio.CancelledError:
            break
        except Exception as e:
            logger.exception("simulator error: %s", e)


# ---------------------------------------------------------------------------
# Health
# ---------------------------------------------------------------------------
@api.get("/")
async def root():
    return {"service": "SBC Manager", "version": "1.0.0", "status": "ok"}


app.include_router(api)

# CORS: allow credentials + specific origin
_origin = os.environ.get("FRONTEND_URL", "*")
app.add_middleware(
    CORSMiddleware,
    allow_credentials=True,
    allow_origins=[_origin] if _origin != "*" else ["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)
