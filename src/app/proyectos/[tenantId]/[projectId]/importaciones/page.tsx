import Link from "next/link";
import { notFound } from "next/navigation";
import { Notice } from "@/components/Notice";
import { ProjectNav } from "@/components/ProjectNav";
import { EmptyState, PageHead, StatusPill } from "@/components/ui";
import { projectAccess } from "@/lib/access";
import { pick } from "@/lib/auth/messages";
import { requireSession } from "@/lib/auth/session";
import { formatDateTime } from "@/lib/format";
import { uploadImport } from "@/lib/imports/actions";
import { IMPORT_ERRORS, IMPORT_NOTICES, IMPORT_STATUS_LABELS, SOURCE_KIND_LABELS } from "@/lib/imports/labels";
import { listImports, loadProjectRef } from "@/lib/imports/repository";
import { serverKeyring } from "@/lib/provenance/keyring";
import { myProjectMembership } from "@/lib/tenancy";

export default async function ImportsPage({ params, searchParams }: {
  params: Promise<{ tenantId: string; projectId: string }>;
  searchParams: Promise<{ error?: string; borrada?: string }>;
}) {
  const [{ tenantId, projectId }, { error, borrada }, { user, supabase }] = await Promise.all([params, searchParams, requireSession()]);
  const access = projectAccess(await myProjectMembership(supabase, user.id, tenantId, projectId));
  if (!access) notFound();
  const { project } = access;
  const ref = await loadProjectRef(supabase, { tenantId: project.tenantId, projectId: project.projectId });
  if (!ref) notFound();
  const imports = await listImports(supabase, ref);
  const canImport = access.permissions.find((p) => p.action === "draft")?.decision.allowed === true;
  const signing = serverKeyring() !== null;
  const base = `/proyectos/${project.tenantId}/${project.projectId}`;

  return (
    <>
      <p className="muted small">{project.name}</p>
      <ProjectNav base={base} current="importaciones" />
      <PageHead title="Importaciones" />
      <Notice tone="error" text={pick(IMPORT_ERRORS, error)} />
      <Notice tone="info" text={borrada ? IMPORT_NOTICES.borrada : null} />
      <p>
        Hallazgos que alguien ha recogido fuera de la plataforma (una auditoría, una exportación de rastreo o un inventario)
        y que se importan con su fuente y su fecha. Son datos <strong>declarados</strong>: no se presentan como mediciones
        verificadas de un proveedor.
      </p>

      <section aria-labelledby="i-lista" className="section">
        <h2 id="i-lista">Importaciones del proyecto</h2>
        {imports.length === 0 ? (
          <EmptyState title="Sin importaciones">
            <p>Este proyecto todavía no tiene datos importados.{canImport ? " Puedes importar el primer fichero más abajo." : ""}</p>
          </EmptyState>
        ) : (
          <ul className="cards">
            {imports.map((i) => {
              const status = IMPORT_STATUS_LABELS[i.status];
              return (
                <li key={i.id} className="card">
                  <div className="card-head">
                    <h3><Link href={`${base}/importaciones/${i.id}`}>{i.source_label}</Link></h3>
                    <StatusPill tone={status.tone}>{status.label}</StatusPill>
                  </div>
                  <dl className="facts">
                    <div><dt>Fuente</dt><dd>{SOURCE_KIND_LABELS[i.source_kind] ?? i.source_kind}{i.source_tool ? ` · ${i.source_tool}` : ""}</dd></div>
                    <div><dt>Capturado en la fuente</dt><dd>{formatDateTime(i.captured_at)}</dd></div>
                    <div><dt>Importado</dt><dd>{formatDateTime(i.created_at)}</dd></div>
                    <div><dt>Contenido</dt><dd>{i.finding_count} hallazgos válidos · {i.error_count} errores de validación</dd></div>
                  </dl>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <section aria-labelledby="i-nueva" className="section">
        <h2 id="i-nueva">Importar un fichero</h2>
        {!canImport ? (
          <p className="muted">Tu rol en este proyecto permite consultar las importaciones, no crearlas.</p>
        ) : !signing ? (
          <EmptyState title="Importación no disponible" requires={["Claves de firma de auditoría configuradas en el servidor por el propietario (ADR 0004)"]}>
            <p>Cada importación deja un registro de auditoría firmado. Sin la firma configurada no se acepta ningún fichero.</p>
          </EmptyState>
        ) : (
          <form action={uploadImport} className="card form">
            <input type="hidden" name="tenant" value={project.tenantId} />
            <input type="hidden" name="project" value={project.projectId} />
            <div className="field">
              <label htmlFor="i-file">Fichero JSON (formato rubik-import-v1)</label>
              <input id="i-file" name="file" type="file" accept="application/json,.json" required aria-describedby="i-file-help" />
              <p id="i-file-help" className="muted small">
                Máximo 900 000 bytes y 5000 hallazgos. El fichero debe declarar este proyecto ({project.tenantId}/{project.projectId}),
                la fuente y la fecha de captura con zona horaria. No se guarda el fichero original, solo su huella SHA-256 y los
                hallazgos validados.
              </p>
            </div>
            <button type="submit" className="btn btn-block">Importar</button>
          </form>
        )}
      </section>
    </>
  );
}
