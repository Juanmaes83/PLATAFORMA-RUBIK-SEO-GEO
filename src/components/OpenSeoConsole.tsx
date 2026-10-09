"use client";

import { useActionState } from "react";
import { StatusPill } from "@/components/ui";
import { followAuditAction, startAuditAction, testConnectionAction } from "@/lib/openseo/actions";
import { AUDIT_STATE_LABELS, CONNECTION_LABELS, REASON_TEXT, SEVERITY_LABELS, errorText } from "@/lib/openseo/labels";

// Owner console for the OpenSEO bridge. Every request is one explicit click handled by a
// Server Action; this component only renders the plain, already-normalized results it gets
// back. It never sees a key, the endpoint or the OpenSEO project id.

function Code({ code }: { code: string | null | undefined }) {
  return code ? <span className="diag">Código: {code}</span> : null;
}

function Problem({ code, message, diagnostic }: { code: string; message?: string; diagnostic?: string }) {
  return (
    <p className="notice notice-error" role="alert">
      {errorText(code) || message}
      <Code code={code} />
      {diagnostic && <span className="diag">Estructura recibida (sin valores): {diagnostic}</span>}
    </p>
  );
}

const Denied = () => <p className="notice notice-error" role="alert">Tu rol no permite gestionar conectores en este proyecto.</p>;

