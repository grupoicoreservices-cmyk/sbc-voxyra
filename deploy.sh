#!/usr/bin/env bash
# =====================================================================
# SBC Voxyra - Deploy completo em Ubuntu 24.04 LTS a partir do GitHub
# Repo: grupoicoreservices-cmyk/sbc-voxyra
#
# Uso (como root):
#   curl -fsSL https://raw.githubusercontent.com/grupoicoreservices-cmyk/sbc-voxyra/main/deploy.sh \
#     | sudo FS_SIGNALWIRE_TOKEN=seu_token DOMAIN=voxyra.example.com bash
#
# O que instala:
#   - Python 3.12, Node 20, Yarn, MongoDB 7, supervisor, nginx, ufw
#   - FreeSWITCH 1.10 (SignalWire repo) + módulos essenciais
#   - Clona o repo em /opt/sbc-voxyra
#   - Configura backend .env com JWT_SECRET e FS_ESL_PASSWORD aleatórios
#   - Instala frontend build de produção
#   - Configura supervisor + nginx (proxy + serve estático)
#   - Configura FreeSWITCH:
#       * event_socket.conf.xml (ESL localhost com senha aleatória)
#       * json_cdr.conf.xml (webhook para http://127.0.0.1/api/cdr/webhook)
#       * autoload.conf modules (sofia, dialplan_xml, xml_cdr, json_cdr, event_socket, commands)
#       * ACL básica localhost
#   - Nginx bloqueia /api/cdr/webhook para requests externos (localhost-only)
#   - Firewall UFW: 22, 80, 443, 5060/udp, 5061/tcp, 16384-32768/udp
# =====================================================================
set -euo pipefail

REPO_URL="https://github.com/grupoicoreservices-cmyk/sbc-voxyra.git"
APP_DIR="/opt/sbc-voxyra"
DOMAIN="${DOMAIN:-_}"
ADMIN_EMAIL="${ADMIN_EMAIL:-admin@voxyra.local}"
ADMIN_PASSWORD="${ADMIN_PASSWORD:-Admin@2026}"
FS_SIGNALWIRE_TOKEN="${FS_SIGNALWIRE_TOKEN:-}"

if [[ -z "$FS_SIGNALWIRE_TOKEN" ]]; then
  echo "!! Variável FS_SIGNALWIRE_TOKEN não definida."
  echo "   Registre-se GRÁTIS em https://signalwire.com/signup e cole o token pessoal."
  echo "   Exemplo:  sudo FS_SIGNALWIRE_TOKEN=xxxxxxxx bash deploy.sh"
  exit 1
fi

echo "======================================================================"
echo " SBC Voxyra - Instalação em $(date)"
echo "======================================================================"

# ---------------------------------------------------------------------
# 1. Sistema base
# ---------------------------------------------------------------------
export DEBIAN_FRONTEND=noninteractive
apt-get update
apt-get -y install curl gnupg2 ca-certificates lsb-release git build-essential \
                   software-properties-common python3 python3-pip python3-venv \
                   supervisor nginx ufw unzip sngrep tcpdump net-tools wget \
                   apt-transport-https

# ---------------------------------------------------------------------
# 2. Node 20 + Yarn
# ---------------------------------------------------------------------
if ! command -v node >/dev/null 2>&1 || [[ "$(node -v | cut -d. -f1 | tr -d v)" -lt 20 ]]; then
  curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
  apt-get -y install nodejs
fi
npm install -g yarn

# ---------------------------------------------------------------------
# 3. MongoDB 7
# ---------------------------------------------------------------------
if ! command -v mongod >/dev/null 2>&1; then
  curl -fsSL https://www.mongodb.org/static/pgp/server-7.0.asc | \
    gpg -o /usr/share/keyrings/mongodb-server-7.0.gpg --dearmor
  echo "deb [ arch=amd64,arm64 signed-by=/usr/share/keyrings/mongodb-server-7.0.gpg ] https://repo.mongodb.org/apt/ubuntu jammy/mongodb-org/7.0 multiverse" \
    > /etc/apt/sources.list.d/mongodb-org-7.0.list
  apt-get update
  apt-get -y install mongodb-org
fi
systemctl enable --now mongod

