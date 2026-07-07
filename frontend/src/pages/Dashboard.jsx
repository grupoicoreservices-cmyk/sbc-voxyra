import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, BarChart, Bar } from "recharts";
import { PhoneCall, TrendingUp, Clock, ShieldCheck, ShieldAlert, Radio, Server, PhoneMissed } from "lucide-react";

function StatCard({ label, value, sub, icon: Icon, color = "text-slate-100", testid }) {
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

  useEffect(() => {
    const load = async () => {
      try { const { data } = await api.get("/metrics/dashboard"); setM(data); }
      catch (_err) { /* ignore */ }
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
          icon={Server} sub="PBX destino conectados" />
        <StatCard testid="stat-acl" label="ACL"
          value={<span><span className="text-[color:var(--accent-green)]">{m.acl.allow}</span> / <span className="text-[color:var(--accent-red)]">{m.acl.deny}</span></span>}
          icon={ShieldAlert} sub="allow / deny rules" />
      </div>

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
                  <stop offset="0%" stopColor="#00FF88" stopOpacity={0.35} />
                  <stop offset="100%" stopColor="#00FF88" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid stroke="#26272B" strokeDasharray="0" vertical={false} />
              <XAxis dataKey="hour" stroke="#64748B" fontSize={10} tickLine={false} />
              <YAxis stroke="#64748B" fontSize={10} tickLine={false} axisLine={false} width={28} />
              <Tooltip
                contentStyle={{ background: "#121316", border: "1px solid #26272B", fontSize: 12, borderRadius: 3 }}
                labelStyle={{ color: "#94A3B8" }}
              />
              <Area type="monotone" dataKey="chamadas" stroke="#00FF88" strokeWidth={2} fill="url(#g1)" />
            </AreaChart>
          </ResponsiveContainer>
        </div>

        <div className="sbc-card p-4">
          <div className="text-[10px] uppercase tracking-widest text-[color:var(--text-muted)] mb-1">Top destinos (prefixo)</div>
          <div className="text-sm font-medium mb-3">Rotas mais discadas</div>
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={m.top_destinations} margin={{ top: 0, right: 8, bottom: 0, left: 0 }}>
              <CartesianGrid stroke="#26272B" strokeDasharray="0" vertical={false} />
              <XAxis dataKey="prefixo" stroke="#64748B" fontSize={10} tickLine={false} />
              <YAxis stroke="#64748B" fontSize={10} tickLine={false} axisLine={false} width={28} />
              <Tooltip
                contentStyle={{ background: "#121316", border: "1px solid #26272B", fontSize: 12, borderRadius: 3 }}
                labelStyle={{ color: "#94A3B8" }}
              />
              <Bar dataKey="total" fill="#3B82F6" radius={[2, 2, 0, 0]} />
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
