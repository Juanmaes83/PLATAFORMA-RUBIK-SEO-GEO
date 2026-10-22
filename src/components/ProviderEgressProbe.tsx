"use client";

import { useActionState } from "react";
import { testConnectionAction } from "@/lib/openseo/actions";
import { captureGoogleAction } from "@/lib/openseo/google/capture-actions";

/** Owner-only diagnostic buttons that exercise the real guarded actions while providers are disabled. */
export function ProviderEgressProbe({ tenant, project }: { tenant: string; project: string }) {
  const [openseo, checkOpenSeo, checkingOpenSeo] = useActionState(testConnectionAction, null);
  const hidden = <><input type="hidden" name="tenant" value={tenant} /><input type="hidden" name="project" value={project} /></>;

  const openSeoBlocked = openseo !== null && !("denied" in openseo) &&
    openseo.status === "NOT_CONNECTED" && openseo.reason === "AUDIT_WRITER_UNAVAILABLE";
  return (
    <section aria-labelledby="provider-egress-probe" className="section">
      <h2 id="provider-egress-probe">Comprobación de salida de proveedores</h2>
      <p>Pruebas de solo lectura para verificar las guardas del servidor. No activan OpenSEO ni consultan Google.</p>
      <div className="card form">
        <form action={checkOpenSeo}>
          {hidden}
          <button type="submit" className="btn" disabled={checkingOpenSeo}>Comprobar guarda OpenSEO</button>
        </form>
        {openseo && <p role="status">{"denied" in openseo ? "Acción no autorizada" : openSeoBlocked ? "OpenSEO bloqueado antes del transporte" : "Respuesta recibida; revisar categoría"}</p>}
        <form action={captureGoogleAction}>
          {hidden}
          <input type="hidden" name="provider" value="search-console" />
          <input type="hidden" name="startDate" value="2026-10-01" />
          <input type="hidden" name="endDate" value="2026-10-02" />
          <input type="hidden" name="dimensions" value="query" />
          <input type="hidden" name="rowLimit" value="1" />
          <input type="hidden" name="key" value={`${project}-${tenant}-p1-guard-0001`} />
          <button type="submit" className="btn">Comprobar guarda Google</button>
        </form>
        <p className="muted small">La acción usa la petición real de captura, que debe volver con el estado «desactivado» antes de reservar o consultar datos.</p>
      </div>
    </section>
  );
}
