#!/usr/bin/env bash
# =====================================================================
# SBC Manager - Deploy completo em Ubuntu 24.04 LTS a partir do GitHub
# Repo: grupoicoreservices-cmyk/sbc-voxyra
#
# Uso (como root):
#   curl -fsSL https://raw.githubusercontent.com/grupoicoreservices-cmyk/sbc-voxyra/main/deploy.sh | sudo bash
#
# O que instala:
#   - Python 3.12, Node 20, Yarn, MongoDB 7, supervisor, nginx, ufw
#   - Clona o repositório para /opt/sbc-voxyra
#   - Instala dependências backend/frontend
#   - Cria backend/.env e frontend/.env
#   - Roda build de produção do frontend
#   - Configura supervisor para backend + serve estático
#   - Configura nginx como proxy reverso (porta 80)
#   - Abre firewall (22, 80, 443)
# =====================================================================
set -euo pipefail

REPO_URL="https://github.com/grupoicoreservices-cmyk/sbc-voxyra.git"
APP_DIR="/opt/sbc-voxyra"
DOMAIN="${DOMAIN:-_}"          # export DOMAIN=voxyra.example.com para usar seu domínio
ADMIN_EMAIL="${ADMIN_EMAIL:-admin@voxyra.local}"
ADMIN_PASSWORD="${ADMIN_PASSWORD:-Admin@2026}"

echo "======================================================================"
echo " SBC Voxyra - Instalação iniciada em $(date)"
echo "======================================================================"

# ---------------------------------------------------------------------
# 1. Sistema
# ---------------------------------------------------------------------
export DEBIAN_FRONTEND=noninteractive
apt-get update
apt-get -y install curl gnupg2 ca-certificates lsb-release git build-essential \
                   software-properties-common python3 python3-pip python3-venv \
                   supervisor nginx ufw unzip

# ---------------------------------------------------------------------
# 2. Node 20 + Yarn
# ---------------------------------------------------------------------
if ! command -v node >/dev/null 2>&1 || [[ "$(node -v | cut -c2-3)" -lt 20 ]]; then
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
# 4. Clonar repositório
# ---------------------------------------------------------------------
if [[ -d "$APP_DIR/.git" ]]; then
  echo "[*] Repositório já existe, atualizando..."
  git -C "$APP_DIR" pull --ff-only
else
  git clone "$REPO_URL" "$APP_DIR"
fi
cd "$APP_DIR"

# ---------------------------------------------------------------------
# 5. Backend
# ---------------------------------------------------------------------
cd "$APP_DIR/backend"
python3 -m venv .venv
source .venv/bin/activate
pip install --upgrade pip
pip install -r requirements.txt
deactivate

JWT_SECRET=$(python3 -c 'import secrets;print(secrets.token_hex(32))')
cat > "$APP_DIR/backend/.env" <<EOF
MONGO_URL="mongodb://localhost:27017"
DB_NAME="sbc_voxyra"
CORS_ORIGINS="*"
JWT_SECRET="${JWT_SECRET}"
ADMIN_EMAIL="${ADMIN_EMAIL}"
ADMIN_PASSWORD="${ADMIN_PASSWORD}"
FRONTEND_URL="http://${DOMAIN}"
EOF

# ---------------------------------------------------------------------
# 6. Frontend
# ---------------------------------------------------------------------
cd "$APP_DIR/frontend"
cat > .env <<EOF
REACT_APP_BACKEND_URL=http://${DOMAIN}
WDS_SOCKET_PORT=443
EOF
yarn install --frozen-lockfile || yarn install
yarn build

# ---------------------------------------------------------------------
# 7. Supervisor
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
# 8. Nginx (serve build estático + proxy /api -> 8001)
# ---------------------------------------------------------------------
cat > /etc/nginx/sites-available/sbc-voxyra <<EOF
server {
    listen 80 default_server;
    server_name ${DOMAIN};

    root ${APP_DIR}/frontend/build;
    index index.html;
    client_max_body_size 20M;

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
# 9. Firewall
# ---------------------------------------------------------------------
ufw allow 22/tcp
ufw allow 80/tcp
ufw allow 443/tcp
ufw --force enable

# ---------------------------------------------------------------------
# 10. Resumo
# ---------------------------------------------------------------------
IP=$(hostname -I | awk '{print $1}')
echo ""
echo "======================================================================"
echo " SBC Voxyra instalado com sucesso!"
echo "======================================================================"
echo "  URL:      http://${IP}/  (ou http://${DOMAIN}/ se DNS configurado)"
echo "  Admin:    ${ADMIN_EMAIL}"
echo "  Senha:    ${ADMIN_PASSWORD}"
echo ""
echo "  Backend:  supervisorctl status sbc-voxyra-backend"
echo "  Logs:     tail -f /var/log/sbc-voxyra-backend.*.log"
echo "  Nginx:    systemctl status nginx"
echo "  MongoDB:  systemctl status mongod"
echo ""
echo "  Para atualizar:  cd ${APP_DIR} && git pull && bash deploy.sh"
echo "======================================================================"
