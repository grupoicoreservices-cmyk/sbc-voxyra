import { useEffect, useState } from "react";
import { api, apiErrToStr, fmtDate } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { Plus, Trash2, X, Save, Loader2 } from "lucide-react";

export default function Users() {
  const { user: current } = useAuth();
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ email: "", password: "", name: "", role: "operator" });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const load = async () => {
    setLoading(true);
    try { const { data } = await api.get("/users"); setRows(data); }
    finally { setLoading(false); }
  };
  useEffect(() => { load(); }, []);

  const create = async (e) => {
    e.preventDefault();
    setSaving(true); setError("");
    try {
      await api.post("/users", form);
      setShowForm(false); setForm({ email: "", password: "", name: "", role: "operator" });
      await load();
    } catch (err) {
      setError(apiErrToStr(err?.response?.data?.detail) || err.message);
    } finally { setSaving(false); }
  };

  const del = async (id) => {
    if (!window.confirm("Excluir usuário?")) return;
    try { await api.delete(`/users/${id}`); await load(); }
    catch (err) { alert(apiErrToStr(err?.response?.data?.detail)); }
  };

  const roleTag = (r) => {
    if (r === "admin") return <span className="sbc-tag tag-danger">admin</span>;
    if (r === "operator") return <span className="sbc-tag tag-info">operator</span>;
    return <span className="sbc-tag tag-offline">viewer</span>;
  };

  return (
    <div className="space-y-5" data-testid="usuarios-page">
      <div className="flex items-start justify-between">
        <div>
          <div className="text-[10px] uppercase tracking-widest text-[color:var(--text-muted)]">Access control</div>
          <h1 className="text-2xl font-semibold tracking-tight">Usuários</h1>
        </div>
        {current?.role === "admin" && (
          <button className="sbc-btn sbc-btn-primary" onClick={() => setShowForm(true)} data-testid="usuarios-add-btn">
            <Plus size={14} /> Novo usuário
          </button>
        )}
      </div>

      <div className="sbc-card overflow-hidden">
        <table className="sbc-table" data-testid="usuarios-table">
          <thead>
            <tr><th>Nome</th><th>Email</th><th>Role</th><th>Criado em</th><th className="text-right">Ações</th></tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={5} className="text-center text-[color:var(--text-muted)] py-8">Carregando…</td></tr>
            ) : rows.map((u) => (
              <tr key={u.id}>
                <td className="font-medium">{u.name}</td>
                <td className="font-mono">{u.email}</td>
                <td>{roleTag(u.role)}</td>
                <td className="font-mono text-xs text-[color:var(--text-secondary)]">{fmtDate(u.created_at)}</td>
                <td className="text-right">
                  {current?.role === "admin" && u.id !== current.id && (
                    <button className="sbc-btn sbc-btn-danger" onClick={() => del(u.id)} data-testid={`usuarios-delete-${u.id}`}>
                      <Trash2 size={12} />
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {showForm && (
        <div className="fixed inset-0 bg-black/70 z-40 flex items-center justify-center p-4" onClick={() => setShowForm(false)}>
          <div className="sbc-card w-full max-w-md p-6" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold">Novo usuário</h2>
              <button className="sbc-btn" onClick={() => setShowForm(false)}><X size={14} /></button>
            </div>
            <form onSubmit={create} className="space-y-3">
              <div>
                <label className="text-[10px] uppercase tracking-widest text-[color:var(--text-muted)] block mb-1">Nome</label>
                <input className="sbc-input" required value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })} data-testid="usuarios-field-name" />
              </div>
              <div>
                <label className="text-[10px] uppercase tracking-widest text-[color:var(--text-muted)] block mb-1">Email</label>
                <input className="sbc-input font-mono" required type="email" value={form.email}
                  onChange={(e) => setForm({ ...form, email: e.target.value })} data-testid="usuarios-field-email" />
              </div>
              <div>
                <label className="text-[10px] uppercase tracking-widest text-[color:var(--text-muted)] block mb-1">Senha</label>
                <input className="sbc-input font-mono" required type="password" value={form.password}
                  onChange={(e) => setForm({ ...form, password: e.target.value })} data-testid="usuarios-field-password" />
              </div>
              <div>
                <label className="text-[10px] uppercase tracking-widest text-[color:var(--text-muted)] block mb-1">Role</label>
                <select className="sbc-input" value={form.role}
                  onChange={(e) => setForm({ ...form, role: e.target.value })} data-testid="usuarios-field-role">
                  <option value="operator">operator</option>
                  <option value="viewer">viewer</option>
                  <option value="admin">admin</option>
                </select>
              </div>
              {error && (
                <div className="text-xs text-[color:var(--accent-red)] font-mono border border-[rgba(239,68,68,0.3)] bg-[rgba(239,68,68,0.08)] px-3 py-2 rounded-sm">
                  ! {error}
                </div>
              )}
              <div className="flex justify-end gap-2 pt-2">
                <button type="button" className="sbc-btn" onClick={() => setShowForm(false)}>Cancelar</button>
                <button type="submit" className="sbc-btn sbc-btn-primary" disabled={saving} data-testid="usuarios-form-save">
                  {saving ? <Loader2 size={12} className="animate-spin" /> : <Save size={12} />}
                  Criar
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
