import type { ProjectAccess } from "@/lib/access";

const LABELS: Record<string, string> = {
  read: "Leer",
  draft: "Redactar borradores",
  "propose-action": "Proponer acciones",
  "review-action": "Revisar acciones",
  "approve-external-action": "Aprobar acciones externas",
  "execute-approved-action": "Ejecutar acciones aprobadas",
  "approve-fact": "Aprobar información",
  "confirm-cost": "Confirmar coste",
  "manage-connectors": "Gestionar conectores",
  "manage-secret-refs": "Gestionar referencias de secretos",
  "manage-members": "Gestionar miembros",
  "export-data": "Exportar datos",
  "delete-data": "Borrar datos",
};

/** Presentational table of the Core's `authorize` decisions for one membership. */
export function PermissionTable({ permissions }: { permissions: ProjectAccess["permissions"] }) {
  return (
    <table className="permissions">
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
            <td>{LABELS[action] ?? action}</td>
            <td>{decision.allowed ? "Permitido" : "No permitido"}</td>
            <td><code>{decision.reason ?? "—"}</code></td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
