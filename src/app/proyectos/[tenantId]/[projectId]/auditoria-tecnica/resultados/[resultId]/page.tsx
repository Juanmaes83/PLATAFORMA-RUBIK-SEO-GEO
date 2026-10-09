import Link from "next/link";
import { notFound } from "next/navigation";
import { ProjectNav } from "@/components/ProjectNav";
import { EmptyState, PageHead, StatusPill } from "@/components/ui";
import { projectAccess } from "@/lib/access";
import { requireSession } from "@/lib/auth/session";
import { formatDateTime } from "@/lib/format";
import { loadProjectRef } from "@/lib/imports/repository";
import { serverKeyring } from "@/lib/provenance/keyring";
import { loadProviderResult } from "@/lib/provenance/repository";
import { myProjectMembership } from "@/lib/tenancy";

type VisibleRow = { url: string; category: string | null; severity: string | null };

function visibleRows(value: unknown, operation: string): VisibleRow[] {
  if (!Array.isArray(value) || !["auditIssues", "auditPages"].includes(operation)) return [];
  return value.flatMap((row) => {
    if (!row || typeof row !== "object") return [];
    const item = row as Record<string, unknown>;
    if (typeof item.url !== "string" || !item.url.startsWith("https://")) return [];
    return [{
      url: item.url,
      category: operation === "auditIssues" && typeof item.category === "string" ? item.category : null,
      severity: operation === "auditIssues" && typeof item.severity === "string" ? item.severity : null,
    }];
  });
}

export default async function OpenSeoResultPage({ params }: {
  params: Promise<{ tenantId: string; projectId: string; resultId: string }>;
}) {
  const [{ tenantId, projectId, resultId }, { user, supabase }] = await Promise.all([params, requireSession()]);
  const access = projectAccess(await myProjectMembership(supabase, user.id, tenantId, projectId));
  if (!access) notFound();
  const { project } = access;
  const base = `/proyectos/${project.tenantId}/${project.projectId}`;
  const ref = await loadProjectRef(supabase, { tenantId: project.tenantId, projectId: project.projectId });
  if (!ref) notFound();
  const keyring = serverKeyring();
  const loaded = keyring ? await loadProviderResult(supabase, ref, resultId, keyring) : null;
  if (loaded && !loaded.ok && loaded.error === "NOT_FOUND") notFound();

  if (!keyring || !loaded || !loaded.ok) {
    return (
      <>
        <p className="muted small">{project.name}</p>
        <ProjectNav base={base} current="auditoria-tecnica" />
        <PageHead title="Resultado guardado" />
        <EmptyState title="No se puede verificar el resultado" requires={[!keyring ? "Claves de firma disponibles en el servidor" : "Almacenamiento CORE-9.2 accesible"]}>
          <p>No se muestran datos sin comprobar antes la firma y el contexto del proyecto.</p>
        </EmptyState>
        <p><Link href={`${base}/auditoria-tecnica`}>← Volver a la auditoría técnica</Link></p>
      </>
    );
  }

  const { row, verification } = loaded;
  const result = verification.verified ? verification.result as Record<string, unknown> | undefined : undefined;
  const rows = visibleRows(result?.data, row.operation);
  const title = !verification.verified ? "Resultado no confiable" : row.operation === "auditIssues" ? "Incidencias guardadas" : row.operation === "auditPages" ? "Páginas guardadas" : "Resultado guardado";
  return (
    <>
      <p className="muted small">{project.name}</p>
      <ProjectNav base={base} current="auditoria-tecnica" />
      <PageHead title={title}>
        <StatusPill tone={verification.verified ? "ok" : "warn"}>{verification.verified ? "Firma verificada" : "No confiable"}</StatusPill>
      </PageHead>
      {verification.verified && (
        <dl className="facts card">
          <div><dt>Proveedor</dt><dd>{row.provider}</dd></div>
          <div><dt>Estado guardado</dt><dd>{row.status}</dd></div>
          <div><dt>Capturado</dt><dd>{formatDateTime(row.captured_at)}</dd></div>
          <div><dt>Algoritmo de huella</dt><dd>{verification.dataHashAlg}</dd></div>
          <div><dt>Identificador de clave</dt><dd>{verification.keyId}</dd></div>
        </dl>
      )}
      {!verification.verified ? (
        <EmptyState title="Verificación fallida">
          <p>Los datos no se muestran porque la firma, la huella o el contexto del proyecto no coinciden.</p>
        </EmptyState>
      ) : rows.length === 0 ? (
        <p className="muted">El resultado verificado no contiene filas visibles de OpenSEO.</p>
      ) : (
        <ul className="cards">
          {rows.map((item, index) => (
            <li className="card" key={`${item.url}|${item.category ?? "page"}|${index}`}>
              {item.category && <p><strong>{item.severity ?? ""}</strong> · {item.category}</p>}
              <p className="break">{item.url}</p>
            </li>
          ))}
        </ul>
      )}
      <p><Link href={`${base}/auditoria-tecnica`}>← Volver a la auditoría técnica</Link></p>
    </>
  );
}
