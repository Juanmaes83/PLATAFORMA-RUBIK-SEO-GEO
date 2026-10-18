// N2-14 manual project report: pure assembly of what each module already stores. Every section
// says where its data comes from, how complete the read was and what kind of evidence it is
// (observed, declared or hypothesis). Counts are counts of stored records, never metrics: a
// missing source is "no disponible" or "vacío", never zero results. No I/O here; the server
// reads live in ./sources.ts. Generated on demand by a person; nothing is sent, scheduled,
// published or requested from a provider.
import { supportOf } from "@/lib/content/insights";
import type { EvidenceKind } from "@/lib/content/contract";

export const REPORT_SECTION_IDS = ["technical", "imports", "keywords", "measurement", "competitors", "content", "geo", "audit"] as const;
export type ReportSectionId = (typeof REPORT_SECTION_IDS)[number];

/** available: read in full · partial: read, but capped, unverified or with a known gap · empty: read in full, nothing stored · unavailable: not read. */
export type SectionState = "available" | "partial" | "empty" | "unavailable";
export type Nature = "observed" | "declared" | "hypothesis";

export const STATE_LABEL: Record<SectionState, string> = {
  available: "Disponible", partial: "Parcial", empty: "Sin datos", unavailable: "No disponible",
};
export const NATURE_LABEL: Record<Nature, string> = {
  observed: "Resultado firmado de una fuente u observación manual verificada por una persona; consulta la procedencia de cada sección",
  declared: "Dato declarado por una persona",
  hypothesis: "Hipótesis o propuesta, no un resultado",
};

export interface Fact { label: string; value: string; nature?: Nature }
export interface ReportSection {
  id: ReportSectionId;
  title: string;
  /** Module and storage the section reads, in plain words. */
  source: string;
  state: SectionState;
  /** Why the section is partial, empty or unavailable. */
  reason: string | null;
  natures: Nature[];
  facts: Fact[];
  /** Method, declared-vs-observed and missing-data warnings. Never empty. */
  notes: string[];
  /** Latest stored date of the section, if any. */
  latest: string | null;
  link: { href: string; label: string } | null;
}

export interface ReportCoverage { complete: boolean; partial: ReportSectionId[]; unavailable: ReportSectionId[]; empty: ReportSectionId[] }

/** Complete only when every section was read in full (an empty section read in full is complete coverage, and says so). */
export function coverageOf(sections: readonly ReportSection[]): ReportCoverage {
  const of = (s: SectionState) => sections.filter((x) => x.state === s).map((x) => x.id);
  const partial = of("partial"), unavailable = of("unavailable");
  return { complete: sections.length > 0 && partial.length === 0 && unavailable.length === 0, partial, unavailable, empty: of("empty") };
}

/** Reasons a section was not read. Each one names what is missing, not a guess. */
export const UNAVAILABLE = {
  n2Schema: "El esquema N2 (palabras clave y competidores) no está acreditado en este entorno: no se ha consultado.",
  contentGeoSchema: "El esquema de Contenidos y GEO no está acreditado en este entorno: no se ha consultado.",
  readFailed: "La lectura falló; se muestra como no disponible en lugar de vacía.",
  noKeyring: "El servidor no tiene configurada la verificación de firmas: no se muestran datos que no se pueden verificar.",
} as const;

const count = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;
const maxDate = (dates: readonly (string | null | undefined)[]) =>
  dates.filter((d): d is string => typeof d === "string" && d.length > 0).sort().at(-1) ?? null;
const tally = <K extends string>(values: readonly K[], labels: Record<K, string>) =>
  (Object.keys(labels) as K[]).map((k) => [labels[k], values.filter((v) => v === k).length] as const).filter(([, n]) => n > 0)
    .map(([label, n]) => `${label}: ${n}`).join(" · ");

type Base = Pick<ReportSection, "id" | "title" | "source" | "link">;
const unavailable = (base: Base, reason: string, notes: string[]): ReportSection =>
  ({ ...base, state: "unavailable", reason, natures: [], facts: [], notes, latest: null });
// An empty section carries no evidence nature: there is nothing to qualify. The argument documents what it would hold.
const empty = (base: Base, what: string, _wouldHold: Nature[], notes: string[]): ReportSection =>
  ({ ...base, state: "empty", reason: `${what} No equivale a «sin problemas» ni a valores cero.`, natures: [], facts: [], notes, latest: null });

// ── SEO técnico (OpenSEO, provider_results firmados) ──────────────────────────────────────────

