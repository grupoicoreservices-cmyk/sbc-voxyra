"""SBC Manager - Backend API integration tests."""
import os
import re
import pytest
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "https://telecom-gateway-pro.preview.emergentagent.com").rstrip("/")
ADMIN_EMAIL = "admin@sbcmanager.com"
ADMIN_PASSWORD = "Admin@2026"


@pytest.fixture(scope="session")
def s():
    sess = requests.Session()
    sess.headers.update({"Content-Type": "application/json"})
    return sess


@pytest.fixture(scope="session")
def auth(s):
    r = s.post(f"{BASE_URL}/api/auth/login", json={"email": ADMIN_EMAIL, "password": ADMIN_PASSWORD})
    assert r.status_code == 200, r.text
    data = r.json()
    assert data["email"] == ADMIN_EMAIL
    assert data["role"] == "admin"
    # cookies set
    assert "access_token" in s.cookies or any(c.name == "access_token" for c in s.cookies)
    return data


# ---------------- Auth ----------------
class TestAuth:
    def test_login_bad(self):
        r = requests.post(f"{BASE_URL}/api/auth/login", json={"email": ADMIN_EMAIL, "password": "wrong"})
        assert r.status_code == 401

    def test_login_ok(self, auth):
        assert auth["id"]

    def test_me(self, s, auth):
        r = s.get(f"{BASE_URL}/api/auth/me")
        assert r.status_code == 200
        assert r.json()["email"] == ADMIN_EMAIL

    def test_me_without_cookie(self):
        r = requests.get(f"{BASE_URL}/api/auth/me")
        assert r.status_code == 401


# ---------------- Dashboard ----------------
class TestDashboard:
    def test_dashboard(self, s, auth):
        r = s.get(f"{BASE_URL}/api/metrics/dashboard")
        assert r.status_code == 200
        d = r.json()
        for k in ["active_channels", "calls_today", "asr", "acd", "operadoras", "ipbxs", "acl", "hourly", "top_destinations"]:
            assert k in d, f"missing {k}"
        assert len(d["hourly"]) == 24
        assert isinstance(d["operadoras"], dict)


# ---------------- CRUD sanity ----------------
@pytest.mark.parametrize("path", ["operadoras", "ipbxs", "rotas", "acl", "antifraud"])
class TestSeeded:
    def test_list(self, s, auth, path):
        r = s.get(f"{BASE_URL}/api/{path}")
        assert r.status_code == 200
        data = r.json()
        assert isinstance(data, list)
        assert len(data) > 0, f"{path} not seeded"


class TestOperadoraCRUD:
    def test_full_cycle(self, s, auth):
        payload = {"nome": "TEST_Operadora", "host": "sip.test.local", "porta": 5060,
                   "protocolo": "udp", "codec": "PCMA", "canais_max": 5,
                   "enabled": True, "status": "offline"}
        r = s.post(f"{BASE_URL}/api/operadoras", json=payload)
        assert r.status_code == 200, r.text
        item = r.json()
        oid = item["id"]
        assert item["nome"] == "TEST_Operadora"

        # GET verify persisted
        r = s.get(f"{BASE_URL}/api/operadoras")
        assert any(o["id"] == oid for o in r.json())

        # PUT
        payload["nome"] = "TEST_Operadora_upd"
        r = s.put(f"{BASE_URL}/api/operadoras/{oid}", json=payload)
        assert r.status_code == 200
        assert r.json()["nome"] == "TEST_Operadora_upd"

        # DELETE
        r = s.delete(f"{BASE_URL}/api/operadoras/{oid}")
        assert r.status_code == 200
        r = s.delete(f"{BASE_URL}/api/operadoras/{oid}")
        assert r.status_code == 404


