import Link from "next/link";
import { Suspense } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";
import { notFound } from "next/navigation";
import { PrintButton } from "@/components/PrintButton";
import { ProjectNav } from "@/components/ProjectNav";
import { PageHead, StatusPill } from "@/components/ui";
import { projectAccess, type ProjectAccess } from "@/lib/access";
import { requireSession } from "@/lib/auth/session";
import { formatDateTime } from "@/lib/format";
import { loadProjectRef } from "@/lib/imports/repository";
import { roleLabel } from "@/lib/labels";
import type { ProjectRef } from "@/lib/provenance/audit";
import { serverKeyring } from "@/lib/provenance/keyring";
import { NATURE_LABEL, STATE_LABEL, coverageOf, type Nature, type ReportSection, type SectionState } from "@/lib/reports/report";
import { readReportSections } from "@/lib/reports/sources";
import type { Database } from "@/lib/supabase/database.types";
import { myProjectMembership } from "@/lib/tenancy";

// N2-14 manual project report: assembled on demand from what the project already stores, read
// with the signed-in user's permissions. Read-only: no write, no audit receipt, no provider call,
// no schedule and no delivery. Printing uses the browser.

const STATE_TONE: Record<SectionState, "ok" | "warn" | "neutral" | "no"> = { available: "ok", partial: "warn", empty: "neutral", unavailable: "no" };
const NATURE_SHORT: Record<Nature, string> = { observed: "Observado", declared: "Declarado", hypothesis: "Hipótesis" };

export default async function ReportPage({ params }: { params: Promise<{ tenantId: string; projectId: string }> }) {
  const [{ tenantId, projectId }, { user, supabase }] = await Promise.all([params, requireSession()]);
  const access = projectAccess(await myProjectMembership(supabase, user.id, tenantId, projectId));
  if (!access) notFound();
  const ref = await loadProjectRef(supabase, { tenantId: access.project.tenantId, projectId: access.project.projectId });
  if (!ref) notFound();
  const base = `/proyectos/${access.project.tenantId}/${access.project.projectId}`;
  // Access and 404 are decided above, before anything streams; only the reads below show a loading state.
  return (
    <>
      <p className="muted small no-print">{access.project.name}</p>
      <div className="no-print"><ProjectNav base={base} current="informe" /></div>
      <Suspense fallback={<p role="status" className="muted">Reuniendo las fuentes del proyecto…</p>}>
        <ReportView access={access} ref_={ref} supabase={supabase} base={base} author={user.email ?? "cuenta sin correo visible"} />
      </Suspense>
    </>
  );
}

async function ReportView({ access, ref_: ref, supabase, base, author }: {
  access: ProjectAccess; ref_: ProjectRef; supabase: SupabaseClient<Database>; base: string; author: string;
}) {
  const { project } = access;
  const generatedAt = new Date().toISOString();
  const sections = await readReportSections(supabase, ref, base, serverKeyring());
  const coverage = coverageOf(sections);
  const titleOf = (id: string) => sections.find((s) => s.id === id)?.title ?? id;
  return (
    <article className="report" aria-label="Informe del proyecto">
      <PageHead title="Informe del proyecto">
        <StatusPill tone={coverage.complete ? "ok" : "warn"}>{coverage.complete ? "Todas las fuentes leídas por completo" : "Informe parcial"}</StatusPill>
      </PageHead>
      <p className="lead">{project.name}{project.domain ? ` · ${project.domain}` : ""}</p>
      <dl className="facts report-meta">
        <div><dt>Generado</dt><dd>{formatDateTime(generatedAt)}</dd></div>
        <div><dt>Por</dt><dd className="break">{author} · {roleLabel(access.role)}</dd></div>
        <div><dt>Organización</dt><dd>{project.tenantName}</dd></div>
        <div><dt>Tipo</dt><dd>Informe manual de solo lectura, generado a petición</dd></div>
      </dl>
      <p className="no-print"><PrintButton label="Imprimir o guardar como PDF" /></p>

      {coverage.complete ? (
        <p className="notice notice-info" role="note">Todas las secciones se leyeron completas{coverage.empty.length ? `; ${coverage.empty.length} no tienen datos y así se indica` : ""}.</p>
      ) : (
        <div className="notice" role="note">
          <p><strong>Este informe no está completo.</strong> No lo presentes como una visión total del proyecto.</p>
          {coverage.unavailable.length > 0 && <p>No disponibles: {coverage.unavailable.map(titleOf).join(", ")}.</p>}
          {coverage.partial.length > 0 && <p>Parciales: {coverage.partial.map(titleOf).join(", ")}.</p>}
        </div>
      )}

      <details className="legend">
        <summary>Cómo leer este informe</summary>
        <dl>
          {(Object.keys(NATURE_LABEL) as Nature[]).map((n) => <div key={n}><dt>{NATURE_SHORT[n]}</dt><dd>{NATURE_LABEL[n]}</dd></div>)}
          <div><dt>Recuentos</dt><dd>Son registros guardados en la plataforma, no métricas del sitio. Una sección sin datos no equivale a cero ni a «sin problemas».</dd></div>
        </dl>
      </details>

      <nav aria-label="Índice del informe" className="report-index">
        <ol>{sections.map((s) => <li key={s.id}><a href={`#s-${s.id}`}>{s.title}</a> · {STATE_LABEL[s.state]}</li>)}</ol>
      </nav>

      {sections.map((s) => <Section key={s.id} section={s} />)}

      <section aria-labelledby="s-limites" className="section report-limits">
        <h2 id="s-limites">Límites de este informe</h2>
        <ul>
          <li>Cada sección se lee por separado en el momento de generarlo. <strong>No es una instantánea transaccional</strong>: un cambio hecho mientras se genera puede aparecer en una sección y no en otra.</li>
          <li>Se muestra lo que tu rol puede leer en este proyecto; ningún dato de otros proyectos u organizaciones.</li>
          <li>No es una exportación firmada ni una prueba de integridad del proyecto. Para eso está la exportación del proyecto.</li>
          <li>Generarlo no envía, programa ni publica nada y no consulta ningún proveedor ni motor generativo.</li>
        </ul>
        <p className="no-print"><Link href={base}>Volver al resumen del proyecto</Link></p>
      </section>
    </article>
  );
}

function Section({ section: s }: { section: ReportSection }) {
  return (
    <section aria-labelledby={`h-${s.id}`} className="section report-section" id={`s-${s.id}`}>
      <div className="card-head">
        <h2 id={`h-${s.id}`}>{s.title}</h2>
        <StatusPill tone={STATE_TONE[s.state]}>{STATE_LABEL[s.state]}</StatusPill>
      </div>
      <p className="muted small">Fuente: {s.source}{s.latest ? ` · último registro: ${formatDateTime(s.latest)}` : ""}</p>
      {s.natures.length > 0 && <p className="report-natures">{s.natures.map((n) => <StatusPill key={n} tone="neutral">{NATURE_SHORT[n]}</StatusPill>)}</p>}
      {s.reason && <p role="note">{s.reason}</p>}
      {s.facts.length > 0 && (
        <dl className="facts">
          {s.facts.map((f) => <div key={f.label}><dt>{f.label}{f.nature ? ` · ${NATURE_SHORT[f.nature].toLowerCase()}` : ""}</dt><dd>{f.value}</dd></div>)}
        </dl>
      )}
      <ul className="muted small">{s.notes.map((n) => <li key={n}>{n}</li>)}</ul>
      {s.link && <p className="no-print"><Link href={s.link.href}>{s.link.label}</Link></p>}
    </section>
  );
}