export type TechnicalInput =
  | { kind: "unavailable"; reason: string }
  | { kind: "none"; scanned: number; capped: boolean }
  | { kind: "unverified"; capturedAt: string | null }
  | { kind: "verified"; capturedAt: string | null; status: string; auditId: string | null;
      issues: readonly { severity: "ERROR" | "WARNING" | "OPPORTUNITY" | "UNKNOWN"; group: string }[] };

const SEVERITY_LABEL = { ERROR: "Errores", WARNING: "Avisos", OPPORTUNITY: "Oportunidades", UNKNOWN: "Sin clasificar" } as const;

export function technicalSection(input: TechnicalInput, base: Base): ReportSection {
  const notes = ["Auditoría lanzada a mano con OpenSEO. Se comprueba la firma del resultado más reciente guardado para este proyecto; si no verifica, sus hallazgos se ocultan.",
    "Sin Lighthouse ni datos de tráfico en esta sección."];
  if (input.kind === "unavailable") return unavailable(base, input.reason, notes);
  if (input.kind === "none") {
    if (input.capped) return { ...base, state: "partial", natures: [], facts: [], notes, latest: null,
      reason: `No hay una auditoría entre los ${input.scanned} resultados guardados más recientes; puede haber otras más antiguas sin leer.` };
    return empty(base, "No hay ninguna auditoría técnica guardada para este proyecto.", ["observed"], notes);
  }
  if (input.kind === "unverified") return { ...base, state: "partial", natures: [], facts: [], notes, latest: input.capturedAt,
    reason: "Existe una auditoría guardada, pero su firma no se verifica: sus hallazgos no se muestran." };
  const groups = [...new Set(input.issues.map((i) => i.group))].sort();
  const facts: Fact[] = [
    { label: "Hallazgos registrados", value: String(input.issues.length), nature: "observed" },
    ...(input.issues.length ? [{ label: "Por gravedad", value: tally(input.issues.map((i) => i.severity), SEVERITY_LABEL), nature: "observed" as const }] : []),
    ...(groups.length ? [{ label: "Áreas", value: groups.join(", "), nature: "observed" as const }] : []),
    ...(input.auditId ? [{ label: "Auditoría de OpenSEO", value: input.auditId }] : []),
  ];
  const partial = input.status === "PARTIAL";
  return { ...base, state: partial ? "partial" : "available", natures: ["observed"], facts, latest: input.capturedAt,
    reason: partial ? "La fuente marcó el resultado como parcial: no representa todo el sitio." : null,
    notes: input.issues.length === 0 ? [...notes, "La auditoría verificada no contiene hallazgos clasificados; no implica que el sitio no tenga problemas."] : notes };
}

// ── Importaciones manuales (CORE-9.3) ────────────────────────────────────────────────────────

export type ImportsInput = { kind: "unavailable"; reason: string } | { kind: "read";
  rows: readonly { status: "complete" | "partial" | "failed" | "empty"; finding_count: number; captured_at: string; source_label: string }[] };

const IMPORT_LABEL = { complete: "Completas", partial: "Con filas rechazadas", failed: "Fallidas", empty: "Sin hallazgos" } as const;

export function importsSection(input: ImportsInput, base: Base): ReportSection {
  const notes = ["Ficheros importados por una persona: los hallazgos son declarados, no verificados por un proveedor."];
  if (input.kind === "unavailable") return unavailable(base, input.reason, notes);
  if (input.rows.length === 0) return empty(base, "No hay importaciones en este proyecto.", ["declared"], notes);
  const findings = input.rows.reduce((n, r) => n + r.finding_count, 0);
  const withErrors = input.rows.filter((r) => r.status === "partial" || r.status === "failed").length;
  return { ...base, state: "available", natures: ["declared"], latest: maxDate(input.rows.map((r) => r.captured_at)), reason: null,
    facts: [
      { label: "Importaciones", value: String(input.rows.length), nature: "declared" },
      { label: "Hallazgos aceptados", value: String(findings), nature: "declared" },
      { label: "Por estado", value: tally(input.rows.map((r) => r.status), IMPORT_LABEL) },
    ],
    notes: withErrors ? [...notes, `${count(withErrors, "importación tiene", "importaciones tienen")} filas rechazadas o falló: revisa su detalle.`] : notes };
}

// ── Palabras clave (N2-09) ──────────────────────────────────────────────────────────────────

export type KeywordsInput = { kind: "unavailable"; reason: string } | { kind: "read"; limit: number;
  rows: readonly { intent: string; target_url: string | null; created_at: string }[] };

