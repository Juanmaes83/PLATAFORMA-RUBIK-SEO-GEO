import type { ProjectAccess } from "@/lib/access";
import { permissionView } from "@/lib/permissions";

const STATE_LABEL = {
  available: "Disponible",
  "granted-not-built": "Permitido, aún no disponible",
  denied: "No permitido",
} as const;

/**
 * Permissions for one membership. Each row separates what the role grants (the Core's
 * decision) from whether the function exists yet, so nothing unbuilt looks usable.
 * Mobile-first (D-27): stacked rows below 640 px, a comparable table above. No horizontal
 * scroll. The Core code is kept only as a small diagnostic detail on denials.
 */
export function PermissionTable({ permissions, role }: { permissions: ProjectAccess["permissions"]; role: string }) {
  const views = permissions.map(({ action, decision }) => permissionView(action, decision, role));
  const count = (s: keyof typeof STATE_LABEL) => views.filter((v) => v.state === s).length;
  return (
    <>
      <p className="small">
        <span className="pill pill-ok">{STATE_LABEL.available}: {count("available")}</span>{" "}
        <span className="pill pill-neutral">{STATE_LABEL["granted-not-built"]}: {count("granted-not-built")}</span>{" "}
        <span className="pill pill-no">{STATE_LABEL.denied}: {count("denied")}</span>
      </p>
      <table className="rtable permissions">
        <caption>Qué permite tu rol (contratos del Core) y qué funciones existen ya</caption>
        <thead>
          <tr>
            <th scope="col">Acción</th>
            <th scope="col">Estado</th>
            <th scope="col">Permiso del rol</th>
            <th scope="col">Función en la plataforma</th>
            <th scope="col">Qué significa</th>
          </tr>
        </thead>
        <tbody>
          {views.map((v) => (
            <tr key={v.action} data-state={v.state}>
              <th scope="row" data-label="Acción">{v.actionLabel}</th>
              <td data-label="Estado"><span className={`pill ${v.state === "available" ? "pill-ok" : v.state === "denied" ? "pill-no" : "pill-neutral"}`}>{STATE_LABEL[v.state]}</span></td>
              <td data-label="Permiso del rol">{v.roleGrant}</td>
              <td data-label="Función">{v.functionLabel} · {v.availability}</td>
              <td data-label="Qué significa" className="explain">
                <span>{v.explanation}</span>
                {v.diagnosticCode && <span className="diag">Código de diagnóstico: <code>{v.diagnosticCode}</code></span>}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </>
  );
}
