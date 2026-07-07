import { useEffect, useState } from "react";
import { api, fmtDate, fmtDuration } from "@/lib/api";
import { Download, Search, RotateCw } from "lucide-react";

const DISP_TAGS = {
  ANSWERED: "tag-online",
  "NO ANSWER": "tag-warn",
  BUSY: "tag-warn",
  FAILED: "tag-danger",
  CONGESTION: "tag-danger",
};

export default function CDRPage() {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [f, setF] = useState({ src: "", dst: "", disposition: "" });

  const load = async () => {
    setLoading(true);
    try {
      const params = {};
      if (f.src) params.src = f.src;
      if (f.dst) params.dst = f.dst;
      if (f.disposition) params.disposition = f.disposition;
      const { data } = await api.get("/cdr", { params });
      setRows(data);
    } finally { setLoading(false); }
  };

  useEffect(() => { load(); /* eslint-disable-next-line */ }, []);

  const exportCsv = async () => {
    const { data } = await api.get("/cdr/export.csv", { responseType: "text" });
    const blob = new Blob([data], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = "sbc_cdr.csv"; a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-5" data-testid="cdr-page">
      <div className="flex items-start justify-between">
        <div>
          <div className="text-[10px] uppercase tracking-widest text-[color:var(--text-muted)]">Call Detail Records</div>
          <h1 className="text-2xl font-semibold tracking-tight">CDR</h1>
        </div>
        <button className="sbc-btn sbc-btn-primary" onClick={exportCsv} data-testid="cdr-export-btn">
          <Download size={14} /> Exportar CSV
        </button>
      </div>

      <div className="sbc-card p-3 flex flex-wrap gap-2 items-end">
        <div className="flex-1 min-w-40">
          <label className="text-[10px] uppercase tracking-widest text-[color:var(--text-muted)] block mb-1">Origem</label>
          <input data-testid="cdr-filter-src" className="sbc-input font-mono" value={f.src}
            onChange={(e) => setF({ ...f, src: e.target.value })} placeholder="ex: +5511" />
        </div>
        <div className="flex-1 min-w-40">
          <label className="text-[10px] uppercase tracking-widest text-[color:var(--text-muted)] block mb-1">Destino</label>
          <input data-testid="cdr-filter-dst" className="sbc-input font-mono" value={f.dst}
            onChange={(e) => setF({ ...f, dst: e.target.value })} placeholder="ex: 99" />
        </div>
        <div className="w-48">
          <label className="text-[10px] uppercase tracking-widest text-[color:var(--text-muted)] block mb-1">Disposição</label>
          <select data-testid="cdr-filter-disp" className="sbc-input" value={f.disposition}
            onChange={(e) => setF({ ...f, disposition: e.target.value })}>
            <option value="">Todas</option>
            <option value="ANSWERED">ANSWERED</option>
            <option value="NO ANSWER">NO ANSWER</option>
            <option value="BUSY">BUSY</option>
            <option value="FAILED">FAILED</option>
            <option value="CONGESTION">CONGESTION</option>
          </select>
        </div>
        <button className="sbc-btn sbc-btn-primary" onClick={load} data-testid="cdr-search-btn">
          <Search size={14} /> Buscar
        </button>
        <button className="sbc-btn" onClick={() => { setF({ src: "", dst: "", disposition: "" }); setTimeout(load, 0); }}>
          <RotateCw size={14} /> Limpar
        </button>
      </div>

      <div className="sbc-card overflow-hidden">
        <div className="overflow-auto max-h-[65vh]">
          <table className="sbc-table" data-testid="cdr-table">
            <thead>
              <tr>
                <th>Call ID</th><th>Origem</th><th>Destino</th><th>IP</th>
                <th>Início</th><th>Duração</th><th>Bill</th><th>Codec</th>
                <th>Direção</th><th>Disposição</th><th>Hangup</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={11} className="text-center text-[color:var(--text-muted)] py-8">Carregando…</td></tr>
              ) : rows.length === 0 ? (
                <tr><td colSpan={11} className="text-center text-[color:var(--text-muted)] py-8">Nenhum registro.</td></tr>
              ) : rows.map((r) => (
                <tr key={r.id} data-testid={`cdr-row-${r.id}`}>
                  <td className="font-mono text-xs">{r.call_id}</td>
                  <td className="font-mono">{r.src}</td>
                  <td className="font-mono">{r.dst}</td>
                  <td className="font-mono text-xs text-[color:var(--text-secondary)]">{r.src_ip || "-"}</td>
                  <td className="font-mono text-xs">{fmtDate(r.started_at)}</td>
                  <td className="font-mono">{fmtDuration(r.duration)}</td>
                  <td className="font-mono text-[color:var(--accent-green)]">{fmtDuration(r.billsec)}</td>
                  <td className="font-mono text-xs">{r.codec}</td>
                  <td className="font-mono text-xs uppercase text-[color:var(--text-secondary)]">{r.direction}</td>
                  <td><span className={`sbc-tag ${DISP_TAGS[r.disposition] || "tag-offline"}`}>{r.disposition}</span></td>
                  <td className="font-mono text-xs text-[color:var(--text-muted)]">{r.hangup_cause}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