export function keywordsSection(input: KeywordsInput, base: Base): ReportSection {
  const notes = ["Frases declaradas por el equipo: sin volumen, dificultad ni posiciones."];
  if (input.kind === "unavailable") return unavailable(base, input.reason, notes);
  if (input.rows.length === 0) return empty(base, "No hay palabras clave declaradas.", ["declared"], notes);
  const capped = input.rows.length >= input.limit;
  return { ...base, state: capped ? "partial" : "available", natures: ["declared"], latest: maxDate(input.rows.map((r) => r.created_at)),
    reason: capped ? `Se leyeron las ${input.limit} más recientes; puede haber más.` : null,
    facts: [
      { label: "Palabras clave declaradas", value: String(input.rows.length), nature: "declared" },
      { label: "Con URL objetivo", value: String(input.rows.filter((r) => r.target_url).length), nature: "declared" },
      { label: "Con intención clasificada", value: String(input.rows.filter((r) => r.intent !== "unknown").length), nature: "declared" },
    ], notes };
}

// ── Medición (N2-10: capturas de Google firmadas) ────────────────────────────────────────────

export type MeasurementCapture = { provider: "search-console" | "google-analytics"; capturedAt: string | null; verified: boolean;
  status: string | null; period: { start: string | null; end: string | null } | null; rows: number | null };
export type MeasurementInput = { kind: "unavailable"; reason: string } | { kind: "read"; limit: number; keyring: boolean; captures: readonly MeasurementCapture[] };

const PROVIDER_LABEL = { "search-console": "Google Search Console", "google-analytics": "Google Analytics 4" } as const;

export function measurementSection(input: MeasurementInput, base: Base): ReportSection {
  const notes = ["Capturas manuales guardadas; una asociación o consentimiento no confirma acceso actual a Google.",
    "Los valores se consultan en el centro de medición; aquí no se suman ni se extrapolan."];
  if (input.kind === "unavailable") return unavailable(base, input.reason, notes);
  if (input.captures.length === 0) return empty(base, "No hay capturas de Google guardadas.", ["observed"], notes);
  if (!input.keyring) return { ...base, state: "partial", natures: [], latest: maxDate(input.captures.map((c) => c.capturedAt)),
    reason: UNAVAILABLE.noKeyring, facts: [{ label: "Capturas guardadas sin verificar", value: String(input.captures.length) }], notes };
  const verified = input.captures.filter((c) => c.verified);
  const facts: Fact[] = [];
  for (const provider of ["search-console", "google-analytics"] as const) {
    const own = verified.filter((c) => c.provider === provider).sort((a, b) => (b.capturedAt ?? "").localeCompare(a.capturedAt ?? ""));
    if (!own.length) continue;
    const last = own[0];
    const period = last.period ? `${last.period.start ?? "sin inicio indicado"} – ${last.period.end ?? "sin fin indicado"}` : "Periodo no indicado";
    facts.push({ label: `${PROVIDER_LABEL[provider]}: capturas verificadas`, value: String(own.length), nature: "observed" });
    facts.push({ label: `${PROVIDER_LABEL[provider]}: última, periodo`, value: period, nature: "observed" });
    facts.push({ label: `${PROVIDER_LABEL[provider]}: última, filas`, value: last.status === "EMPTY" ? "Consulta sin filas" : last.rows === null ? "No indicado" : String(last.rows), nature: "observed" });
  }
  const unverified = input.captures.length - verified.length;
  const capped = input.captures.length >= input.limit;
  const gaps = [unverified ? `${count(unverified, "captura no verifica", "capturas no verifican")} y no se muestra.` : null,
    capped ? `Se leyeron las ${input.limit} capturas más recientes.` : null,
    verified.some((c) => c.status === "PARTIAL") ? "Alguna captura verificada tiene cobertura parcial." : null].filter(Boolean);
  if (unverified) facts.push({ label: "Capturas sin verificar (ocultas)", value: String(unverified) });
  return { ...base, state: gaps.length || verified.length === 0 ? "partial" : "available", natures: verified.length ? ["observed"] : [],
    latest: maxDate(verified.map((c) => c.capturedAt)), reason: gaps.length ? gaps.join(" ") : null, facts, notes };
}

// ── Competidores (N2-11) ────────────────────────────────────────────────────────────────────

export type CompetitorsInput = { kind: "unavailable"; reason: string } | { kind: "read"; limits: { competitors: number; observations: number };
  competitors: readonly { status: "active" | "archived" }[];
  observations: readonly { competitorId: string | null; verification: "unverified" | "verified"; observedOn: string }[] };

