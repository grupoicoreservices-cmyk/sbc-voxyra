import { useState } from "react";
import { useAuth } from "@/lib/auth";
import { Radio, Lock, Mail, Loader2 } from "lucide-react";

const BG = "https://images.unsplash.com/photo-1691435828932-911a7801adfb?crop=entropy&cs=srgb&fm=jpg&ixid=M3w4NjAzMjd8MHwxfHNlYXJjaHwxfHxkYXJrJTIwc2VydmVyJTIwcm9vbSUyMGZpYmVyJTIwb3B0aWN8ZW58MHx8fHwxNzgzNDY3MjQ0fDA&ixlib=rb-4.1.0&q=85";

export default function Login() {
  const { login, error } = useAuth();
  const [email, setEmail] = useState("admin@sbcmanager.com");
  const [password, setPassword] = useState("Admin@2026");
  const [loading, setLoading] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    setLoading(true);
    await login(email, password);
    setLoading(false);
  };

  return (
    <div className="min-h-screen relative flex items-center justify-start" data-testid="login-page">
      <div className="absolute inset-0" style={{
        backgroundImage: `url(${BG})`, backgroundSize: "cover", backgroundPosition: "center",
      }} />
      <div className="absolute inset-0" style={{ background: "linear-gradient(90deg, rgba(10,10,11,0.95) 0%, rgba(10,10,11,0.75) 45%, rgba(10,10,11,0.3) 100%)" }} />

      <div className="relative z-10 w-full max-w-md ml-16 p-10 fade-in">
        <div className="flex items-center gap-3 mb-10">
          <div className="w-11 h-11 flex items-center justify-center border border-[color:var(--border-strong)] rounded-sm bg-[color:var(--bg-surface)]">
            <Radio size={22} className="text-[color:var(--accent-green)]" />
          </div>
          <div>
            <div className="text-xs uppercase tracking-[0.25em] text-[color:var(--text-muted)]">Session Border Controller</div>
            <div className="text-2xl font-semibold tracking-tight">SBC Manager</div>
          </div>
        </div>

        <div className="mb-8">
          <div className="text-xs uppercase tracking-widest text-[color:var(--text-muted)] mb-1">Acesso restrito</div>
          <div className="text-lg text-[color:var(--text-secondary)]">
            Entre com suas credenciais de operação
          </div>
        </div>

        <form onSubmit={submit} className="space-y-4">
          <div>
            <label className="text-[10px] uppercase tracking-widest text-[color:var(--text-muted)] font-semibold block mb-2">
              Email
            </label>
            <div className="relative">
              <Mail size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-[color:var(--text-muted)]" />
              <input
                data-testid="login-email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="sbc-input pl-9 font-mono"
                placeholder="operador@empresa.com"
                required
              />
            </div>
          </div>

          <div>
            <label className="text-[10px] uppercase tracking-widest text-[color:var(--text-muted)] font-semibold block mb-2">
              Senha
            </label>
            <div className="relative">
              <Lock size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-[color:var(--text-muted)]" />
              <input
                data-testid="login-password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="sbc-input pl-9 font-mono"
                placeholder="••••••••"
                required
              />
            </div>
          </div>

          {error && (
            <div data-testid="login-error" className="text-xs text-[color:var(--accent-red)] font-mono border border-[rgba(239,68,68,0.3)] bg-[rgba(239,68,68,0.08)] px-3 py-2 rounded-sm">
              ! {error}
            </div>
          )}

          <button
            data-testid="login-submit"
            type="submit"
            disabled={loading}
            className="sbc-btn sbc-btn-primary w-full justify-center h-10 text-sm mt-2"
          >
            {loading ? <Loader2 size={14} className="animate-spin" /> : null}
            {loading ? "Autenticando..." : "Autenticar sessão"}
          </button>
        </form>

        <div className="mt-10 text-[10px] font-mono uppercase tracking-widest text-[color:var(--text-muted)]">
          <span className="led led-green inline-block mr-2" />
          sbc-manager v1.0.0 · sessão criptografada · tls 1.3
        </div>
      </div>
    </div>
  );
}