class TestACLCRUD:
    def test_full_cycle(self, s, auth):
        payload = {"ip": "10.99.99.0/24", "tipo": "deny", "direcao": "inbound", "descricao": "TEST_acl"}
        r = s.post(f"{BASE_URL}/api/acl", json=payload)
        assert r.status_code == 200
        aid = r.json()["id"]
        r = s.delete(f"{BASE_URL}/api/acl/{aid}")
        assert r.status_code == 200


# ---------------- CDR ----------------
class TestCDR:
    def test_list(self, s, auth):
        r = s.get(f"{BASE_URL}/api/cdr")
        assert r.status_code == 200
        assert isinstance(r.json(), list)

    def test_filter(self, s, auth):
        r = s.get(f"{BASE_URL}/api/cdr?disposition=ANSWERED")
        assert r.status_code == 200
        for row in r.json():
            assert row["disposition"] == "ANSWERED"

    def test_export_csv(self, s, auth):
        r = s.get(f"{BASE_URL}/api/cdr/export.csv")
        assert r.status_code == 200
        assert "call_id,src,dst" in r.text


# ---------------- Live channels ----------------
class TestLiveChannels:
    def test_list(self, s, auth):
        r = s.get(f"{BASE_URL}/api/live-channels")
        assert r.status_code == 200
        assert isinstance(r.json(), list)


# ---------------- FreeSWITCH ----------------
class TestFreeswitch:
    def test_config(self, s, auth):
        r = s.get(f"{BASE_URL}/api/freeswitch/config")
        assert r.status_code == 200
        xml = r.text
        assert '<configuration name="acl.conf"' in xml
        assert re.search(r'<gateway name="op_', xml)
        assert re.search(r'<extension name="rota_', xml)

    def test_install_script(self, s, auth):
        r = s.get(f"{BASE_URL}/api/freeswitch/install-script")
        assert r.status_code == 200
        assert "#!/usr/bin/env bash" in r.text
        assert "Ubuntu 24.04" in r.text


# ---------------- Users ----------------
class TestUsers:
    def test_list(self, s, auth):
        r = s.get(f"{BASE_URL}/api/users")
        assert r.status_code == 200
        assert any(u["email"] == ADMIN_EMAIL for u in r.json())

    def test_create_and_delete(self, s, auth):
        payload = {"email": "test_op@sbcmanager.com", "password": "test123", "name": "Test Op", "role": "operator"}
        # cleanup previous
        r = s.get(f"{BASE_URL}/api/users")
        for u in r.json():
            if u["email"] == payload["email"]:
                s.delete(f"{BASE_URL}/api/users/{u['id']}")

        r = s.post(f"{BASE_URL}/api/users", json=payload)
        assert r.status_code == 200, r.text
        uid = r.json()["id"]
        assert r.json()["email"] == payload["email"]

        # delete
        r = s.delete(f"{BASE_URL}/api/users/{uid}")
        assert r.status_code == 200

    def test_cannot_delete_self(self, s, auth):
        r = s.delete(f"{BASE_URL}/api/users/{auth['id']}")
        assert r.status_code == 400


# ---------------- Logout ----------------
class TestLogout:
    def test_logout(self):
        sess = requests.Session()
        sess.post(f"{BASE_URL}/api/auth/login", json={"email": ADMIN_EMAIL, "password": ADMIN_PASSWORD})
        r = sess.post(f"{BASE_URL}/api/auth/logout")
        assert r.status_code == 200



# ---------------- FreeSWITCH iteration 2: status, reload, CDR webhook ----------------
LOCAL_BASE = "http://localhost:8001"


class TestFsStatus:
    def test_status_shape(self, s, auth):
        r = s.get(f"{BASE_URL}/api/freeswitch/status")
        assert r.status_code == 200, r.text
        d = r.json()
        assert d["esl_enabled"] is False
        assert d["source"] == "simulator"
        assert d["esl_connected"] is False
        assert d["channels_count"] == 0
        for k in ["uptime", "version", "last_error", "last_sync"]:
            assert k in d

    def test_reload_disabled(self, s, auth):
        r = s.post(f"{BASE_URL}/api/freeswitch/reload")
        assert r.status_code == 400
        assert "ESL" in r.json().get("detail", "")

    def test_status_requires_auth(self):
        r = requests.get(f"{BASE_URL}/api/freeswitch/status")
        assert r.status_code == 401


