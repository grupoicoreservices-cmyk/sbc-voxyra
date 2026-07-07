import CrudPage from "@/components/CrudPage";

export default function ACL() {
  return (
    <CrudPage
      title="ACL - Controle de IPs"
      subtitle="Quais IPs podem enviar / receber chamadas"
      endpoint="/acl"
      testidPrefix="acl"
      headers={["IP / CIDR", "Tipo", "Direção", "Descrição"]}
      renderRow={(r) => (
        <>
          <td className="font-mono">{r.ip}</td>
          <td>
            {r.tipo === "allow"
              ? <span className="sbc-tag tag-online">allow</span>
              : <span className="sbc-tag tag-danger">deny</span>}
          </td>
          <td className="font-mono text-xs uppercase">{r.direcao}</td>
          <td className="text-[color:var(--text-secondary)]">{r.descricao || "-"}</td>
        </>
      )}
      defaultValues={{ ip: "", tipo: "allow", direcao: "both", descricao: "" }}
      fields={[
        { key: "ip", label: "IP ou CIDR", mono: true, full: true, placeholder: "200.150.10.5 ou 10.20.30.0/24" },
        { key: "tipo", label: "Tipo", type: "select", options: [
          { value: "allow", label: "Allow (permitir)" },
          { value: "deny", label: "Deny (bloquear)" },
        ]},
        { key: "direcao", label: "Direção", type: "select", options: [
          { value: "both", label: "Ambas" },
          { value: "inbound", label: "Entrada" },
          { value: "outbound", label: "Saída" },
        ]},
        { key: "descricao", label: "Descrição", full: true, placeholder: "ex: Rede matriz SP" },
      ]}
    />
  );
}
