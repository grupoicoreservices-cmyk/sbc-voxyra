import "@/App.css";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { AuthProvider, useAuth } from "@/lib/auth";
import Login from "@/pages/Login";
import Layout from "@/components/Layout";
import Dashboard from "@/pages/Dashboard";
import Operadoras from "@/pages/Operadoras";
import IPBXs from "@/pages/IPBXs";
import Rotas from "@/pages/Rotas";
import ACL from "@/pages/ACL";
import CDR from "@/pages/CDR";
import LiveChannels from "@/pages/LiveChannels";
import AntiFraude from "@/pages/AntiFraude";
import FreeSwitch from "@/pages/FreeSwitch";
import Users from "@/pages/Users";

function Protected() {
  const { user } = useAuth();
  if (user === null) {
    return (
      <div className="min-h-screen flex items-center justify-center text-xs font-mono text-[color:var(--text-muted)]"
        data-testid="app-loading">
        Verificando sessão…
      </div>
    );
  }
  if (!user) return <Navigate to="/login" replace />;
  return <Layout />;
}

function LoginRoute() {
  const { user } = useAuth();
  if (user) return <Navigate to="/" replace />;
  return <Login />;
}

export default function App() {
  return (
    <div className="App">
      <AuthProvider>
        <BrowserRouter>
          <Routes>
            <Route path="/login" element={<LoginRoute />} />
            <Route path="/" element={<Protected />}>
              <Route index element={<Dashboard />} />
              <Route path="operadoras" element={<Operadoras />} />
              <Route path="ipbxs" element={<IPBXs />} />
              <Route path="rotas" element={<Rotas />} />
              <Route path="acl" element={<ACL />} />
              <Route path="cdr" element={<CDR />} />
              <Route path="live" element={<LiveChannels />} />
              <Route path="antifraud" element={<AntiFraude />} />
              <Route path="freeswitch" element={<FreeSwitch />} />
              <Route path="usuarios" element={<Users />} />
            </Route>
          </Routes>
        </BrowserRouter>
      </AuthProvider>
    </div>
  );
}
