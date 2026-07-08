# SBC Voxyra / SBC Manager - Product Requirements Document

## Original Problem Statement
> "Quero criar um servidor Session Board Controle voip aonde eu utilize ele para gerenciar as minhas conexões com as operadoras e encaminhar as ligações para meu IPBX externo com uma interface bem completa com segurança e controle de IPs que podem enviar e receber ligações."

## Product Overview
**SBC Voxyra** — Painel de gerenciamento web para Session Border Controller VoIP em Português (Brasil), com backend Python/FastAPI + MongoDB, frontend React em tema claro, e **integração real com FreeSWITCH via ESL + webhook CDR**.

## Architecture
- **Backend:** FastAPI + Motor async MongoDB + JWT httpOnly cookies + ESL client asyncio nativo
- **Frontend:** React 19 + React Router 7 + Recharts + Tailwind + IBM Plex Sans / JetBrains Mono
- **SIP engine:** FreeSWITCH 1.10 (SignalWire) rodando no mesmo servidor
- **Realtime:** ESL polling (2s) → sincroniza `db.live_channels` com FreeSWITCH real
- **CDR:** mod_json_cdr posta em `POST /api/cdr/webhook` (localhost-only via nginx)
- **Deploy:** script `deploy.sh` one-shot para Ubuntu 24.04

## User Personas
- **Administrador (admin)** — CRUD tudo, gera XML, recarrega FreeSWITCH via ESL
- **Operador (operator)** — visualiza, encerra chamadas ao vivo (uuid_kill via ESL)
- **Viewer (viewer)** — somente leitura

## Iteration 1 — MVP (concluído 2026-01-07)
- [x] Login JWT com httpOnly cookies + admin seed
- [x] Sidebar + topbar + uptime + canais ativos ao vivo
- [x] Dashboard com métricas + gráficos Recharts (24h + top destinos)
- [x] CRUD: Operadoras, IPBX externos, Rotas/LCR, ACL, Anti-Fraude, Usuários
- [x] CDR com filtros e export CSV
- [x] Chamadas Ativas com hangup e LED pulsante
- [x] FreeSWITCH XML config generator + script Ubuntu 24 install
- [x] Simulador in-memory de chamadas ao vivo
- [x] Seed automático (3 op, 2 ipbx, 4 acl, 3 rotas, 3 antifraud, 80 CDRs)

## Iteration 2 — Tema claro + Integração real FreeSWITCH (concluído 2026-01-08)
- [x] Conversão completa para tema claro (light NOC dashboard)
- [x] ESL client asyncio nativo (`backend/esl.py`) — auth, api, bgapi
- [x] Background task `_esl_sync_loop` — polling de `show channels as json` a cada 2s, upsert em `db.live_channels`
- [x] Endpoint `GET /api/freeswitch/status` — esl_connected, uptime, version, channels_count
- [x] Endpoint `POST /api/freeswitch/reload` — envia `reloadxml` + `reloadacl` via ESL
- [x] Endpoint `POST /api/cdr/webhook` — recebe JSON de mod_json_cdr, extrai campos e insere em `db.cdr`, com mapping de hangup_cause → disposition (localhost-only)
- [x] DELETE `/api/live-channels/{cid}` usa `uuid_kill` via ESL quando enabled
- [x] Dashboard card "FreeSWITCH Engine" mostrando modo ESL/Simulator, uptime, canais no FS, último sync
- [x] Página FreeSWITCH: status strip + botão "Recarregar FS" (só quando ESL enabled)
- [x] Chamadas Ativas: badge SIMULATOR / ESL LIVE / ESL DOWN
- [x] `deploy.sh` one-shot atualizado: instala FreeSWITCH 1.10 (SignalWire), configura event_socket + json_cdr + acl + modules automaticamente, gera senha ESL aleatória, nginx bloqueia webhook para requests externos
- [x] 32/32 testes backend passando; frontend 100%

## Testing
- Iteration 1: 22/22 backend, 100% frontend
- Iteration 2: 32/32 backend (10 novos), 100% frontend
- Credenciais: `admin@sbcmanager.com` / `Admin@2026`

## Iteration 3 — Backlog / Próximas features
### P1
- [ ] mod_xml_curl: painel serve dialplan dinâmico (o FS busca a cada chamada em vez de baixar XML)
- [ ] Brute-force lockout no login (5 tentativas → 15min)
- [ ] Auditoria: log de todas ações admin
- [ ] Notificações Telegram/Discord (ASR baixo, IP bloqueado por anti-fraude)

### P2
- [ ] SSL/TLS automático via Let's Encrypt no deploy.sh (certbot)
- [ ] Multi-tenant (empresas separadas)
- [ ] Gráfico de custo por operadora
- [ ] 2FA para admin
- [ ] Integração PCAP capture (sngrep)

## Deploy
Comando único no Ubuntu 24.04 (o usuário precisa criar conta grátis no SignalWire para obter token):
```bash
curl -fsSL https://raw.githubusercontent.com/grupoicoreservices-cmyk/sbc-voxyra/main/deploy.sh \
  | sudo FS_SIGNALWIRE_TOKEN=xxx DOMAIN=sbc.example.com bash
```

Isso instala: Python 3.12, Node 20, MongoDB 7, FreeSWITCH 1.10, supervisor, nginx (com proxy reverso + webhook localhost-only), UFW (SIP 5060/udp, RTP 16384-32768/udp) e configura tudo automaticamente.
