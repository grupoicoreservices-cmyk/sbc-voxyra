import CrudPage from "@/components/CrudPage";

const TIPOS = {
  max_channels_per_ip: "Máx canais por IP",
  max_calls_per_minute: "Máx chamadas/minuto",
  destination_blocklist: "Bloqueio de destino",
  cost_limit: "Limite de custo",
};

export default function AntiFraude() {
  return (
    <CrudPage
      title="Anti-Fraude"
      subtitle="Regras de proteção contra abuso e fraude"
      endpoint="/antifraud"
      testidPrefix="antifraud"
      headers={["Nome", "Tipo", "Valor", "Ação", "Status"]}
      renderRow={(r) => (
        <>
          <td className="font-medium">{r.nome}</td>
          <td className="text-[color:var(--text-secondary)]">{TIPOS[r.tipo] || r.tipo}</td>
          <td className="font-mono">{r.valor}</td>
          <td>
            {r.acao === "block"
              ? <span className="sbc-tag tag-danger">bloquear</span>
              : <span className="sbc-tag tag-warn">alertar</span>}
          </td>
          <td>
            {r.enabled
              ? <span className="sbc-tag tag-online">ativa</span>
              : <span className="sbc-tag tag-offline">inativa</span>}
          </td>
        </>
      )}
      defaultValues={{ nome: "", tipo: "max_channels_per_ip", valor: "10", acao: "block", enabled: true }}
      fields={[
        { key: "nome", label: "Nome", full: true, placeholder: "Ex: Máx 10 canais por IP" },
        { key: "tipo", label: "Tipo", type: "select", options: Object.entries(TIPOS).map(([v, l]) => ({ value: v, label: l })) },
        { key: "valor", label: "Valor", mono: true, hint: "número, regex ou lista dependendo do tipo" },
        { key: "acao", label: "Ação", type: "select", options: [
          { value: "block", label: "Bloquear" }, { value: "alert", label: "Alertar" }
        ]},
        { key: "enabled", label: "Ativada", type: "toggle" },
      ]}
    />
  );
}