export function competitorsSection(input: CompetitorsInput, base: Base): ReportSection {
  const notes = ["Observaciones manuales o de fuentes declaradas; solo comparables con igual métrica, fuente, método y mercado.",
    "Sin ranking automático ni estimaciones de tráfico."];
  if (input.kind === "unavailable") return unavailable(base, input.reason, notes);
  if (input.competitors.length === 0 && input.observations.length === 0) return empty(base, "No hay competidores ni observaciones.", ["declared"], notes);
  const verified = input.observations.filter((o) => o.verification === "verified").length;
  const capped = input.competitors.length >= input.limits.competitors || input.observations.length >= input.limits.observations;
  const natures: Nature[] = [...(input.observations.length > verified ? ["declared" as const] : []), ...(verified ? ["observed" as const] : [])];
  return { ...base, state: capped ? "partial" : "available", natures: natures.length ? natures : ["declared"],
    latest: maxDate(input.observations.map((o) => o.observedOn)), reason: capped ? "Se alcanzó el límite de lectura; puede haber más registros." : null,
    facts: [
      { label: "Competidores activos", value: String(input.competitors.filter((c) => c.status === "active").length), nature: "declared" },
      { label: "Competidores archivados", value: String(input.competitors.filter((c) => c.status === "archived").length) },
      { label: "Lecturas del sitio propio", value: String(input.observations.filter((o) => o.competitorId === null).length) },
      { label: "Lecturas de competidores", value: String(input.observations.filter((o) => o.competitorId !== null).length) },
      { label: "Lecturas verificadas por una persona", value: String(verified), nature: "observed" },
      { label: "Lecturas sin verificar", value: String(input.observations.length - verified), nature: "declared" },
    ], notes };
}

// ── Contenidos (N2-12) ──────────────────────────────────────────────────────────────────────

export type ContentInput = { kind: "unavailable"; reason: string } | { kind: "read";
  limits: { clusters: number; opportunities: number; evidence: number; briefs: number };
  clusters: number;
  opportunities: readonly { id: string; status: "open" | "planned" | "done" | "discarded" }[];
  evidenceKinds: readonly { opportunityId: string; kind: EvidenceKind }[];
  briefs: readonly { status: "draft" | "in-review" | "approved" | "archived"; updatedAt: string }[];
  counts: { evidence: number; briefs: number } };

const OPP_LABEL = { open: "Abiertas", planned: "Planificadas", done: "Hechas", discarded: "Descartadas" } as const;
const BRIEF_LABEL = { draft: "Borrador", "in-review": "En revisión", approved: "Aprobados", archived: "Archivados" } as const;
const SUPPORT = { observed: "Con dato observado", declared: "Con fuente declarada", hypothesis: "Solo hipótesis" } as const;

export function contentSection(input: ContentInput, base: Base): ReportSection {
  const notes = ["Propuestas editoriales del equipo; nada se ha publicado.", "La prioridad la fija una persona; no garantiza resultados."];
  if (input.kind === "unavailable") return unavailable(base, input.reason, notes);
  if (input.clusters === 0 && input.opportunities.length === 0 && input.briefs.length === 0)
    return empty(base, "No hay clústeres, oportunidades ni briefs.", ["hypothesis"], notes);
  const byOpp = new Map<string, EvidenceKind[]>();
  for (const e of input.evidenceKinds) byOpp.set(e.opportunityId, [...(byOpp.get(e.opportunityId) ?? []), e.kind]);
  // Same rule as the Contenidos module: a signed result makes it observed, an import or a consulted source declared.
  const supports: Nature[] = input.opportunities.map((o) => supportOf(byOpp.get(o.id) ?? []));
  const capped = input.clusters >= input.limits.clusters || input.opportunities.length >= input.limits.opportunities
    || input.counts.evidence >= input.limits.evidence || input.counts.briefs >= input.limits.briefs;
  const natures = (["observed", "declared", "hypothesis"] as const).filter((n) => supports.includes(n));
  return { ...base, state: capped ? "partial" : "available", natures: natures.length ? natures : ["hypothesis"],
    latest: maxDate(input.briefs.map((b) => b.updatedAt)), reason: capped ? "Se alcanzó el límite de lectura; puede haber más registros." : null,
    facts: [
      { label: "Clústeres", value: String(input.clusters) },
      { label: "Oportunidades", value: String(input.opportunities.length), nature: "hypothesis" },
      ...(input.opportunities.length ? [
        { label: "Oportunidades por estado", value: tally(input.opportunities.map((o) => o.status), OPP_LABEL) },
        { label: "Oportunidades por respaldo", value: tally(supports, SUPPORT) }] : []),
      { label: "Briefs", value: input.briefs.length ? tally(input.briefs.map((b) => b.status), BRIEF_LABEL) : "Ninguno" },
    ], notes };
}

