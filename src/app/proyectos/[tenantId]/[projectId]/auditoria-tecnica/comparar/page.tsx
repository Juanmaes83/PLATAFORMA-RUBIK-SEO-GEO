import Link from "next/link";
import { notFound } from "next/navigation";
import { ProjectNav } from "@/components/ProjectNav";
import { AuditComparisonView } from "@/components/AuditComparisonView";
import { EmptyState, PageHead } from "@/components/ui";
import { projectAccess } from "@/lib/access";
import { requireSession } from "@/lib/auth/session";
import { loadProjectRef } from "@/lib/imports/repository";
import { auditSide, chronological, compareAudits } from "@/lib/openseo/compare";
import { serverKeyring } from "@/lib/provenance/keyring";
import { loadProviderResult } from "@/lib/provenance/repository";
import { myProjectMembership } from "@/lib/tenancy";

// Comparison of two saved OpenSEO issue results of this project (CORE-9.6, first tranche).
// Both are loaded through the user's RLS client with the expected project and re-verified
// (signature, hash and client context) before a single row is compared. Nothing is called.
export default async function CompareAuditsPage({ params, searchParams }: {
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
  const back = <p><Link href={`${base}/auditoria-tecnica`}>← Volver a la auditoría técnica</Link></p>;
  const head = (
    <>
      <p className="muted small">{project.name}</p>
      <ProjectNav base={base} current="auditoria-tecnica" />
      <PageHead title="Comparar auditorías" />
    </>
  );

  if (typeof antes !== "string" || typeof despues !== "string" || antes === despues) {
    return (
      <>
        {head}
        <EmptyState title="Elige dos resultados distintos" requires={["Dos resultados de incidencias guardados en este proyecto"]}>
          <p>Abre la comparación desde el historial firmado de la auditoría técnica.</p>
        </EmptyState>
        {back}
      </>
    );
  }

  const keyring = serverKeyring();
  const [first, second] = keyring ? await Promise.all([loadProviderResult(supabase, ref, antes, keyring), loadProviderResult(supabase, ref, despues, keyring)]) : [null, null];
  if ((first && !first.ok && first.error === "NOT_FOUND") || (second && !second.ok && second.error === "NOT_FOUND")) notFound();
  if (!keyring || !first?.ok || !second?.ok) {
    return (
      <>
        {head}
        <EmptyState title="No se pueden verificar los resultados" requires={[!keyring ? "Claves de firma disponibles en el servidor" : "Almacenamiento CORE-9.2 accesible"]}>
          <p>No se compara nada sin comprobar antes la firma y el contexto del proyecto de ambos resultados.</p>
        </EmptyState>
        {back}
      </>
    );
  }

  const left = first.verification.verified ? auditSide(first.verification.result) : null;
  const right = second.verification.verified ? auditSide(second.verification.result) : null;
  if (!left || !right) {
    const unverified = !first.verification.verified || !second.verification.verified;
    return (
      <>
        {head}
        <EmptyState title={unverified ? "Verificación fallida" : "Estos resultados no se pueden comparar"}>
          <p>{unverified
            ? "Al menos uno de los resultados no supera la comprobación de firma, huella o contexto del proyecto; no se muestran sus datos."
            : "Solo se comparan resultados de incidencias de OpenSEO."}</p>
        </EmptyState>
        {back}
      </>
    );
  }

  const [before, after] = chronological(left, right);
  return (
    <>
      {head}
      <p>Diferencias observadas entre dos capturas firmadas. Una incidencia se identifica por su categoría y su URL. La comparación no explica la causa de un cambio.</p>
      <AuditComparisonView comparison={compareAudits(before, after)} />
      {back}
    </>
  );
}
