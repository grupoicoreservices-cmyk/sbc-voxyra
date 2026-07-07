import { useEffect, useState } from "react";
import { api, apiErrToStr, fmtDate } from "@/lib/api";
import { Plus, Trash2, Edit3, X, Save, Loader2 } from "lucide-react";

/**
 * Generic CRUD page.
 * fields: [{ key, label, type: text|number|select|toggle, options?: [{value,label}], mono?, placeholder? }]
 * renderCell(row, key) -> optional custom render
 */
export default function CrudPage({
  title, subtitle, endpoint, fields, defaultValues, testidPrefix,
  renderRow, headers, allowDelete = true,
}) {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState(defaultValues);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const load = async () => {
    setLoading(true);
    try {
      const { data } = await api.get(endpoint);
      setRows(data);
    } finally { setLoading(false); }
  };
  useEffect(() => { load(); /* eslint-disable-next-line */ }, [endpoint]);

  const open = (row = null) => {
    setError("");
    setEditing(row);
    setForm(row ? { ...defaultValues, ...row } : { ...defaultValues });
    setShowForm(true);
  };
  const close = () => { setShowForm(false); setEditing(null); };

  const save = async (e) => {
    e.preventDefault();
    setSaving(true); setError("");
    try {
      if (editing) await api.put(`${endpoint}/${editing.id}`, form);
      else await api.post(endpoint, form);
      close();
      await load();
    } catch (err) {
      setError(apiErrToStr(err?.response?.data?.detail) || err.message);
    } finally { setSaving(false); }
  };

  const del = async (id) => {
    if (!window.confirm("Confirma exclusão?")) return;
    await api.delete(`${endpoint}/${id}`);
    await load();
  };

  return (
    <div className="space-y-5" data-testid={`${testidPrefix}-page`}>
      <div className="flex items-start justify-between">
        <div>
          <div className="text-[10px] uppercase tracking-widest text-[color:var(--text-muted)]">{subtitle}</div>
          <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
        </div>
        <button
          data-testid={`${testidPrefix}-add-btn`}
          className="sbc-btn sbc-btn-primary"
          onClick={() => open()}
        >
          <Plus size={14} /> Adicionar
        </button>
      </div>

      <div className="sbc-card overflow-hidden">
        <div className="overflow-auto max-h-[70vh]">
          <table className="sbc-table" data-testid={`${testidPrefix}-table`}>
            <thead>
              <tr>
                {headers.map((h) => <th key={h}>{h}</th>)}
                <th className="w-24 text-right">Ações</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={headers.length + 1} className="text-center text-[color:var(--text-muted)] py-8">Carregando…</td></tr>
              ) : rows.length === 0 ? (
                <tr><td colSpan={headers.length + 1} className="text-center text-[color:var(--text-muted)] py-8">Nenhum registro.</td></tr>
              ) : rows.map((row) => (
                <tr key={row.id} data-testid={`${testidPrefix}-row-${row.id}`}>
                  {renderRow(row)}
                  <td className="text-right">
                    <div className="inline-flex gap-1">
                      <button
                        data-testid={`${testidPrefix}-edit-${row.id}`}
                        className="sbc-btn"
                        onClick={() => open(row)}
                        title="Editar"
                      >
                        <Edit3 size={12} />
                      </button>
                      {allowDelete && (
                        <button
                          data-testid={`${testidPrefix}-delete-${row.id}`}
                          className="sbc-btn sbc-btn-danger"
                          onClick={() => del(row.id)}
                          title="Excluir"
                        >
                          <Trash2 size={12} />
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {showForm && (
        <div className="fixed inset-0 bg-black/70 z-40 flex items-center justify-center p-4" onClick={close}>
          <div
            className="sbc-card w-full max-w-2xl p-6 fade-in"
            onClick={(e) => e.stopPropagation()}
            data-testid={`${testidPrefix}-form`}
          >
            <div className="flex items-center justify-between mb-4">
              <div>
                <div className="text-[10px] uppercase tracking-widest text-[color:var(--text-muted)]">
                  {editing ? "Editar" : "Novo"}
                </div>
                <h2 className="text-lg font-semibold">{title}</h2>
              </div>
              <button className="sbc-btn" onClick={close} data-testid={`${testidPrefix}-form-close`}>
                <X size={14} />
              </button>
            </div>

            <form onSubmit={save} className="grid grid-cols-2 gap-4">
              {fields.map((f) => (
                <div key={f.key} className={f.full ? "col-span-2" : "col-span-2 md:col-span-1"}>
                  <label className="text-[10px] uppercase tracking-widest text-[color:var(--text-muted)] font-semibold block mb-1.5">
                    {f.label}
                  </label>
                  {f.type === "select" ? (
                    <select
                      data-testid={`${testidPrefix}-field-${f.key}`}
                      className={`sbc-input ${f.mono ? "font-mono" : ""}`}
                      value={form[f.key] ?? ""}
                      onChange={(e) => setForm({ ...form, [f.key]: e.target.value })}
                    >
                      {(f.options || []).map((o) => (
                        <option key={o.value} value={o.value} className="bg-[color:var(--bg-surface)]">
                          {o.label}
                        </option>
                      ))}
                    </select>
                  ) : f.type === "toggle" ? (
                    <label className="flex items-center gap-2 pt-1.5">
                      <input
                        data-testid={`${testidPrefix}-field-${f.key}`}
                        type="checkbox"
                        checked={!!form[f.key]}
                        onChange={(e) => setForm({ ...form, [f.key]: e.target.checked })}
                        className="w-4 h-4"
                      />
                      <span className="text-sm text-[color:var(--text-secondary)]">
                        {form[f.key] ? "Ativado" : "Desativado"}
                      </span>
                    </label>
                  ) : (
                    <input
                      data-testid={`${testidPrefix}-field-${f.key}`}
                      type={f.type || "text"}
                      className={`sbc-input ${f.mono ? "font-mono" : ""}`}
                      value={form[f.key] ?? ""}
                      onChange={(e) => setForm({
                        ...form,
                        [f.key]: f.type === "number" ? (e.target.value === "" ? "" : Number(e.target.value)) : e.target.value,
                      })}
                      placeholder={f.placeholder || ""}
                    />
                  )}
                  {f.hint && <div className="text-[10px] text-[color:var(--text-muted)] mt-1 font-mono">{f.hint}</div>}
                </div>
              ))}
              {error && (
                <div className="col-span-2 text-xs text-[color:var(--accent-red)] font-mono border border-[rgba(239,68,68,0.3)] bg-[rgba(239,68,68,0.08)] px-3 py-2 rounded-sm">
                  ! {error}
                </div>
              )}
              <div className="col-span-2 flex justify-end gap-2 mt-2">
                <button type="button" className="sbc-btn" onClick={close} data-testid={`${testidPrefix}-form-cancel`}>Cancelar</button>
                <button
                  type="submit"
                  className="sbc-btn sbc-btn-primary"
                  disabled={saving}
                  data-testid={`${testidPrefix}-form-save`}
                >
                  {saving ? <Loader2 size={12} className="animate-spin" /> : <Save size={12} />}
                  {saving ? "Salvando..." : "Salvar"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

export { fmtDate };