// ── GEO (N2-13) ─────────────────────────────────────────────────────────────────────────────

export type GeoInput = { kind: "unavailable"; reason: string } | { kind: "read"; limits: { observations: number; proposals: number };
  observations: readonly { id: string; supersedesId: string | null; verification: "declared" | "verified"; presence: "cited" | "mentioned" | "absent" | "unclear"; engine: string; observedOn: string }[];
  proposals: readonly { status: "proposed" | "accepted" | "rejected" | "done" }[] };

const PRESENCE = { cited: "Citada", mentioned: "Mencionada sin cita", absent: "No aparece", unclear: "No está claro" } as const;
const PROPOSAL = { proposed: "Pendientes de revisión", accepted: "Aceptadas", rejected: "Rechazadas", done: "Hechas" } as const;

export function geoSection(input: GeoInput, base: Base): ReportSection {
  const notes = ["Observaciones manuales de respuestas de motores generativos; ningún motor está conectado.",
    "Una observación es declarada hasta que una persona con permiso la verifica. Sin ranking ni porcentaje de visibilidad.",
    "Las propuestas son hipótesis basadas en reglas deterministas sobre las observaciones."];
  if (input.kind === "unavailable") return unavailable(base, input.reason, notes);
  if (input.observations.length === 0 && input.proposals.length === 0) return empty(base, "No hay observaciones GEO ni propuestas.", ["declared"], notes);
  const replaced = new Set(input.observations.map((o) => o.supersedesId).filter(Boolean));
  const current = input.observations.filter((o) => !replaced.has(o.id));
  const verified = current.filter((o) => o.verification === "verified").length;
  const capped = input.observations.length >= input.limits.observations || input.proposals.length >= input.limits.proposals;
  const natures: Nature[] = [...(verified ? ["observed" as const] : []), ...(current.length > verified ? ["declared" as const] : []),
    ...(input.proposals.length ? ["hypothesis" as const] : [])];
  return { ...base, state: capped ? "partial" : "available", natures, latest: maxDate(current.map((o) => o.observedOn)),
    reason: capped ? "Se alcanzó el límite de lectura; puede haber más registros." : null,
    facts: [
      { label: "Observaciones vigentes", value: String(current.length) },
      { label: "Verificadas por una persona", value: String(verified), nature: "observed" },
      { label: "Declaradas sin verificar", value: String(current.length - verified), nature: "declared" },
      ...(current.length ? [{ label: "Presencia de la marca", value: tally(current.map((o) => o.presence), PRESENCE) },
        { label: "Motores observados", value: String(new Set(current.map((o) => o.engine)).size) }] : []),
      { label: "Propuestas", value: input.proposals.length ? tally(input.proposals.map((p) => p.status), PROPOSAL) : "Ninguna", nature: "hypothesis" },
    ], notes };
}

// ── Registro de auditoría (S1) ──────────────────────────────────────────────────────────────

export type AuditInput = { kind: "unavailable"; reason: string } | { kind: "read"; length: number; lastAt: string | null;
  verification: { valid: true } | { valid: false; reason: string } };

export function auditSection(input: AuditInput, base: Base): ReportSection {
  const notes = ["Cadena firmada de eventos del proyecto, leída completa y verificada con las claves del servidor.",
    "Los recibos pendientes de firma no aparecen hasta que se procesan."];
  if (input.kind === "unavailable") return unavailable(base, input.reason, notes);
  if (input.length === 0) return empty(base, "El proyecto no tiene eventos de auditoría.", ["observed"], notes);
  if (!input.verification.valid) return { ...base, state: "partial", natures: [], latest: input.lastAt,
    reason: `La cadena de auditoría no verifica (${input.verification.reason}). No debe usarse como prueba hasta revisarla.`,
    facts: [{ label: "Eventos leídos", value: String(input.length) }], notes };
  return { ...base, state: "available", natures: ["observed"], latest: input.lastAt, reason: null,
    facts: [{ label: "Eventos firmados", value: String(input.length), nature: "observed" }, { label: "Cadena", value: "Verificada" }], notes };
}
