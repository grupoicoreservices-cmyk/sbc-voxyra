import CrudPage from "@/components/CrudPage";

const statusTag = (s) =>
  s === "online" ? <span className="sbc-tag tag-online"><span className="led led-green" /> online</span>
    : s === "degraded" ? <span className="sbc-tag tag-warn"><span className="led led-amber" /> degraded</span>
    : <span className="sbc-tag tag-offline"><span className="led led-gray" /> offline</span>;

export default function IPBXs() {
  return (
    <CrudPage
      title="IPBX externos"
      subtitle="PBX destino para encaminhar chamadas"
      endpoint="/ipbxs"
      testidPrefix="ipbxs"
      headers={["Nome", "Host", "Porta", "Proto", "Codec", "Canais", "Status"]}
      renderRow={(r) => (
        <>
          <td className="font-medium">{r.nome}</td>
          <td className="font-mono">{r.host}</td>
          <td className="font-mono">{r.porta}</td>
          <td className="font-mono uppercase text-[color:var(--text-secondary)]">{r.protocolo}</td>
          <td className="font-mono text-xs">{r.codec}</td>
          <td className="font-mono">{r.canais_max}</td>
          <td>{r.enabled ? statusTag(r.status) : <span className="sbc-tag tag-offline">desativado</span>}</td>
        </>
      )}
      defaultValues={{ nome: "", host: "", porta: 5060, protocolo: "udp", codec: "PCMA,PCMU", canais_max: 60, enabled: true, status: "offline" }}
      fields={[
        { key: "nome", label: "Nome", placeholder: "PBX Matriz SP", full: true },
        { key: "host", label: "Host / IP", mono: true },
        { key: "porta", label: "Porta", type: "number", mono: true },
        { key: "protocolo", label: "Protocolo", type: "select", options: [
          { value: "udp", label: "UDP" }, { value: "tcp", label: "TCP" }, { value: "tls", label: "TLS" }
        ]},
        { key: "codec", label: "Codecs", mono: true, full: true },
        { key: "canais_max", label: "Canais máx", type: "number", mono: true },
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
