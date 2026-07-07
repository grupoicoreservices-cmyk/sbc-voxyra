import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { Download, RefreshCw, Copy, Check, Terminal, FileCode2 } from "lucide-react";

function highlight(xml) {
  // Escape first, then apply spans. Use placeholders to avoid re-matching spans.
  const esc = xml
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
  // Attribute values first (they use raw quotes since we didn't escape ")
  let out = esc.replace(/(="[^"]*")/g, "@@ATTR_START@@$1@@ATTR_END@@");
  // Comments
  out = out.replace(/(&lt;!--[\s\S]*?--&gt;)/g, "@@CMT_START@@$1@@CMT_END@@");
  // Tag opening/closing markers
  out = out.replace(/(&lt;\/?[a-zA-Z_][\w:.-]*)/g, "@@TAG_START@@$1@@TAG_END@@");
  // Now substitute placeholders with span
  out = out
    .replace(/@@TAG_START@@/g, '<span style="color:#00FF88">')
    .replace(/@@TAG_END@@/g, "</span>")
    .replace(/@@ATTR_START@@/g, '<span style="color:#F59E0B">')
    .replace(/@@ATTR_END@@/g, "</span>")
    .replace(/@@CMT_START@@/g, '<span style="color:#64748B">')
    .replace(/@@CMT_END@@/g, "</span>");
  return out;
}

export default function FreeSwitch() {
  const [xml, setXml] = useState("");
  const [script, setScript] = useState("");
  const [loading, setLoading] = useState(true);
  const [copied, setCopied] = useState(false);
  const [tab, setTab] = useState("xml");

  const load = async () => {
    setLoading(true);
    const [x, s] = await Promise.all([
      api.get("/freeswitch/config", { responseType: "text" }),
      api.get("/freeswitch/install-script", { responseType: "text" }),
    ]);
    setXml(x.data); setScript(s.data); setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const download = (content, name) => {
    const blob = new Blob([content], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = name; a.click();
    URL.revokeObjectURL(url);
  };

  const copy = async (t) => {
    await navigator.clipboard.writeText(t);
    setCopied(true);
    setTimeout(() => setCopied(false), 1600);
  };

  return (
    <div className="space-y-5" data-testid="freeswitch-page">
      <div className="flex items-start justify-between">
        <div>
          <div className="text-[10px] uppercase tracking-widest text-[color:var(--text-muted)]">FreeSWITCH configuration</div>
          <h1 className="text-2xl font-semibold tracking-tight">Configuração FreeSWITCH</h1>
          <p className="text-sm text-[color:var(--text-secondary)] mt-2 max-w-2xl">
            XML gerado automaticamente com base nas Operadoras, IPBXs, ACL e Rotas cadastradas.
            Instale o FreeSWITCH em um servidor Ubuntu 24.04 usando o script abaixo e cole/importe a config.
          </p>
        </div>
        <button className="sbc-btn" onClick={load} data-testid="fs-refresh-btn">
          <RefreshCw size={14} /> Regerar
        </button>
      </div>

      <div className="flex gap-2 border-b border-[color:var(--border-default)]">
        <button
          onClick={() => setTab("xml")}
          data-testid="fs-tab-xml"
          className={`px-4 py-2 text-xs uppercase tracking-widest border-b-2 ${tab === "xml" ? "border-[color:var(--accent-blue)] text-[color:var(--text-primary)]" : "border-transparent text-[color:var(--text-muted)]"}`}
        >
          <FileCode2 size={12} className="inline mr-1" /> XML Config
        </button>
        <button
          onClick={() => setTab("install")}
          data-testid="fs-tab-install"
          className={`px-4 py-2 text-xs uppercase tracking-widest border-b-2 ${tab === "install" ? "border-[color:var(--accent-blue)] text-[color:var(--text-primary)]" : "border-transparent text-[color:var(--text-muted)]"}`}
        >
          <Terminal size={12} className="inline mr-1" /> Script Ubuntu 24
        </button>
      </div>

      {tab === "xml" && (
        <div className="sbc-card" data-testid="fs-xml-panel">
          <div className="flex items-center justify-between px-3 py-2 border-b border-[color:var(--border-default)] bg-[color:var(--bg-elevated)]">
            <div className="text-[11px] font-mono text-[color:var(--text-muted)]">/etc/freeswitch/sbc_manager.xml</div>
            <div className="flex gap-2">
              <button className="sbc-btn" onClick={() => copy(xml)} data-testid="fs-copy-xml">
                {copied ? <Check size={12} /> : <Copy size={12} />} {copied ? "Copiado" : "Copiar"}
              </button>
              <button className="sbc-btn sbc-btn-primary" onClick={() => download(xml, "sbc_manager.xml")} data-testid="fs-download-xml">
                <Download size={12} /> Download XML
              </button>
            </div>
          </div>
          <pre
            className="p-4 text-xs leading-relaxed font-mono overflow-auto max-h-[60vh] whitespace-pre"
            data-testid="fs-xml-content"
            dangerouslySetInnerHTML={{ __html: loading ? "Gerando..." : highlight(xml) }}
          />
        </div>
      )}

      {tab === "install" && (
        <div className="sbc-card" data-testid="fs-install-panel">
          <div className="flex items-center justify-between px-3 py-2 border-b border-[color:var(--border-default)] bg-[color:var(--bg-elevated)]">
            <div className="text-[11px] font-mono text-[color:var(--text-muted)]">install-freeswitch.sh</div>
            <div className="flex gap-2">
              <button className="sbc-btn" onClick={() => copy(script)} data-testid="fs-copy-script">
                <Copy size={12} /> Copiar
              </button>
              <button className="sbc-btn sbc-btn-primary" onClick={() => download(script, "install-freeswitch.sh")} data-testid="fs-download-script">
                <Download size={12} /> Download .sh
              </button>
            </div>
          </div>
          <pre
            className="p-4 text-xs leading-relaxed font-mono overflow-auto max-h-[60vh] whitespace-pre text-[color:var(--text-secondary)]"
            data-testid="fs-install-content"
          >{script}</pre>
        </div>
      )}

      <div className="sbc-card p-4">
        <div className="text-[10px] uppercase tracking-widest text-[color:var(--text-muted)] mb-1">Como usar</div>
        <ol className="text-sm text-[color:var(--text-secondary)] list-decimal ml-5 space-y-1">
          <li>Provisione um servidor Ubuntu 24.04 LTS com IP público.</li>
          <li>Copie o script <span className="font-mono text-[color:var(--accent-green)]">install-freeswitch.sh</span> e execute como root.</li>
          <li>Baixe o XML e coloque em <span className="font-mono text-[color:var(--accent-green)]">/etc/freeswitch/autoload_configs/sbc_manager.xml</span>.</li>
          <li>Inclua no <span className="font-mono">freeswitch.xml</span> principal ou copie as seções (acl, gateways, dialplan).</li>
          <li>Reinicie com <span className="font-mono text-[color:var(--accent-green)]">systemctl restart freeswitch</span>.</li>
        </ol>
      </div>
    </div>
  );
}
