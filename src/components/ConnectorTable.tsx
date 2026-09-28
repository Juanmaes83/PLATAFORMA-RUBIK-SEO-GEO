import type { Connector } from "@/lib/core";
import { connectorView } from "@/lib/connectors";

/** The Core's connector catalogue, explained in Spanish. All rows say "No conectado". */
export function ConnectorTable({ connectors }: { connectors: readonly Connector[] }) {
  return (
    <table className="rtable">
      <caption>Conectores previstos: ninguno está conectado</caption>
      <thead>
        <tr>
          <th scope="col">Conector</th>
          <th scope="col">Qué aportará</th>
          <th scope="col">Conexión</th>
          <th scope="col">Desarrollo</th>
          <th scope="col">Coste</th>
          <th scope="col">Autorización necesaria</th>
        </tr>
      </thead>
      <tbody>
        {connectors.map(connectorView).map((c) => (
          <tr key={c.id}>
            <th scope="row" data-label="Conector">
              {c.name}
              <span className="diag">Identificador técnico: <code>{c.id}</code></span>
            </th>
            <td data-label="Qué aportará" className="explain">{c.provides}</td>
            <td data-label="Conexión"><span className="pill pill-warn">{c.connection}</span></td>
            <td data-label="Desarrollo">{c.development} · {c.stage}</td>
            <td data-label="Coste">{c.cost}</td>
            <td data-label="Autorización" className="explain">{c.consent}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
