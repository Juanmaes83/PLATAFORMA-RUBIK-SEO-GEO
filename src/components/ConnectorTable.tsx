import type { Connector } from "@/lib/core";
import { CONNECTOR_STATUS_LABELS } from "@/lib/labels";

/** The Core's design catalogue of connectors. Same responsive pattern as PermissionTable. */
export function ConnectorTable({ connectors }: { connectors: readonly Connector[] }) {
  return (
    <table className="rtable">
      <caption>Catálogo de conectores del Core: ninguno conectado</caption>
      <thead>
        <tr>
          <th scope="col">Conector</th>
          <th scope="col">Estado</th>
          <th scope="col">Consentimiento</th>
          <th scope="col">De pago</th>
        </tr>
      </thead>
      <tbody>
        {connectors.map((c) => (
          <tr key={c.id}>
            <th scope="row" data-label="Conector"><code>{c.id}</code></th>
            <td data-label="Estado">{CONNECTOR_STATUS_LABELS[c.status] ?? c.status}</td>
            <td data-label="Consentimiento">{c.consent}</td>
            <td data-label="De pago">{c.paid ? "Sí" : "No"}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
