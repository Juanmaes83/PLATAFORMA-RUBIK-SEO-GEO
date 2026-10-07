import Link from "next/link";
import { notFound } from "next/navigation";
import { Notice } from "@/components/Notice";
import { ProjectNav } from "@/components/ProjectNav";
import { PageHead, StatusPill } from "@/components/ui";
import { projectAccess } from "@/lib/access";
import { pick } from "@/lib/auth/messages";
import { requireSession } from "@/lib/auth/session";
import { formatDateTime } from "@/lib/format";
import { deleteImport } from "@/lib/imports/actions";
import { FINDING_STATUS_LABELS, IMPORT_ERRORS, IMPORT_NOTICES, IMPORT_STATUS_LABELS, ROW_ERROR_LABELS, SEVERITY_LABELS, SOURCE_KIND_LABELS } from "@/lib/imports/labels";
import { getImport, loadProjectRef } from "@/lib/imports/repository";
import { myProjectMembership } from "@/lib/tenancy";

export default async function ImportPage({ params, searchParams }: {
  params: Promise<{ tenantId: string; projectId: string; importId: string }>;
  searchParams: Promise<{ importada?: string; aviso?: string; error?: string }>;
}) {
  const [{ tenantId, projectId, importId }, { importada, aviso, error }, { user, supabase }] = await Promise.all([params, searchParams, requireSession()]);
  const access = projectAccess(await myProjectMembership(supabase, user.id, tenantId, projectId));
  if (!access) notFound();
  const { project } = access;
  const ref = await loadProjectRef(supabase, { tenantId: project.tenantId, projectId: project.projectId });
  // Another project's import and a missing one look the same.
  const imp = ref ? await getImport(supabase, ref, importId) : null;
  if (!imp) notFound();
  const base = `/proyectos/${project.tenantId}/${project.projectId}`;
  const status = IMPORT_STATUS_LABELS[imp.status];
  const canDelete = access.permissions.find((p) => p.action === "delete-data")?.decision.allowed === true;

  return (
    <>
      <p className="muted small">{project.name}</p>
      <ProjectNav base={base} current="importaciones" />
      <PageHead title={imp.source_label}>
        <StatusPill tone={status.tone}>{status.label}</StatusPill>
      </PageHead>
      <Notice tone="info" text={pick(IMPORT_NOTICES, importada) ?? (aviso === "duplicado" ? IMPORT_NOTICES.duplicado : null)} />
      <Notice tone="error" text={pick(IMPORT_ERRORS, error)} />
      <p className="muted small">{status.help} Datos declarados por importación manual: no verificados por un proveedor.</p>

      <dl className="facts card">
        <div><dt>Fuente</dt><dd>{SOURCE_KIND_LABELS[imp.source_kind] ?? imp.source_kind}{imp.source_tool ? ` · ${imp.source_tool}` : ""}</dd></div>
        {imp.source_url && <div><dt>URL de la fuente</dt><dd><span className="break">{imp.source_url}</span></dd></div>}
        <div><dt>Capturado en la fuente</dt><dd>{formatDateTime(imp.captured_at)}</dd></div>
        {imp.period_start && <div><dt>Periodo</dt><dd>{formatDateTime(imp.period_start)} – {formatDateTime(imp.period_end)}</dd></div>}
        <div><dt>Importado</dt><dd>{formatDateTime(imp.created_at)}</dd></div>
        <div><dt>Huella del fichero (SHA-256)</dt><dd><code className="break">{imp.file_sha256}</code></dd></div>
      </dl>

      <section aria-labelledby="d-hallazgos" className="section">
        <h2 id="d-hallazgos">Hallazgos ({imp.finding_count})</h2>
        {imp.findings.length === 0 ? (
          <p className="muted">{imp.status === "empty" ? "El fichero no declara hallazgos." : "Ninguna fila válida."}</p>
        ) : (
          <ul className="cards">
            {imp.findings.map((f) => (
              <li key={`${f.url}|${f.ruleId}`} className="card">
                <div className="card-head">
                  <h3>{f.title}</h3>
                  <StatusPill tone={f.severity === "critical" || f.severity === "high" ? "warn" : "neutral"}>{SEVERITY_LABELS[f.severity]}</StatusPill>
                </div>
                <dl className="facts">
                  <div><dt>URL</dt><dd><span className="break">{f.url}</span></dd></div>
                  <div><dt>Regla</dt><dd><code>{f.ruleId}</code></dd></div>
                  <div><dt>Observación</dt><dd>{f.observation}</dd></div>
                  {f.proposal && <div><dt>Propuesta</dt><dd>{f.proposal}</dd></div>}
                  {f.evidenceRef && <div><dt>Evidencia</dt><dd><span className="break">{f.evidenceRef}</span></dd></div>}
                  <div><dt>Estado declarado</dt><dd>{FINDING_STATUS_LABELS[f.status]}</dd></div>
                </dl>
              </li>
            ))}
          </ul>
        )}
      </section>

      {imp.errors.length > 0 && (
        <section aria-labelledby="d-errores" className="section">
          <h2 id="d-errores">Errores de validación ({imp.error_count})</h2>
          <p className="muted small">Las filas con errores no se han guardado. Se indica su posición en el fichero (desde 0) y el campo; nunca el valor rechazado.</p>
          <ul className="plain">
            {imp.errors.map((e, i) => (
              <li key={i}>Fila {e.row} · <code>{e.field}</code> · {ROW_ERROR_LABELS[e.code] ?? e.code}</li>
            ))}
          </ul>
        </section>
      )}

      {canDelete && (
        <section aria-labelledby="d-borrar" className="section">
          <h2 id="d-borrar">Borrar esta importación</h2>
          <form action={deleteImport} className="card form">
            <input type="hidden" name="tenant" value={project.tenantId} />
            <input type="hidden" name="project" value={project.projectId} />
            <input type="hidden" name="id" value={imp.id} />
            <p className="muted small">Borra la importación y sus hallazgos a petición del cliente. El borrado queda en la auditoría del proyecto.</p>
            <div className="field">
              <label htmlFor="d-confirm">Escribe «borrar» para confirmar</label>
              <input id="d-confirm" name="confirm" autoComplete="off" required />
            </div>
            <button type="submit" className="btn btn-block">Borrar importación</button>
          </form>
        </section>
      )}

      <p><Link href={`${base}/importaciones`}>← Volver a las importaciones</Link></p>
    </>
  );
}