class TestCdrWebhook:
    def test_webhook_answered(self, s, auth):
        payload = {"variables": {
            "uuid": "wh-test-answered-1", "caller_id_number": "+5511999990001",
            "destination_number": "+552133330001", "billsec": "30", "duration": "35",
            "hangup_cause": "NORMAL_CLEARING", "read_codec": "PCMA",
            "direction": "inbound", "start_epoch": "1750000000",
        }}
        r = requests.post(f"{LOCAL_BASE}/api/cdr/webhook", json=payload)
        assert r.status_code == 200, r.text
        j = r.json()
        assert j["ok"] is True and j["id"]
        # verify persisted via API (authenticated) - use high limit since start_epoch is old
        r2 = s.get(f"{BASE_URL}/api/cdr?limit=2000")
        rows = r2.json()
        found = [x for x in rows if x.get("call_id") == "wh-test-answered-1"]
        assert found, "CDR not persisted"
        assert found[0]["disposition"] == "ANSWERED"
        assert found[0]["billsec"] == 30
        assert found[0]["codec"] == "PCMA"

    def test_webhook_no_answer(self):
        payload = {"variables": {
            "uuid": "wh-test-noans-1", "caller_id_number": "+5511",
            "destination_number": "+5521", "billsec": "0", "duration": "10",
            "hangup_cause": "NO_ANSWER",
        }}
        r = requests.post(f"{LOCAL_BASE}/api/cdr/webhook", json=payload)
        assert r.status_code == 200
        assert r.json()["ok"] is True

    def test_webhook_busy(self, s, auth):
        payload = {"variables": {
            "uuid": "wh-test-busy-1", "caller_id_number": "+5511",
            "destination_number": "+5521", "billsec": "0",
            "hangup_cause": "USER_BUSY",
        }}
        r = requests.post(f"{LOCAL_BASE}/api/cdr/webhook", json=payload)
        assert r.status_code == 200
        # verify disposition
        rows = s.get(f"{BASE_URL}/api/cdr").json()
        found = [x for x in rows if x.get("call_id") == "wh-test-busy-1"]
        assert found and found[0]["disposition"] == "BUSY"

    def test_webhook_no_answer_disposition(self, s, auth):
        rows = s.get(f"{BASE_URL}/api/cdr").json()
        found = [x for x in rows if x.get("call_id") == "wh-test-noans-1"]
        assert found and found[0]["disposition"] == "NO ANSWER"

    def test_webhook_blocks_external(self):
        # Public URL hits webhook through ingress -> non-localhost -> 403
        payload = {"variables": {"uuid": "wh-ext", "hangup_cause": "NORMAL_CLEARING"}}
        r = requests.post(f"{BASE_URL}/api/cdr/webhook", json=payload)
        assert r.status_code == 403
        assert "localhost" in r.json().get("detail", "").lower()

    def test_webhook_invalid_json(self):
        r = requests.post(f"{LOCAL_BASE}/api/cdr/webhook",
                          data="not json{", headers={"Content-Type": "application/json"})
        assert r.status_code == 400


class TestLiveChannelsSourceSimulator:
    def test_delete_returns_simulator(self, s, auth):
        # ensure at least one live channel exists (simulator populates them)
        import time
        rows = []
        for _ in range(10):
            rows = s.get(f"{BASE_URL}/api/live-channels").json()
            if rows:
                break
            time.sleep(1)
        if not rows:
            pytest.skip("no live channels available from simulator")
        cid = rows[0]["id"]
        r = s.delete(f"{BASE_URL}/api/live-channels/{cid}")
        assert r.status_code == 200
        body = r.json()
        assert body.get("source") == "simulator"
