import Link from "next/link";
import { notFound } from "next/navigation";
import { ProjectNav } from "@/components/ProjectNav";
import { EmptyState, PageHead, StatusPill } from "@/components/ui";
import { projectAccess } from "@/lib/access";
import { requireSession } from "@/lib/auth/session";
import { creditsToEur, OWNER_CEILING_EUR, type Conversion } from "@/lib/budget/conversion";
import { monthlySummary } from "@/lib/budget/ledger";
import { loadProjectRef } from "@/lib/imports/repository";
import { listProviderResults } from "@/lib/provenance/repository";
import { myProjectMembership } from "@/lib/tenancy";

// Monthly variable-spend summary per project (owner decision of 09/10/2026). Read-only: it shows
// what the ledger recorded, the documented basis of every euro figure, and which operations left
// a saved result. It never calls a provider and offers no recharge.
const isBasis = (v: unknown): v is Conversion["basis"] =>
  !!v && typeof v === "object" && typeof (v as Record<string, unknown>).creditsPerUnit === "number" && typeof (v as Record<string, unknown>).taxRate === "number";
const eur = (n: number | null) => n === null ? "Sin base documentada" : `${n.toLocaleString("es-ES", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €`;

export default async function ConsumptionPage({ params, searchParams }: {
  params: Promise<{ tenantId: string; projectId: string }>;
  searchParams: Promise<{ mes?: string }>;
}) {
  const [{ tenantId, projectId }, { mes }, { user, supabase }] = await Promise.all([params, searchParams, requireSession()]);
  const access = projectAccess(await myProjectMembership(supabase, user.id, tenantId, projectId));
  if (!access) notFound();
  const { project } = access;
  const base = `/proyectos/${project.tenantId}/${project.projectId}`;
  const ref = await loadProjectRef(supabase, { tenantId: project.tenantId, projectId: project.projectId });
  if (!ref) notFound();
  const month = typeof mes === "string" && /^20\d{2}-(0[1-9]|1[0-2])$/.test(mes) ? mes : undefined;
  const read = await monthlySummary(supabase, ref.projectId, month);
  const head = (
    <>
      <p className="muted small">{project.name}</p>
      <ProjectNav base={base} current={null} />
      <PageHead title="Consumo y presupuesto" />
      <p>Techo de gasto variable: {OWNER_CEILING_EUR} € por mes natural y proyecto. Es un límite, no un objetivo. Las suscripciones y costes fijos se deciden aparte. No hay recargas automáticas ni consultas programadas.</p>
    </>
  );

  if (!read.ok) {
    return (
      <>
        {head}
        {read.error === "BUDGET_FORBIDDEN" ? (
          <EmptyState title="Solo la persona titular del proyecto ve el consumo">
            <p>Tu rol en este proyecto no incluye el presupuesto.</p>
          </EmptyState>
        ) : (
          <EmptyState title="Resumen no disponible" requires={["Migraciones de presupuesto aplicadas al Supabase alojado (20261010090000 y 20261010150000)"]}>
            <p>La lectura ha fallado; no se presenta como un mes sin consumo.</p>
          </EmptyState>
        )}
        <p><Link href={base}>← Volver al proyecto</Link></p>
      </>
    );
  }

  const { summary } = read;
  const basis = isBasis(summary.conversion) ? summary.conversion : null;
  const total = summary.operations.reduce((n, o) => n + o.credits, 0);
  const results = await listProviderResults(supabase, ref, { limit: 100 });
  const saved = new Set(results.ok ? results.rows.map((r) => r.id) : []);
  const linked = (refs: string[]) => refs.filter((r) => r.startsWith("result:") && saved.has(r.slice(7))).length;
  const period = new Date(summary.periodStart).toLocaleDateString("es-ES", { month: "long", year: "numeric", timeZone: "UTC" });

  return (
    <>
      {head}
      {summary.blocked && (
        <div className="card" role="alert">
          <p><StatusPill tone="no">Bloqueado</StatusPill> Un coste real superó el máximo reservado. No se admiten más reservas hasta que la persona titular revise y vuelva a fijar el límite.</p>
        </div>
      )}
      <dl className="facts card">
        <div><dt>Periodo</dt><dd>{period} (UTC)</dd></div>
        <div><dt>Límite mensual</dt><dd>{summary.monthlyLimit === null ? "Sin límite fijado: no se puede consumir" : `${summary.monthlyLimit.toLocaleString("es-ES")} créditos`}</dd></div>
        <div><dt>Créditos del mes</dt><dd>{total.toLocaleString("es-ES")}</dd></div>
        <div><dt>Coste estimado con impuestos</dt><dd>{eur(creditsToEur(total, basis))}</dd></div>
      </dl>
      {!basis && <p className="muted small">El coste en euros solo se muestra cuando el límite se fijó con su conversión documentada (tarifa, moneda, cambio e impuestos confirmados).</p>}

      <section aria-labelledby="c-operaciones" className="section">
        <h2 id="c-operaciones">Operaciones</h2>
        {summary.operations.length === 0 ? (
          <EmptyState title="Sin operaciones de pago este mes">
            <p>Ninguna herramienta de pago ha reservado consumo en este periodo.</p>
          </EmptyState>
        ) : (
          <ul className="cards">
            {summary.operations.map((o) => (
              <li className="card" key={o.operation}>
                <h3 className="break">{o.operation}</h3>
                <dl className="facts">
                  <div><dt>Liquidadas</dt><dd>{o.settled}</dd></div>
                  <div><dt>Abiertas</dt><dd>{o.reserved}</dd></div>
                  <div><dt>Liberadas sin coste</dt><dd>{o.released}</dd></div>
                  <div><dt>Créditos</dt><dd>{o.credits.toLocaleString("es-ES")}</dd></div>
                  <div><dt>Coste</dt><dd>{eur(creditsToEur(o.credits, basis))}</dd></div>
                  <div><dt>Con resultado guardado</dt><dd>{linked(o.references)} de {o.settled}</dd></div>
                  {o.overruns > 0 && <div><dt>Por encima del máximo</dt><dd>{o.overruns}</dd></div>}
                </dl>
              </li>
            ))}
          </ul>
        )}
      </section>
      <p><Link href={base}>← Volver al proyecto</Link></p>
    </>
  );
}
