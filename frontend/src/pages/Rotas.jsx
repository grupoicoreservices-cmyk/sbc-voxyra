import { useEffect, useState } from "react";
import CrudPage from "@/components/CrudPage";
import { api } from "@/lib/api";

export default function Rotas() {
  const [ops, setOps] = useState([]);
  const [ipbxs, setIpbxs] = useState([]);
  useEffect(() => {
    (async () => {
      const [o, i] = await Promise.all([api.get("/operadoras"), api.get("/ipbxs")]);
      setOps(o.data); setIpbxs(i.data);
    })();
  }, []);

  const opMap = Object.fromEntries(ops.map(o => [o.id, o.nome]));
  const ipbxMap = Object.fromEntries(ipbxs.map(i => [i.id, i.nome]));

  return (
    <CrudPage
      title="Rotas / LCR"
      subtitle="Least Cost Routing"
      endpoint="/rotas"
      testidPrefix="rotas"
      headers={["Nome", "Padrão", "Operadora", "IPBX", "Prioridade", "Custo", "Status"]}
      renderRow={(r) => (
        <>
          <td className="font-medium">{r.nome}</td>
          <td className="font-mono text-xs">{r.padrao}</td>
          <td>{opMap[r.operadora_id] || <span className="text-[color:var(--text-muted)]">-</span>}</td>
          <td>{ipbxMap[r.ipbx_id] || <span className="text-[color:var(--text-muted)]">-</span>}</td>
          <td className="font-mono">{r.prioridade}</td>
          <td className="font-mono">R$ {Number(r.custo).toFixed(2)}</td>
          <td>{r.enabled
            ? <span className="sbc-tag tag-online">ativa</span>
            : <span className="sbc-tag tag-offline">inativa</span>}
          </td>
        </>
      )}
      defaultValues={{ nome: "", padrao: "^55.*", operadora_id: "", ipbx_id: "", prioridade: 100, custo: 0.0, enabled: true }}
      fields={[
        { key: "nome", label: "Nome", full: true, placeholder: "Ex: Nacional Vivo" },
        { key: "padrao", label: "Regex de destino", mono: true, full: true, placeholder: "^55[0-9]+$" },
        { key: "operadora_id", label: "Operadora", type: "select",
          options: [{ value: "", label: "-- selecione --" }, ...ops.map(o => ({ value: o.id, label: o.nome }))] },
        { key: "ipbx_id", label: "IPBX destino", type: "select",
          options: [{ value: "", label: "-- opcional --" }, ...ipbxs.map(i => ({ value: i.id, label: i.nome }))] },
        { key: "prioridade", label: "Prioridade (menor = maior)", type: "number", mono: true },
        { key: "custo", label: "Custo por minuto", type: "number", mono: true },
        { key: "enabled", label: "Ativada", type: "toggle" },
      ]}
    />
  );
}
