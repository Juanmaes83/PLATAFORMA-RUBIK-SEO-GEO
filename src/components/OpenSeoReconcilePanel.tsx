"use client";

import { useActionState } from "react";
import { reconcileAuditAction } from "@/lib/openseo/actions";
import { errorText } from "@/lib/openseo/labels";

// Uncertain launch (ADR 0008). Shown to the owner only while a reservation is STARTING: the
// platform cannot know whether OpenSEO created the crawl, so the owner checks OpenSEO and
// either binds the audit id it shows or confirms nothing was created. No OpenSEO request.

const dateFormat = new Intl.DateTimeFormat("es-ES", { dateStyle: "long", timeStyle: "short", timeZone: "Europe/Madrid" });

export function OpenSeoReconcilePanel({ tenant, project, createdAt }: { tenant: string; project: string; createdAt: string }) {
  const [bound, bind, binding] = useActionState(reconcileAuditAction, null);
  const [released, release, releasing] = useActionState(reconcileAuditAction, null);
  const hidden = (
    <>
      <input type="hidden" name="tenant" value={tenant} />
      <input type="hidden" name="project" value={project} />
    </>
  );
  const outcome = (state: typeof bound) => {
    if (!state) return null;
    if ("denied" in state) return <p className="notice notice-error" role="alert">Tu rol no permite gestionar conectores en este proyecto.</p>;
    if (state.ok) return (
      <p className="notice notice-info" role="status">
        {state.state === "SYNCING" ? "Auditoría vinculada. Ya puedes consultar su estado." : "Reserva liberada. Ya puedes lanzar otra auditoría."}
        {state.audited === false && " El cambio no ha quedado en el registro de auditoría del proyecto: revisa la firma del servidor."}
      </p>
    );
    return <p className="notice notice-error" role="alert">{errorText(state.error.code, state.error.message)}<span className="diag">Código: {state.error.code}</span></p>;
  };

  return (
    <section aria-labelledby="o-reconciliar" className="section">
      <h2 id="o-reconciliar">Lanzamiento pendiente de confirmar</h2>
      <p className="notice">
        El {dateFormat.format(new Date(createdAt))} se reservó un lanzamiento, pero no llegó la respuesta de OpenSEO. No sabemos si el rastreo
        se creó. Para no duplicarlo ni gastar créditos dos veces, la plataforma no lanzará otro hasta que lo resuelvas.
      </p>
      <form action={bind} className="card form">
        {hidden}
        <input type="hidden" name="intent" value="bind" />
        <h3>Si OpenSEO muestra el rastreo</h3>
        <div className="field">
          <label htmlFor="o-reconcile-audit">Identificador de la auditoría en OpenSEO</label>
          <input id="o-reconcile-audit" name="auditId" required pattern="[A-Za-z0-9_\-]{1,64}" maxLength={64} autoComplete="off" spellCheck={false} />
        </div>
        <div className="field field-check">
          <input id="o-reconcile-bind-confirm" name="confirm" type="checkbox" required />
          <label htmlFor="o-reconcile-bind-confirm">He comprobado en OpenSEO que este rastreo es de este proyecto y se lanzó en esa fecha.</label>
        </div>
        <button type="submit" className="btn btn-block" disabled={binding}>{binding ? "Vinculando…" : "Vincular auditoría"}</button>
        {outcome(bound)}
      </form>
      <form action={release} className="card form">
        {hidden}
        <input type="hidden" name="intent" value="release" />
        <h3>Si OpenSEO no muestra ningún rastreo</h3>
        <div className="field field-check">
          <input id="o-reconcile-release-confirm" name="confirm" type="checkbox" required />
          <label htmlFor="o-reconcile-release-confirm">He comprobado en OpenSEO que no se creó ningún rastreo con esa fecha.</label>
        </div>
        <button type="submit" className="btn btn-block" disabled={releasing}>{releasing ? "Liberando…" : "Liberar la reserva"}</button>
        {outcome(released)}
      </form>
    </section>
  );
}
