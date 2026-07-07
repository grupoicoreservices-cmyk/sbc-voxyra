# SBC Manager - Product Requirements Document

## Original Problem Statement
> "Quero criar um servidor Session Board Controle voip aonde eu utilize ele para gerenciar as minhas conexões com as operadoras e encaminhar as ligações para meu IPBX externo com uma interface bem completa com segurança e controle de IPs que podem enviar e receber ligações."

## Product Overview
**SBC Manager** — Painel de gerenciamento web para Session Border Controller VoIP, em Português (Brasil). Gera automaticamente configurações FreeSWITCH que rodam em servidor Ubuntu 24.04 externo.

## Architecture
- **Backend:** FastAPI (Python) + MongoDB (motor async) + JWT auth (httpOnly cookies)
- **Frontend:** React 19 + React Router + Recharts + Tailwind + IBM Plex Sans / JetBrains Mono
- **SIP engine:** FreeSWITCH 1.10 externo (config XML gerada pelo painel)
- **Realtime:** simulador in-memory (asyncio task) para live channels — substituir por webhook do FreeSWITCH em produção

## User Personas
- **Administrador (admin)** — cria usuários, cadastra operadoras, IPBXs, rotas, ACL, gera FreeSWITCH config.
- **Operador (operator)** — visualiza dashboards, encerra chamadas ativas, exporta CDR.
- **Viewer (viewer)** — somente leitura.

## Core Features (Implemented — 2026-01-07)
- [x] Login JWT (email/senha) com httpOnly cookies, admin seed em `.env`
- [x] Sidebar colapsável + topbar com status do servidor, uptime, canais ativos ao vivo
- [x] **Dashboard** — Canais em uso, Chamadas hoje, ASR, ACD, gráficos (chamadas/hora 24h + top destinos)
- [x] **Operadoras (SIP Trunks)** — CRUD completo: nome, host, porta, protocolo (udp/tcp/tls), usuário, senha, codecs, canais máx, prefixo, status LED
- [x] **IPBX externos** — CRUD (destino para bridge)
- [x] **Rotas / LCR** — regex de destino, operadora + IPBX destino, prioridade (menor = maior), custo/min
- [x] **ACL** — IP/CIDR, allow/deny, direção (inbound/outbound/both)
- [x] **CDR** — filtros (origem, destino, disposição), export CSV, colunas: call_id, IPs, duração, billsec, codec, hangup cause
- [x] **Chamadas Ativas** — live table com LED pulsante para Ringing, botão Hangup (encerra e move para CDR)
- [x] **Anti-Fraude** — regras (max_channels_per_ip, max_calls_per_minute, destination_blocklist, cost_limit) com ação block/alert
- [x] **Configurações FreeSWITCH** — gerador XML completo (acl.conf + gateways + dialplan) + script de instalação Ubuntu 24.04 (SignalWire repo, UFW, systemd), tabs XML/Script com syntax highlighting e download
- [x] **Usuários** — admin cria/exclui usuários (admin/operator/viewer)
- [x] Simulador in-memory de chamadas (asyncio) — gera ringing → active → CDR continuamente
- [x] Seed automático (3 operadoras, 2 IPBXs, 4 ACL, 3 rotas, 3 anti-fraude, 80 CDRs)

## Testing
- Backend: 22/22 pytest cases passed (auth, CRUD, dashboard, FreeSWITCH generator, CDR export, live channels lifecycle)
- Frontend: todas as 10 seções navegam, CRUDs funcionam, download XML/CSV funcionam
- Test credentials: `admin@sbcmanager.com` / `Admin@2026`

## Prioritized Backlog (P0/P1/P2)
### P1 — Integração real com FreeSWITCH
- [ ] Webhook `mod_json_cdr` → `POST /api/cdr/webhook` para receber CDRs reais
- [ ] `mod_xml_curl` para servir dialplan/gateway dinamicamente
- [ ] Endpoint `/api/freeswitch/status` que consulta ESL (Event Socket) para saber uptime real, canais reais, uptime, load

### P1 — Segurança
- [ ] Brute-force lockout no login (5 falhas → 15 min)
- [ ] Auditoria: log de todas ações admin (create/delete)
- [ ] 2FA para admin

### P2 — Features avançadas
- [ ] Blacklist automática por IPs que quebram anti-fraude
- [ ] Gráfico de custo por operadora
- [ ] Notificações via Telegram/Discord quando ASR cai abaixo de X%
- [ ] Multi-tenant (empresas separadas)
- [ ] Página de PCAP capture (integração sngrep)

## Next Actions
1. Deploy do FreeSWITCH em VPS Ubuntu 24.04 usando script gerado
2. Configurar webhook CDR e endpoint /api/cdr/webhook para receber CDRs reais
3. Implementar ESL (Event Socket) para live channels reais
