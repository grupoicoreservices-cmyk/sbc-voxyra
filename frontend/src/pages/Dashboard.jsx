import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, BarChart, Bar } from "recharts";
import { PhoneCall, TrendingUp, Clock, ShieldCheck, ShieldAlert, Radio, Server, PhoneMissed, Cpu, Wifi, WifiOff } from "lucide-react";

function StatCard({ label, value, sub, icon: Icon, color = "text-[color:var(--text-primary)]", testid }) {
  return (
    <div className="sbc-card p-4 fade-in" data-testid={testid}>
      <div className="flex items-start justify-between">
        <div>
          <div className="text-[10px] uppercase tracking-widest text-[color:var(--text-muted)] font-semibold">{label}</div>
          <div className={`text-3xl font-mono font-medium mt-2 ${color}`}>{value}</div>
          {sub && <div className="text-[11px] text-[color:var(--text-muted)] mt-1">{sub}</div>}
        </div>
        <div className="w-8 h-8 flex items-center justify-center border border-[color:var(--border-default)] rounded-sm bg-[color:var(--bg-elevated)]">
          <Icon size={16} className="text-[color:var(--text-secondary)]" />
        </div>
      </div>
    </div>
  );
}

export default function Dashboard() {
  const [m, setM] = useState(null);
  const [fs, setFs] = useState(null);

  useEffect(() => {
    const load = async () => {
      try {
        const { data } = await api.get("/metrics/dashboard");
        setM(data);
      } catch (_err) { /* ignore */ }
      try {
        const { data } = await api.get("/freeswitch/status");
        setFs(data);
      } catch (_err) { /* ignore */ }
    };
    load();
    const iv = setInterval(load, 3500);
    return () => clearInterval(iv);
  }, []);

  if (!m) return <div className="text-sm text-[color:var(--text-muted)]" data-testid="dashboard-loading">Carregando métricas…</div>;

  return (
    <div className="space-y-6" data-testid="dashboard-page">
      <div>
        <div className="text-[10px] uppercase tracking-widest text-[color:var(--text-muted)]">Overview</div>
        <h1 className="text-2xl font-semibold tracking-tight">Painel Operacional</h1>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <StatCard testid="stat-active" label="Canais em uso" value={m.active_channels}
          icon={PhoneCall} color="text-[color:var(--accent-amber)]"
          sub="Chamadas SIP ativas em tempo real" />
        <StatCard testid="stat-today" label="Chamadas hoje" value={m.calls_today}
          icon={TrendingUp} sub={`${m.answered} atendidas · ${m.failed} falharam`} />
        <StatCard testid="stat-asr" label="ASR" value={`${m.asr}%`}
          icon={ShieldCheck} color="text-[color:var(--accent-green)]"
          sub="Answer Seizure Ratio" />
        <StatCard testid="stat-acd" label="ACD" value={`${Math.round(m.acd)}s`}
          icon={Clock} sub="Average Call Duration" />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <StatCard testid="stat-operadoras" label="Operadoras" value={`${m.operadoras.online}/${m.operadoras.total}`}
          icon={Radio} color="text-[color:var(--accent-green)]" sub="Trunks SIP online" />
        <StatCard testid="stat-ipbxs" label="IPBX externos" value={`${m.ipbxs.online}/${m.ipbxs.total}`}
          icon={Server} color="text-[color:var(--accent-blue)]" sub="PBX destino conectados" />
        <StatCard testid="stat-acl" label="ACL"
          value={<span><span className="text-[color:var(--accent-green)]">{m.acl.allow}</span> / <span className="text-[color:var(--accent-red)]">{m.acl.deny}</span></span>}
          icon={ShieldAlert} sub="allow / deny rules" />
      </div>

      {fs && (
        <div className="sbc-card p-4" data-testid="fs-status-card">
          <div className="flex items-center justify-between flex-wrap gap-3">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 flex items-center justify-center border border-[color:var(--border-default)] rounded-md bg-[color:var(--bg-elevated)]">
                <Cpu size={18} className="text-[color:var(--text-secondary)]" />
              </div>
              <div>
                <div className="text-[10px] uppercase tracking-widest text-[color:var(--text-muted)]">FreeSWITCH Engine</div>
                <div className="text-sm font-medium flex items-center gap-2">
                  {fs.esl_enabled && fs.esl_connected ? (
                    <><Wifi size={14} className="text-[color:var(--accent-green)]" /> Conectado via ESL</>
                  ) : fs.esl_enabled ? (
                    <><WifiOff size={14} className="text-[color:var(--accent-red)]" /> ESL habilitado, mas desconectado</>
                  ) : (
                    <><WifiOff size={14} className="text-[color:var(--text-muted)]" /> Modo simulador (ESL desativado)</>
                  )}
                </div>
              </div>
            </div>
            <div className="flex gap-6 text-xs font-mono">
              <div>
                <div className="text-[10px] uppercase tracking-widest text-[color:var(--text-muted)]">Fonte</div>
                <div className="font-semibold">{fs.source === "esl" ? "FreeSWITCH ESL" : "Simulator"}</div>
              </div>
              <div>
                <div className="text-[10px] uppercase tracking-widest text-[color:var(--text-muted)]">Uptime FS</div>
                <div className="font-semibold">{fs.uptime || "-"}</div>
              </div>
              <div>
                <div className="text-[10px] uppercase tracking-widest text-[color:var(--text-muted)]">Canais no FS</div>
                <div className="font-semibold text-[color:var(--accent-amber)]">{fs.channels_count}</div>
              </div>
              <div>
                <div className="text-[10px] uppercase tracking-widest text-[color:var(--text-muted)]">Último sync</div>
                <div className="font-semibold">{fs.last_sync ? new Date(fs.last_sync).toLocaleTimeString("pt-BR") : "-"}</div>
              </div>
            </div>
          </div>
          {fs.last_error && (
            <div className="mt-3 text-xs text-[color:var(--accent-red)] font-mono">! {fs.last_error}</div>
          )}
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="sbc-card p-4 lg:col-span-2">
          <div className="flex items-center justify-between mb-4">
            <div>
              <div className="text-[10px] uppercase tracking-widest text-[color:var(--text-muted)]">Últimas 24h</div>
              <div className="text-sm font-medium">Chamadas por hora</div>
            </div>
          </div>
          <ResponsiveContainer width="100%" height={220}>
            <AreaChart data={m.hourly} margin={{ top: 0, right: 8, bottom: 0, left: 0 }}>
              <defs>
                <linearGradient id="g1" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#2563EB" stopOpacity={0.28} />
                  <stop offset="100%" stopColor="#2563EB" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid stroke="#E4E7EB" strokeDasharray="0" vertical={false} />
              <XAxis dataKey="hour" stroke="#94A3B8" fontSize={10} tickLine={false} />
              <YAxis stroke="#94A3B8" fontSize={10} tickLine={false} axisLine={false} width={28} />
              <Tooltip
                contentStyle={{ background: "#FFFFFF", border: "1px solid #E4E7EB", fontSize: 12, borderRadius: 4, color: "#0F172A" }}
                labelStyle={{ color: "#475569" }}
              />
              <Area type="monotone" dataKey="chamadas" stroke="#2563EB" strokeWidth={2} fill="url(#g1)" />
            </AreaChart>
          </ResponsiveContainer>
        </div>

        <div className="sbc-card p-4">
          <div className="text-[10px] uppercase tracking-widest text-[color:var(--text-muted)] mb-1">Top destinos (prefixo)</div>
          <div className="text-sm font-medium mb-3">Rotas mais discadas</div>
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={m.top_destinations} margin={{ top: 0, right: 8, bottom: 0, left: 0 }}>
              <CartesianGrid stroke="#E4E7EB" strokeDasharray="0" vertical={false} />
              <XAxis dataKey="prefixo" stroke="#94A3B8" fontSize={10} tickLine={false} />
              <YAxis stroke="#94A3B8" fontSize={10} tickLine={false} axisLine={false} width={28} />
              <Tooltip
                contentStyle={{ background: "#FFFFFF", border: "1px solid #E4E7EB", fontSize: 12, borderRadius: 4, color: "#0F172A" }}
                labelStyle={{ color: "#475569" }}
              />
              <Bar dataKey="total" fill="#059669" radius={[3, 3, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="sbc-card p-4" data-testid="dash-answered-card">
          <div className="text-[10px] uppercase tracking-widest text-[color:var(--text-muted)] mb-1">Atendidas hoje</div>
          <div className="flex items-baseline gap-3">
            <div className="text-3xl font-mono font-medium text-[color:var(--accent-green)]">{m.answered}</div>
            <div className="text-xs text-[color:var(--text-muted)]">/ {m.calls_today} totais</div>
          </div>
        </div>
        <div className="sbc-card p-4" data-testid="dash-failed-card">
          <div className="text-[10px] uppercase tracking-widest text-[color:var(--text-muted)] mb-1 flex items-center gap-2">
            <PhoneMissed size={12} /> Falhas / sem resposta
          </div>
          <div className="flex items-baseline gap-3">
            <div className="text-3xl font-mono font-medium text-[color:var(--accent-red)]">{m.failed}</div>
            <div className="text-xs text-[color:var(--text-muted)]">chamadas não completadas</div>
          </div>
        </div>
      </div>
    </div>
  );
}
