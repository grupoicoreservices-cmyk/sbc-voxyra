import { NavLink, Outlet } from "react-router-dom";
import {
  LayoutDashboard, Radio, Server, Route, Shield, ListChecks,
  PhoneCall, AlertTriangle, FileCode2, Users, LogOut, ChevronsLeft, Activity, Menu
} from "lucide-react";
import { useAuth } from "@/lib/auth";
import { useEffect, useState } from "react";
import { api } from "@/lib/api";

const NAV = [
  { to: "/", icon: LayoutDashboard, label: "Dashboard", testid: "nav-dashboard", end: true },
  { to: "/operadoras", icon: Radio, label: "Operadoras", testid: "nav-operadoras" },
  { to: "/ipbxs", icon: Server, label: "IPBX externos", testid: "nav-ipbxs" },
  { to: "/rotas", icon: Route, label: "Rotas / LCR", testid: "nav-rotas" },
  { to: "/acl", icon: Shield, label: "ACL", testid: "nav-acl" },
  { to: "/cdr", icon: ListChecks, label: "CDR", testid: "nav-cdr" },
  { to: "/live", icon: PhoneCall, label: "Chamadas Ativas", testid: "nav-live" },
  { to: "/antifraud", icon: AlertTriangle, label: "Anti-Fraude", testid: "nav-antifraud" },
  { to: "/freeswitch", icon: FileCode2, label: "FreeSWITCH", testid: "nav-freeswitch" },
  { to: "/usuarios", icon: Users, label: "Usuários", testid: "nav-usuarios" },
];

export default function Layout() {
  const { user, logout } = useAuth();
  const [collapsed, setCollapsed] = useState(false);
  const [uptime, setUptime] = useState("--");
  const [health, setHealth] = useState({ active: 0 });

  useEffect(() => {
    const start = Date.now();
    const tick = () => {
      const s = Math.floor((Date.now() - start) / 1000);
      const d = Math.floor(s / 86400);
      const h = Math.floor((s % 86400) / 3600);
      const m = Math.floor((s % 3600) / 60);
      setUptime(`${d}d ${h.toString().padStart(2, "0")}h ${m.toString().padStart(2, "0")}m`);
    };
    tick();
    const iv = setInterval(tick, 30000);

    const load = async () => {
      try {
        const { data } = await api.get("/metrics/dashboard");
        setHealth({ active: data.active_channels });
      } catch (_err) { /* ignore */ }
    };
    load();
    const iv2 = setInterval(load, 4000);
    return () => { clearInterval(iv); clearInterval(iv2); };
  }, []);

  return (
    <div className="min-h-screen flex" data-testid="app-layout">
      {/* Sidebar */}
      <aside
        className={`transition-all duration-200 border-r border-[color:var(--border-default)] bg-[color:var(--bg-surface)] flex flex-col ${collapsed ? "w-14" : "w-60"}`}
        data-testid="sidebar"
      >
        <div className="h-14 flex items-center gap-2 px-3 border-b border-[color:var(--border-default)]">
          <div className="w-8 h-8 flex items-center justify-center bg-[color:var(--bg-elevated)] border border-[color:var(--border-default)] rounded-sm">
            <Radio size={16} className="text-[color:var(--accent-green)]" />
          </div>
          {!collapsed && (
            <div className="flex-1">
              <div className="text-[10px] uppercase tracking-widest text-[color:var(--text-muted)] leading-none">SBC</div>
              <div className="text-sm font-semibold leading-tight">Manager</div>
            </div>
          )}
          <button
            data-testid="sidebar-toggle"
            className="p-1 text-[color:var(--text-muted)] hover:text-[color:var(--text-primary)]"
            onClick={() => setCollapsed(!collapsed)}
          >
            {collapsed ? <Menu size={14} /> : <ChevronsLeft size={14} />}
          </button>
        </div>

        <nav className="flex-1 py-3 px-2 space-y-0.5">
          {NAV.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.end}
              data-testid={item.testid}
              className={({ isActive }) => `side-link ${isActive ? "active" : ""}`}
            >
              <item.icon size={16} className="shrink-0" />
              {!collapsed && <span className="truncate">{item.label}</span>}
            </NavLink>
          ))}
        </nav>

        {!collapsed && (
          <div className="p-3 border-t border-[color:var(--border-default)]">
            <div className="text-[10px] uppercase tracking-widest text-[color:var(--text-muted)] mb-1">Uptime</div>
            <div className="font-mono text-xs text-[color:var(--accent-green)]" data-testid="sidebar-uptime">{uptime}</div>
          </div>
        )}
      </aside>

      {/* Main */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Topbar */}
        <header className="h-14 border-b border-[color:var(--border-default)] bg-[color:var(--bg-surface)] flex items-center px-4 gap-4">
          <div className="flex items-center gap-2">
            <span className="led led-green" />
            <span className="text-xs font-mono uppercase tracking-widest text-[color:var(--text-secondary)]" data-testid="server-status">
              Server ONLINE
            </span>
          </div>
          <div className="text-[color:var(--border-default)]">|</div>
          <div className="flex items-center gap-2">
            <Activity size={14} className="text-[color:var(--accent-amber)]" />
            <span className="text-xs font-mono text-[color:var(--text-secondary)]" data-testid="topbar-active-channels">
              {health.active} canais ativos
            </span>
          </div>
          <div className="flex-1" />
          <div className="flex items-center gap-3">
            <div className="text-right">
              <div className="text-xs font-medium" data-testid="user-name">{user?.name}</div>
              <div className="text-[10px] uppercase tracking-widest text-[color:var(--text-muted)]" data-testid="user-role">
                {user?.role}
              </div>
            </div>
            <div className="w-8 h-8 rounded-full bg-[color:var(--bg-elevated)] border border-[color:var(--border-default)] flex items-center justify-center text-xs font-mono">
              {(user?.name || "?").charAt(0).toUpperCase()}
            </div>
            <button
              data-testid="logout-btn"
              className="sbc-btn"
              onClick={logout}
              title="Sair"
            >
              <LogOut size={14} />
            </button>
          </div>
        </header>

        {/* Content */}
        <main className="flex-1 overflow-auto p-6 fade-in" data-testid="main-content">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