export function OpenSeoConsole({ tenant, project, defaultUrl, maxPages, savingEnabled = false }: { tenant: string; project: string; defaultUrl: string; maxPages: number; savingEnabled?: boolean }) {
  const [conn, testConnection, testing] = useActionState(testConnectionAction, null);
  const [start, startAudit, starting] = useActionState(startAuditAction, null);
  const [follow, followAudit, following] = useActionState(followAuditAction, null);
  const startedId = start && !("denied" in start) && start.ok ? start.auditId ?? "" : "";
  const hidden = (
    <>
      <input type="hidden" name="tenant" value={tenant} />
      <input type="hidden" name="project" value={project} />
    </>
  );

  return (
    <>
      <section aria-labelledby="o-conexion" className="section">
        <h2 id="o-conexion">1. Probar la conexión</h2>
        <p>Comprueba la salud de la instancia y la autenticación con whoami. No lanza ninguna auditoría ni consulta de pago.</p>
        <form action={testConnection} className="form">
          {hidden}
          <button type="submit" className="btn btn-block" disabled={testing}>{testing ? "Probando…" : "Probar conexión"}</button>
        </form>
        {conn && ("denied" in conn ? <Denied /> : (
          <div className="card" role="status">
            <div className="card-head">
              <h3>Resultado</h3>
              <StatusPill tone={CONNECTION_LABELS[conn.status]?.tone ?? "neutral"}>{CONNECTION_LABELS[conn.status]?.label ?? conn.status}</StatusPill>
            </div>
            <p>{CONNECTION_LABELS[conn.status]?.text}</p>
            {conn.reason && REASON_TEXT[conn.reason] && <p>{REASON_TEXT[conn.reason]}</p>}
            {conn.error && <Problem code={conn.error.code} message={conn.error.message} />}
            <dl className="facts">
              <div><dt>Salud de la instancia</dt><dd>{conn.health === "ok" ? "Correcta" : conn.health === "issues" ? "Con problemas de configuración" : conn.health === "unreachable" ? "Sin respuesta válida" : "Sin comprobar"}</dd></div>
              <div><dt>Autorización</dt><dd>{conn.authorization === "VERIFIED" ? "Verificada" : conn.authorization === "REJECTED" ? "Rechazada" : "Sin verificar"}</dd></div>
              {conn.failingChecks.length > 0 && <div><dt>Comprobaciones que fallan</dt><dd>{conn.failingChecks.join(", ")}</dd></div>}
              {conn.whoamiFields.length > 0 && <div><dt>Campos de whoami observados (sin valores)</dt><dd>{conn.whoamiFields.join(", ")}</dd></div>}
            </dl>
            <Code code={conn.reason ?? conn.status} />
          </div>
        ))}
      </section>

      <section aria-labelledby="o-lanzar" className="section">
        <h2 id="o-lanzar">2. Lanzar una auditoría manual</h2>
        <p>
          Rastreo propio de OpenSEO, <strong>sin Lighthouse</strong> y con un máximo de {maxPages} páginas. Solo se admite el
          dominio de este proyecto autorizado en el servidor; nunca previews ni entornos protegidos.
        </p>
        <form action={startAudit} className="card form">
          {hidden}
          <div className="field">
            <label htmlFor="o-url">URL de inicio (https)</label>
            <input id="o-url" name="url" type="url" required defaultValue={defaultUrl} inputMode="url" />
          </div>
          <div className="field">
            <label htmlFor="o-max">Máximo de páginas (10–{maxPages})</label>
            <input id="o-max" name="maxPages" type="number" required min={10} max={maxPages} step={1} defaultValue={Math.min(50, maxPages)} />
          </div>
          <div className="field field-check">
            <input id="o-confirm" name="confirm" type="checkbox" required />
            <label htmlFor="o-confirm">Confirmo que lanzo esta auditoría a mano y que el sitio es del cliente de este proyecto</label>
          </div>
          <button type="submit" className="btn btn-block" disabled={starting || following}>{starting ? "Lanzando…" : "Lanzar auditoría"}</button>
        </form>
        {start && ("denied" in start ? <Denied /> : start.ok ? (
          <p className="notice notice-info" role="status">
            {start.reused ? "Auditoría activa reutilizada" : "Auditoría iniciada"}{start.maxPages !== null ? ` con un máximo de ${start.maxPages} páginas` : ""}. Identificador: <code>{start.auditId}</code>
          </p>
        ) : start.error && <Problem code={start.error.code} message={start.error.message} />)}
      </section>

      <section aria-labelledby="o-seguir" className="section">
        <h2 id="o-seguir">3. Consultar el estado y los resultados</h2>
        <p>Cada consulta es una sola petición. Cuando la auditoría termina se muestran sus incidencias normalizadas por el Core.</p>
        <form action={followAudit} className="card form">
          {hidden}
          <div className="field">
            <label htmlFor="o-audit">Identificador de auditoría</label>
            <input id="o-audit" name="auditId" type="text" required key={startedId} pattern="[A-Za-z0-9_\-]{1,64}" maxLength={64} defaultValue={startedId} onFocus={(e) => e.currentTarget.select()} autoComplete="off" />
          </div>
          <button type="submit" name="intent" value="status" className="btn btn-block" disabled={following || starting}>{following ? "Consultando…" : "Consultar estado"}</button>
          <button type="submit" name="intent" value="save" className="btn btn-block" disabled={!savingEnabled || following || starting}>Consultar y guardar resultados</button>
          {!savingEnabled && <p className="muted small">El guardado estará disponible cuando el servidor tenga configurado el almacenamiento y la firma.</p>}
        </form>
        {follow && ("denied" in follow ? <Denied /> : (
          <div className="card" role="status">
            <div className="card-head">
              <h3>Auditoría {follow.auditId}</h3>
              {follow.progress.state && (
                <StatusPill tone={AUDIT_STATE_LABELS[follow.progress.state]?.tone ?? "neutral"}>{AUDIT_STATE_LABELS[follow.progress.state]?.label ?? follow.progress.state}</StatusPill>
              )}
            </div>
            {startedId && startedId !== follow.auditId && <p className="notice notice-info">Este resultado pertenece a una auditoría anterior. La última iniciada es <code>{startedId}</code>; puedes consultar la última iniciada con ese identificador.</p>}
            {follow.progress.error && <Problem code={follow.progress.error.code} message={follow.progress.error.message} diagnostic={follow.progress.error.diagnostic} />}
            {follow.captureError && <Problem code={follow.captureError.code} message={follow.captureError.message} />}
            {follow.saveStatus === "saved" && <p className="notice notice-info">Resultados guardados en el historial de este proyecto.</p>}
            {follow.saveStatus === "pending" && <p className="notice notice-info">La auditoría sigue en curso. Cuando termine, vuelve a pulsar «Consultar y guardar resultados».</p>}
            <dl className="facts">
              <div><dt>Estado en OpenSEO</dt><dd>{follow.progress.providerStatus ?? "Desconocido"}{follow.progress.phase ? ` · ${follow.progress.phase}` : ""}</dd></div>
              <div><dt>Páginas rastreadas</dt><dd>{follow.progress.pagesCrawled ?? "Desconocido"}{follow.progress.pagesTotal !== null ? ` de ${follow.progress.pagesTotal}` : ""}</dd></div>
            </dl>
            {follow.report && (
              <>
                <h4>Incidencias ({follow.report.issues.length}{follow.report.issuesPartial?.truncated ? ", lista recortada" : ""})</h4>
                {follow.report.issues.length === 0 ? (
                  <p>OpenSEO no ha devuelto incidencias para este dominio.</p>
                ) : (
                  <ul className="checklist">
                    {follow.report.issues.map((i) => (
                      <li key={i.id}>
                        <strong>{SEVERITY_LABELS[i.severity] ?? i.severity}</strong> · {i.category}
                        {i.url ? <> · <span className="break">{i.url}</span></> : null}
                      </li>
                    ))}
                  </ul>
                )}
                <p className="muted small">
                  Páginas del dominio en el informe: {follow.report.pages.length}
                  {follow.report.pagesTotal !== null ? ` de ${follow.report.pagesTotal}` : ""}.
                  {follow.report.outsideProject > 0 ? ` Fuera del ámbito del proyecto: ${follow.report.hiddenPages} páginas y ${follow.report.hiddenIssues} incidencias ocultas.` : ""}
                  {follow.saveStatus !== "saved" && <> Resultados sin guardar.{savingEnabled ? " Puedes guardarlos con «Consultar y guardar resultados»." : " El guardado aún no está activado."}</>}
                </p>
                {follow.report.errors.map((e) => <Problem key={e.code} code={e.code} message={e.message} />)}
              </>
            )}
          </div>
        ))}
      </section>
    </>
  );
}
