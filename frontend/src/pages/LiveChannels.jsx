import { useEffect, useState } from "react";
import { api, fmtDuration } from "@/lib/api";
import { PhoneCall, PhoneOff, PhoneIncoming, PhoneOutgoing } from "lucide-react";

function elapsed(startedAt) {
  const s = Math.floor((Date.now() - new Date(startedAt).getTime()) / 1000);
  return fmtDuration(s);
}

export default function LiveChannels() {
  const [rows, setRows] = useState([]);
  const [status, setStatus] = useState(null);
  const [tick, setTick] = useState(0);

  useEffect(() => {
    const load = async () => {
      try {
        const [ch, st] = await Promise.all([
          api.get("/live-channels"),
          api.get("/freeswitch/status"),
        ]);
        setRows(ch.data); setStatus(st.data);
      }
      catch (_err) { /* ignore */ }
    };
    load();
    const iv = setInterval(load, 2000);
    const iv2 = setInterval(() => setTick((t) => t + 1), 1000);
    return () => { clearInterval(iv); clearInterval(iv2); };
  }, []);

  const kill = async (id) => {
    try { await api.delete(`/live-channels/${id}`); }
    catch (_err) { /* ignore */ }
  };

  const active = rows.filter(r => r.status === "Active").length;
  const ringing = rows.filter(r => r.status === "Ringing").length;

  return (
    <div className="space-y-5" data-testid="live-page">
      <div className="flex items-start justify-between">
        <div>
          <div className="text-[10px] uppercase tracking-widest text-[color:var(--text-muted)] flex items-center gap-2">
            Real-time channels
            {status && (
              <span
                className={`sbc-tag ${status.source === "esl" && status.esl_connected ? "tag-online" : "tag-offline"}`}
                data-testid="live-source-tag"
              >
                {status.source === "esl" ? (status.esl_connected ? "ESL LIVE" : "ESL DOWN") : "SIMULATOR"}
              </span>
            )}
          </div>
          <h1 className="text-2xl font-semibold tracking-tight">Chamadas Ativas</h1>
        </div>
        <div className="flex gap-3">
          <div className="sbc-card px-4 py-2">
            <div className="text-[10px] uppercase tracking-widest text-[color:var(--text-muted)]">Ativas</div>
            <div className="text-2xl font-mono font-medium text-[color:var(--accent-green)]" data-testid="live-count-active">{active}</div>
          </div>
          <div className="sbc-card px-4 py-2">
            <div className="text-[10px] uppercase tracking-widest text-[color:var(--text-muted)]">Ringing</div>
            <div className="text-2xl font-mono font-medium text-[color:var(--accent-amber)]" data-testid="live-count-ringing">{ringing}</div>
          </div>
        </div>
      </div>

      <div className="sbc-card overflow-hidden">
        <table className="sbc-table" data-testid="live-table">
          <thead>
            <tr>
              <th>Status</th><th>Call ID</th><th>Direção</th>
              <th>Origem</th><th>Destino</th><th>IP</th>
              <th>Codec</th><th>Operadora → IPBX</th><th>Duração</th><th className="text-right">Ações</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr><td colSpan={10} className="text-center text-[color:var(--text-muted)] py-8">Nenhuma chamada em curso.</td></tr>
            ) : rows.map((r) => (
              <tr key={r.id} data-testid={`live-row-${r.id}`} className="fade-in">
                <td>
                  <span className={`led ${r.status === "Active" ? "led-green" : r.status === "Ringing" ? "led-amber pulse-ring" : "led-gray"}`} />
                  <span className="ml-2 text-xs uppercase tracking-widest text-[color:var(--text-secondary)]">{r.status}</span>
                </td>
                <td className="font-mono text-xs">{r.call_id}</td>
                <td className="font-mono text-xs uppercase flex items-center gap-1">
                  {r.direction === "inbound"
                    ? <><PhoneIncoming size={12} className="text-[color:var(--accent-blue)]" />in</>
                    : <><PhoneOutgoing size={12} className="text-[color:var(--accent-green)]" />out</>}
                </td>
                <td className="font-mono">{r.src}</td>
                <td className="font-mono">{r.dst}</td>
                <td className="font-mono text-xs text-[color:var(--text-secondary)]">{r.src_ip}</td>
                <td className="font-mono text-xs">{r.codec}</td>
                <td className="text-xs text-[color:var(--text-secondary)]">
                  {r.operadora} <span className="text-[color:var(--text-muted)]">→</span> {r.ipbx}
                </td>
                <td className="font-mono">
                  <span data-elapsed={tick} data-testid={`live-elapsed-${r.id}`}>{elapsed(r.started_at)}</span>
                </td>
                <td className="text-right">
                  <button
                    className="sbc-btn sbc-btn-danger"
                    onClick={() => kill(r.id)}
                    data-testid={`live-hangup-${r.id}`}
                    title="Encerrar"
                  >
                    <PhoneOff size={12} /> Hangup
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