# ---------------------------------------------------------------------
# 4. FreeSWITCH 1.10 (SignalWire)
# ---------------------------------------------------------------------
if ! command -v freeswitch >/dev/null 2>&1; then
  # Ubuntu 24.04 fix: SignalWire packages target Debian bookworm which needs
  # libjpeg62-turbo, but noble ships only libjpeg-turbo8. Grab the .deb from
  # Debian bookworm to satisfy the mod_spandsp dependency chain.
  if ! dpkg -l 2>/dev/null | grep -q libjpeg62-turbo; then
    echo "[*] Instalando libjpeg62-turbo (workaround Ubuntu 24.04)..."
    cd /tmp
    ARCH=$(dpkg --print-architecture)
    wget -q "http://ftp.debian.org/debian/pool/main/libj/libjpeg-turbo/libjpeg62-turbo_2.1.5-2_${ARCH}.deb" \
      -O libjpeg62-turbo.deb || \
      wget -q "http://ftp.debian.org/debian/pool/main/libj/libjpeg-turbo/libjpeg62-turbo_2.1.5-2+deb12u1_${ARCH}.deb" \
      -O libjpeg62-turbo.deb
    apt-get -y install ./libjpeg62-turbo.deb
    rm -f libjpeg62-turbo.deb
  fi

  wget --http-user=signalwire --http-password="$FS_SIGNALWIRE_TOKEN" \
      -O /usr/share/keyrings/signalwire-freeswitch-repo.gpg \
      https://freeswitch.signalwire.com/repo/deb/debian-release/signalwire-freeswitch-repo.gpg
  cat > /etc/apt/auth.conf <<EOF
machine freeswitch.signalwire.com login signalwire password $FS_SIGNALWIRE_TOKEN
EOF
  chmod 600 /etc/apt/auth.conf
  # SignalWire ainda distribui via bookworm; funciona no Ubuntu 24 com o libjpeg62 acima
  echo "deb [signed-by=/usr/share/keyrings/signalwire-freeswitch-repo.gpg] https://freeswitch.signalwire.com/repo/deb/debian-release/ bookworm main" \
      > /etc/apt/sources.list.d/freeswitch.list
  apt-get update
  apt-get -y install freeswitch-meta-vanilla freeswitch-mod-json-cdr freeswitch-mod-event-socket freeswitch-mod-commands
fi

# ---------------------------------------------------------------------
# 5. Clonar repositório
# ---------------------------------------------------------------------
if [[ -d "$APP_DIR/.git" ]]; then
  echo "[*] Repositório já existe, atualizando..."
  git -C "$APP_DIR" pull --ff-only
else
  git clone "$REPO_URL" "$APP_DIR"
fi
cd "$APP_DIR"

# ---------------------------------------------------------------------
# 6. Backend
# ---------------------------------------------------------------------
cd "$APP_DIR/backend"
python3 -m venv .venv
source .venv/bin/activate
pip install --upgrade pip
pip install -r requirements.txt
deactivate

JWT_SECRET=$(python3 -c 'import secrets;print(secrets.token_hex(32))')
FS_ESL_PASSWORD=$(python3 -c 'import secrets;print(secrets.token_urlsafe(24))')

cat > "$APP_DIR/backend/.env" <<EOF
MONGO_URL="mongodb://localhost:27017"
DB_NAME="sbc_voxyra"
CORS_ORIGINS="*"
JWT_SECRET="${JWT_SECRET}"
ADMIN_EMAIL="${ADMIN_EMAIL}"
ADMIN_PASSWORD="${ADMIN_PASSWORD}"
FRONTEND_URL="http://${DOMAIN}"
FS_ESL_ENABLED="true"
FS_ESL_HOST="127.0.0.1"
FS_ESL_PORT="8021"
FS_ESL_PASSWORD="${FS_ESL_PASSWORD}"
EOF

# ---------------------------------------------------------------------
# 7. Frontend
# ---------------------------------------------------------------------
cd "$APP_DIR/frontend"
cat > .env <<EOF
REACT_APP_BACKEND_URL=http://${DOMAIN}
WDS_SOCKET_PORT=443
EOF
yarn install --frozen-lockfile || yarn install
yarn build

