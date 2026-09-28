import type { ProjectAccess } from "@/lib/access";
import { actionLabel } from "@/lib/labels";

/**
 * The Core's `authorize` decisions for one membership. Mobile-first (D-27): a list of
 * compact rows on small screens; the same markup becomes a comparable table from 640 px.
 * No horizontal scroll.
 */
export function PermissionTable({ permissions }: { permissions: ProjectAccess["permissions"] }) {
  return (
    <table className="rtable permissions">
      <caption>Permisos según los contratos del Core (MATRIX / authorize)</caption>
      <thead>
        <tr>
          <th scope="col">Acción</th>
          <th scope="col">Resultado</th>
          <th scope="col">Motivo</th>
        </tr>
      </thead>
      <tbody>
        {permissions.map(({ action, decision }) => (
          <tr key={action} data-allowed={decision.allowed}>
            <th scope="row" data-label="Acción">{actionLabel(action)}</th>
            <td data-label="Resultado">{decision.allowed ? "Permitido" : "No permitido"}</td>
            <td data-label="Motivo"><code>{decision.reason ?? "—"}</code></td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
