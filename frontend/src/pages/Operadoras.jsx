import CrudPage from "@/components/CrudPage";

const statusTag = (s) =>
  s === "online" ? <span className="sbc-tag tag-online"><span className="led led-green" /> online</span>
    : s === "degraded" ? <span className="sbc-tag tag-warn"><span className="led led-amber" /> degraded</span>
    : <span className="sbc-tag tag-offline"><span className="led led-gray" /> offline</span>;

export default function Operadoras() {
  return (
    <CrudPage
      title="Operadoras SIP"
      subtitle="Trunks de saída/entrada"
      endpoint="/operadoras"
      testidPrefix="operadoras"
      headers={["Nome", "Host", "Porta", "Proto", "Usuário", "Codec", "Canais", "Prefixo", "Status"]}
      renderRow={(r) => (
        <>
          <td className="font-medium">{r.nome}</td>
          <td className="font-mono">{r.host}</td>
          <td className="font-mono">{r.porta}</td>
          <td className="font-mono uppercase text-[color:var(--text-secondary)]">{r.protocolo}</td>
          <td className="font-mono">{r.usuario || "-"}</td>
          <td className="font-mono text-xs">{r.codec}</td>
          <td className="font-mono">{r.canais_max}</td>
          <td className="font-mono">{r.prefixo || "-"}</td>
          <td>{r.enabled ? statusTag(r.status) : <span className="sbc-tag tag-offline">desativado</span>}</td>
        </>
      )}
      defaultValues={{
        nome: "", host: "", porta: 5060, protocolo: "udp",
        usuario: "", senha: "", codec: "PCMA,PCMU,G729",
        canais_max: 30, prefixo: "", enabled: true, status: "offline",
      }}
      fields={[
        { key: "nome", label: "Nome", placeholder: "Ex: Vivo SIP Trunk", full: true },
        { key: "host", label: "Host / IP", mono: true, placeholder: "sip.vivo.com.br ou 200.150.10.5" },
        { key: "porta", label: "Porta", type: "number", mono: true },
        { key: "protocolo", label: "Protocolo", type: "select", options: [
          { value: "udp", label: "UDP" }, { value: "tcp", label: "TCP" }, { value: "tls", label: "TLS" }
        ]},
        { key: "usuario", label: "Usuário SIP", mono: true, placeholder: "opcional" },
        { key: "senha", label: "Senha SIP", mono: true, placeholder: "opcional" },
        { key: "codec", label: "Codecs (ordem)", mono: true, hint: "ex: PCMA,PCMU,G729", full: true },
        { key: "canais_max", label: "Canais máx", type: "number", mono: true },
        { key: "prefixo", label: "Prefixo (opcional)", mono: true, placeholder: "ex: 0011" },
        { key: "status", label: "Status simulado", type: "select", options: [
          { value: "online", label: "online" },
          { value: "degraded", label: "degraded" },
          { value: "offline", label: "offline" },
        ]},
        { key: "enabled", label: "Ativado", type: "toggle" },
      ]}
    />
  );
}