# ---------------------------------------------------------------------
# 8. Supervisor - backend
# ---------------------------------------------------------------------
cat > /etc/supervisor/conf.d/sbc-voxyra-backend.conf <<EOF
[program:sbc-voxyra-backend]
command=${APP_DIR}/backend/.venv/bin/uvicorn server:app --host 0.0.0.0 --port 8001
directory=${APP_DIR}/backend
autostart=true
autorestart=true
stderr_logfile=/var/log/sbc-voxyra-backend.err.log
stdout_logfile=/var/log/sbc-voxyra-backend.out.log
environment=PATH="${APP_DIR}/backend/.venv/bin"
EOF
supervisorctl reread
supervisorctl update
supervisorctl restart sbc-voxyra-backend || true

# ---------------------------------------------------------------------
# 9. Nginx (frontend + proxy /api + webhook localhost-only)
# ---------------------------------------------------------------------
cat > /etc/nginx/sites-available/sbc-voxyra <<EOF
server {
    listen 80 default_server;
    server_name ${DOMAIN};

    root ${APP_DIR}/frontend/build;
    index index.html;
    client_max_body_size 20M;

    # CDR webhook - restrito ao localhost (FreeSWITCH roda no mesmo host)
    location = /api/cdr/webhook {
        allow 127.0.0.1;
        allow ::1;
        deny all;
        proxy_pass http://127.0.0.1:8001;
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
    }

    location /api/ {
        proxy_pass http://127.0.0.1:8001;
        proxy_http_version 1.1;
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
        proxy_read_timeout 300s;
    }

    location / {
        try_files \$uri \$uri/ /index.html;
    }
}
EOF
ln -sf /etc/nginx/sites-available/sbc-voxyra /etc/nginx/sites-enabled/sbc-voxyra
rm -f /etc/nginx/sites-enabled/default
nginx -t
systemctl enable --now nginx
systemctl reload nginx

# ---------------------------------------------------------------------
# 10. FreeSWITCH - configuração
# ---------------------------------------------------------------------
FS_CFG=/etc/freeswitch

# event_socket com nossa senha
cat > $FS_CFG/autoload_configs/event_socket.conf.xml <<EOF
<configuration name="event_socket.conf" description="Socket Client">
  <settings>
    <param name="nat-map" value="false"/>
    <param name="listen-ip" value="127.0.0.1"/>
    <param name="listen-port" value="8021"/>
    <param name="password" value="${FS_ESL_PASSWORD}"/>
    <param name="apply-inbound-acl" value="loopback.auto"/>
  </settings>
</configuration>
EOF

# json_cdr webhook
cat > $FS_CFG/autoload_configs/json_cdr.conf.xml <<EOF
<configuration name="json_cdr.conf" description="JSON CDR">
  <settings>
    <param name="url" value="http://127.0.0.1/api/cdr/webhook"/>
    <param name="log-dir" value="/var/log/freeswitch/json_cdr"/>
    <param name="err-log-dir" value="/var/log/freeswitch/json_cdr_err"/>
    <param name="log-b-leg" value="false"/>
    <param name="prefix-a-leg" value="true"/>
    <param name="encode" value="false"/>
    <param name="retries" value="5"/>
    <param name="delay" value="5"/>
    <param name="rotate" value="true"/>
    <param name="timeout" value="10"/>
    <param name="disable-100-continue" value="true"/>
  </settings>
</configuration>
EOF

mkdir -p /var/log/freeswitch/json_cdr /var/log/freeswitch/json_cdr_err
chown -R freeswitch:freeswitch /var/log/freeswitch/json_cdr /var/log/freeswitch/json_cdr_err || true

# Habilitar módulos essenciais no modules.conf.xml
python3 - <<'PYEOF'
import re, pathlib
p = pathlib.Path("/etc/freeswitch/autoload_configs/modules.conf.xml")
if not p.exists():
    raise SystemExit(0)
txt = p.read_text()
required = ["mod_console","mod_logfile","mod_sofia","mod_dialplan_xml",
            "mod_commands","mod_event_socket","mod_json_cdr","mod_dptools",
            "mod_hash","mod_expr","mod_esf","mod_fsv","mod_valet_parking",
            "mod_httapi","mod_curl","mod_xml_curl","mod_tone_stream",
            "mod_sndfile","mod_native_file","mod_local_stream","mod_g723_1",
            "mod_g729","mod_amr","mod_b64","mod_spandsp"]
