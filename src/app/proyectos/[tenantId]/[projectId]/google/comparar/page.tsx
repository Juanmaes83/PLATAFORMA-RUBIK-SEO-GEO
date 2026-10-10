import type { ReactNode } from "react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { GoogleComparisonView } from "@/components/GoogleComparisonView";
import { ProjectNav } from "@/components/ProjectNav";
import { EmptyState, PageHead } from "@/components/ui";
import { projectAccess } from "@/lib/access";
import { requireSession } from "@/lib/auth/session";
import { formatDateTime } from "@/lib/format";
import { loadProjectRef } from "@/lib/imports/repository";
import { listGoogleCaptures } from "@/lib/openseo/google/capture";
import { PROVIDER_LABELS } from "@/lib/openseo/google/capture-messages";
import { compareGoogleCaptures } from "@/lib/openseo/google/compare";
import { serverKeyring } from "@/lib/provenance/keyring";
import { loadProviderResult } from "@/lib/provenance/repository";
import { myProjectMembership } from "@/lib/tenancy";

// Comparison of two stored Google captures of this project. Both are loaded through the user's RLS
// client and re-verified (signature, hash and project context) before any row is compared; the
// query each one used is read from its signed requestContext. Nothing is requested from Google.
export default async function CompareGoogleCapturesPage({ params, searchParams }: {
  params: Promise<{ tenantId: string; projectId: string }>;
  searchParams: Promise<{ antes?: string; despues?: string }>;
}) {
  const [{ tenantId, projectId }, { antes, despues }, { user, supabase }] = await Promise.all([params, searchParams, requireSession()]);
  const access = projectAccess(await myProjectMembership(supabase, user.id, tenantId, projectId));
  if (!access) notFound();
  const { project } = access;
  const base = `/proyectos/${project.tenantId}/${project.projectId}`;
  const ref = await loadProjectRef(supabase, { tenantId: project.tenantId, projectId: project.projectId });
  if (!ref) notFound();
  const history = await listGoogleCaptures(supabase, ref, 50);
  const chosen = typeof antes === "string" && typeof despues === "string" && antes !== despues;
  const option = (r: { id: string; provider: keyof typeof PROVIDER_LABELS; status: string; capturedAt: string | null; createdAt: string }) =>
    `${PROVIDER_LABELS[r.provider]} · ${formatDateTime(r.capturedAt ?? r.createdAt)} · ${r.status}`;

  let body: ReactNode;
  if (!chosen) {
    body = null;
  } else {
    const keyring = serverKeyring();
    const [a, b] = keyring ? await Promise.all([loadProviderResult(supabase, ref, antes, keyring), loadProviderResult(supabase, ref, despues, keyring)]) : [null, null];
    if ((a && !a.ok && a.error === "NOT_FOUND") || (b && !b.ok && b.error === "NOT_FOUND")) notFound();
    if (!keyring || !a?.ok || !b?.ok) {
      body = (
        <EmptyState title="No se pueden verificar las capturas" requires={[!keyring ? "Claves de firma disponibles en el servidor" : "Almacenamiento de resultados accesible"]}>
          <p>No se compara nada sin comprobar antes la firma y el contexto del proyecto de ambas capturas.</p>
        </EmptyState>
      );
    } else {
      const side = (r: typeof a, id: string) => ({ id: r.row.id ?? id, provider: r.row.provider, status: r.row.status, verified: r.verification.verified,
        signedPayload: r.row.signed_payload, data: r.row.data });
      body = <GoogleComparisonView base={base} comparison={compareGoogleCaptures(side(a, antes), side(b, despues))} />;
    }
  }

  return (
    <>
      <p className="muted small">{project.name}</p>
      <ProjectNav base={base} current="google" />
      <PageHead title="Comparar capturas de Google" />
      <p>Compara dos capturas guardadas de la misma propiedad. Se verifican las dos firmas y no se consulta a Google.</p>
      {!history.ok ? (
        <EmptyState title="Historial no disponible"><p>No se pudo leer el historial ahora mismo.</p></EmptyState>
      ) : history.rows.length < 2 ? (
        <EmptyState title="Hacen falta dos capturas" requires={["Dos capturas guardadas de la misma propiedad"]}>
          <p>Este proyecto tiene {history.rows.length === 0 ? "ninguna captura" : "una sola captura"} de Google guardada.</p>
        </EmptyState>
      ) : (
        <form method="get" action={`${base}/google/comparar`} className="form">
          <div className="field">
            <label htmlFor="gc-antes">Una captura</label>
            <select id="gc-antes" name="antes" required defaultValue={chosen ? antes : history.rows[1].id}>
              {history.rows.map((r) => <option key={r.id} value={r.id}>{option(r)}</option>)}
            </select>
          </div>
          <div className="field">
            <label htmlFor="gc-despues">Otra captura</label>
            <select id="gc-despues" name="despues" required defaultValue={chosen ? despues : history.rows[0].id}>
              {history.rows.map((r) => <option key={r.id} value={r.id}>{option(r)}</option>)}
            </select>
          </div>
          <button type="submit" className="btn">Comparar</button>
        </form>
      )}
      {typeof antes === "string" && antes === despues && <p className="notice notice-error" role="alert">Elige dos capturas distintas.</p>}
      {body}
      <p><Link href={`${base}/google`}>← Volver a Search Console y GA4</Link></p>
    </>
  );
}
