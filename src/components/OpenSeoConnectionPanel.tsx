"use client";

import { useActionState } from "react";
import { StatusPill } from "@/components/ui";
import { connectProjectAction, revokeProjectAction } from "@/lib/openseo/actions";
import { CONNECTION_CHANGE_TEXT } from "@/lib/openseo/labels";
import type { Readiness } from "@/lib/openseo/readiness";

// Owner panel for this project's OpenSEO connection (ADR 0007, phase 3). The server renders the
// current state; this component only submits explicit, confirmed changes. It never receives a
// key, and of the OpenSEO project identifier it only shows the last characters.

export type ConnectionPanelView =
  | { state: "unavailable" }
  | { state: "none"; hostOptions: string[]; defaultHost: string | null }
  | { state: "active"; hosts: string[]; grantedAt: string; providerHint: string };

const dateFormat = new Intl.DateTimeFormat("es-ES", { dateStyle: "long", timeStyle: "short", timeZone: "Europe/Madrid" });

function Outcome({ state }: { state: Awaited<ReturnType<typeof connectProjectAction>> }) {
  if (!state) return null;
  if ("denied" in state) return <p className="notice notice-error" role="alert">{CONNECTION_CHANGE_TEXT.CONNECTION_FORBIDDEN}</p>;
  if (state.ok) return (
    <p className="notice notice-info" role="status">
      {state.change === "connected" ? "Conexión guardada." : "Conexión revocada."}
      {!state.audited && " El cambio no ha quedado en el registro de auditoría del proyecto: revisa la firma del servidor."}
    </p>
  );
  return (
    <p className="notice notice-error" role="alert">
      {CONNECTION_CHANGE_TEXT[state.error] ?? "No se ha podido completar el cambio."}
      <span className="diag">Código: {state.error}</span>
    </p>
  );
}

const CHECK_LABEL = { ok: "Correcto", blocked: "Pendiente", review: "Revisar" } as const;
const CHECK_TONE = { ok: "ok", blocked: "warn", review: "neutral" } as const;

function ReadinessList({ readiness }: { readiness: Readiness }) {
  return (
    <div className="card">
      <div className="card-head">
        <h3>Antes de activar el modo por proyecto</h3>
        <StatusPill tone={readiness.ready ? "ok" : "warn"}>{readiness.ready ? "Sin bloqueos" : "Con pendientes"}</StatusPill>
      </div>
      <ul className="checklist">
        {readiness.checks.map((c) => (
          <li key={c.id}><StatusPill tone={CHECK_TONE[c.state]}>{CHECK_LABEL[c.state]}</StatusPill> {c.text}</li>
        ))}
      </ul>
      <p className="muted small">Solo lectura. Activar el modo (variable del servidor y nuevo despliegue) es una decisión aparte de la persona titular; esta lista no cambia nada.</p>
    </div>
  );
}

export function OpenSeoConnectionPanel({ tenant, project, view, projectMode, readiness }: { tenant: string; project: string; view: ConnectionPanelView; projectMode: boolean; readiness?: Readiness }) {
  const [connected, connect, connecting] = useActionState(connectProjectAction, null);
  const [revoked, revoke, revoking] = useActionState(revokeProjectAction, null);
  const hidden = (
    <>
      <input type="hidden" name="tenant" value={tenant} />
      <input type="hidden" name="project" value={project} />
    </>
  );

  return (
    <section aria-labelledby="o-conexion-proyecto" className="section">
      <h2 id="o-conexion-proyecto">Conexión de OpenSEO del proyecto</h2>
      <p className="muted">
        {projectMode
          ? "Las auditorías de este proyecto usan solo esta conexión."
          : "El servidor usa todavía la configuración global de OpenSEO. Esta conexión queda registrada, pero no se usará hasta activar el modo por proyecto."}
      </p>

      {view.state === "unavailable" && (
        <p className="notice">{CONNECTION_CHANGE_TEXT.CONNECTION_UNAVAILABLE}</p>
      )}

      {view.state === "active" && (
        <div className="card">
          <div className="card-head">
            <h3>Conexión activa</h3>
            <StatusPill tone="ok">Activa</StatusPill>
          </div>
          <dl className="facts">
            <div><dt>Proyecto de OpenSEO</dt><dd>Termina en {view.providerHint}</dd></div>
            <div><dt>Hosts auditables</dt><dd>{view.hosts.join(", ")}</dd></div>
            <div><dt>Consentimiento</dt><dd>{dateFormat.format(new Date(view.grantedAt))}</dd></div>
            <div><dt>Credencial</dt><dd>Clave de la plataforma, guardada solo en el servidor</dd></div>
          </dl>
          <form action={revoke} className="form">
            {hidden}
            <div className="field field-check">
              <input id="o-revoke-confirm" name="confirm" type="checkbox" required />
              <label htmlFor="o-revoke-confirm">Entiendo que, al revocarla, este proyecto deja de usar OpenSEO hasta crear una conexión nueva. El historial guardado se conserva.</label>
            </div>
            <button type="submit" className="btn btn-block" disabled={revoking}>{revoking ? "Revocando…" : "Revocar conexión"}</button>
          </form>
          <Outcome state={revoked} />
        </div>
      )}

      {readiness && <ReadinessList readiness={readiness} />}

      {view.state === "none" && view.hostOptions.length === 0 && (
        <p className="notice">Define primero el dominio del proyecto: la conexión solo admite ese dominio y su variante con o sin www.</p>
      )}

      {view.state === "none" && view.hostOptions.length > 0 && (
        <form action={connect} className="card form">
          {hidden}
          <div className="field">
            <label htmlFor="o-provider-project">Identificador del proyecto en OpenSEO</label>
            <input id="o-provider-project" name="openseoProjectId" required pattern="[A-Za-z0-9_\-]{1,100}" maxLength={100} autoComplete="off" spellCheck={false} />
          </div>
          <fieldset className="field">
            <legend>Hosts que se podrán auditar</legend>
            {view.hostOptions.map((host, i) => (
              <div className="field field-check" key={host}>
                <input id={`o-host-${i}`} name="host" type="checkbox" value={host} defaultChecked={host === view.defaultHost} />
                <label htmlFor={`o-host-${i}`}>{host}</label>
              </div>
            ))}
          </fieldset>
          <div className="field field-check">
            <input id="o-consent" name="consent" type="checkbox" required />
            <label htmlFor="o-consent">Como titular, autorizo que la plataforma use OpenSEO para este proyecto con la clave de la plataforma. Las auditorías siguen siendo manuales y pueden consumir créditos.</label>
          </div>
          <button type="submit" className="btn btn-block" disabled={connecting}>{connecting ? "Guardando…" : "Conectar OpenSEO"}</button>
          <Outcome state={connected} />
        </form>
      )}
    </section>
  );
}