for mod in required:
    if mod not in txt:
        txt = txt.replace("</modules>", f'  <load module="{mod}"/>\n</modules>')
    else:
        # ensure not commented out
        txt = re.sub(r"<!--\s*<load\s+module=\"" + re.escape(mod) + r"\"\s*/>\s*-->",
                     f'<load module="{mod}"/>', txt)
p.write_text(txt)
PYEOF

# ACL básica: incluir 127.0.0.1 + rede local
cat > $FS_CFG/autoload_configs/acl.conf.xml <<'EOF'
<configuration name="acl.conf" description="Network Lists">
  <network-lists>
    <list name="sbc_trusted" default="deny">
      <node type="allow" cidr="127.0.0.0/8"/>
      <node type="allow" cidr="10.0.0.0/8"/>
      <node type="allow" cidr="172.16.0.0/12"/>
      <node type="allow" cidr="192.168.0.0/16"/>
    </list>
  </network-lists>
</configuration>
EOF

# Baixar sbc_manager.xml gerado pelo painel (gateways + dialplan) — opcional
# O admin pode fazer isso depois via curl -b cookies.txt /api/freeswitch/config
mkdir -p $FS_CFG/dialplan/public
cat > $FS_CFG/dialplan/public/00_sbc_placeholder.xml <<'EOF'
<!-- Dialplan placeholder. Baixe o real do painel SBC Voxyra:
     curl -b cookies.txt http://localhost/api/freeswitch/config > /etc/freeswitch/sbc_manager.xml
     e depois inclua no freeswitch.xml principal via <X-PRE-PROCESS cmd="include" data="sbc_manager.xml"/>
-->
<include>
  <context name="public">
    <extension name="hello_world">
      <condition field="destination_number" expression="^9196$">
        <action application="answer"/>
        <action application="playback" data="ivr/ivr-welcome_to_freeswitch.wav"/>
        <action application="hangup"/>
      </condition>
    </extension>
  </context>
</include>
EOF

# freeswitch executa como user 'freeswitch'
chown -R freeswitch:freeswitch $FS_CFG

systemctl enable freeswitch
systemctl restart freeswitch
sleep 3
systemctl status freeswitch --no-pager | head -n 8 || true

# ---------------------------------------------------------------------
# 11. Firewall UFW
# ---------------------------------------------------------------------
ufw allow 22/tcp
ufw allow 80/tcp
ufw allow 443/tcp
ufw allow 5060/udp   # SIP
ufw allow 5060/tcp
ufw allow 5061/tcp   # SIP TLS
ufw allow 16384:32768/udp  # RTP
ufw --force enable

# ---------------------------------------------------------------------
# 12. Restart backend to pick up new .env with FS_ESL_ENABLED=true
# ---------------------------------------------------------------------
supervisorctl restart sbc-voxyra-backend
sleep 2

# ---------------------------------------------------------------------
# 13. Resumo final
# ---------------------------------------------------------------------
IP=$(hostname -I | awk '{print $1}')
cat <<EOF

======================================================================
 SBC Voxyra instalado com SUCESSO em $(date)
======================================================================

 Painel Web:     http://${IP}/  (ou http://${DOMAIN}/ se DNS ok)
 Admin:          ${ADMIN_EMAIL}
 Senha:          ${ADMIN_PASSWORD}

 FreeSWITCH ESL:  127.0.0.1:8021
 ESL password:    ${FS_ESL_PASSWORD}   (salvo em ${APP_DIR}/backend/.env)
 CDR webhook:     http://127.0.0.1/api/cdr/webhook (localhost-only)

 Serviços:
   supervisorctl status sbc-voxyra-backend
   systemctl status freeswitch
   systemctl status nginx
   systemctl status mongod

 Logs:
   tail -f /var/log/sbc-voxyra-backend.*.log
   tail -f /var/log/freeswitch/freeswitch.log
   journalctl -u freeswitch -f

 FreeSWITCH CLI:  fs_cli
   > status
   > show channels
   > sofia status

 Atualizar:  cd ${APP_DIR} && git pull && bash deploy.sh

======================================================================
EOF
