// N2-14 manual project report — CONTRACT ONLY (design increment, no route, no export, no
// scheduler). A report is assembled on demand by a person from what each module can really
// provide. Each section declares its own availability; a section whose module is not merged,
// not connected or empty says so instead of showing invented content. Nothing here sends,
// schedules, publishes or calls a provider (ADR 0023 in PR #78 governs any future scheduler).

export const SECTION_IDS = ["technical-audit", "imports", "keywords", "competitors", "content", "geo", "opportunities", "audit-trail"] as const;
export type SectionId = (typeof SECTION_IDS)[number];

export const SECTION_LABEL: Record<SectionId, string> = {
  "technical-audit": "Auditoría SEO técnica",
  imports: "Hallazgos importados",
  keywords: "Palabras clave declaradas",
  competitors: "Competidores",
  content: "Estrategia de contenidos",
  geo: "Observaciones GEO",
  opportunities: "Oportunidades prioritarias",
  "audit-trail": "Registro de auditoría y procedencia",
};

/** Who owns each section and where it lives today (main or a pending PR). */
export const SECTION_SOURCE: Record<SectionId, { module: string; inMain: boolean; pendingOn?: string }> = {
  "technical-audit": { module: "OpenSEO (ADR 0006), provider_results firmados", inMain: true },
  imports: { module: "CORE-9.3 importaciones", inMain: true },
  keywords: { module: "N2-09", inMain: false, pendingOn: "PR #114" },
  competitors: { module: "N2-11", inMain: false, pendingOn: "PR #115" },
  content: { module: "N2-12", inMain: false, pendingOn: "PR #116" },
  geo: { module: "N2-13", inMain: false, pendingOn: "PR #117" },
  opportunities: { module: "N2-12 y N2-13", inMain: false, pendingOn: "PR #116 y PR #117" },
  "audit-trail": { module: "S1 audit_events (cadena firmada)", inMain: true },
};

export type Availability =
  | { state: "available"; items: number; period: { from: string; to: string } | null }
  | { state: "empty" }
  | { state: "pending-integration"; pendingOn: string }
  | { state: "not-connected"; requires: string }
  | { state: "error"; reason: string };

export interface ReportSection {
  id: SectionId;
  label: string;
  availability: Availability;
  /** What the reader must know: method, declared vs observed, missing data. Never empty. */
  limitations: string[];
}

export interface ReportOutline {
  format: "rubik-manual-report-v0";
  projectScope: { tenantId: string; projectId: string };
  generatedAt: string;
  generatedBy: string;
  sections: ReportSection[];
  /** True only if every included section is "available"; a partial report says it is partial. */
  complete: boolean;
  /** Effects this report never has; checked by tests. */
  effects: { sends: false; schedules: false; publishes: false; callsProviders: false };
}

const BASE_LIMITS: Record<SectionId, string> = {
  "technical-audit": "Auditoría lanzada a mano con OpenSEO; sin Lighthouse ni datos de tráfico.",
  imports: "Datos declarados por quien importó el fichero; no verificados por un proveedor.",
  keywords: "Frases declaradas; sin volumen, dificultad ni posiciones.",
  competitors: "Observaciones manuales; solo comparables con igual fuente, método y mercado.",
  content: "Propuestas editoriales; nada se ha publicado.",
  geo: "Observaciones manuales de motores generativos; declaradas hasta su verificación; sin ranking ni visibilidad.",
  opportunities: "Reglas deterministas sobre los datos anteriores; no garantizan resultados.",
  "audit-trail": "Cadena firmada verificable con las claves del servidor.",
};

/**
 * Builds the outline from what each module reports. A module that is not in main can only be
 * "pending-integration", whatever the caller passes, so a report can never show content from an
 * unmerged module.
 */
export function buildOutline(input: {
  scope: { tenantId: string; projectId: string };
  generatedAt: string;
  generatedBy: string;
  availability: Partial<Record<SectionId, Availability>>;
  include?: readonly SectionId[];
}): ReportOutline {
  const ids = (input.include ?? SECTION_IDS).filter((id, i, all) => SECTION_IDS.includes(id) && all.indexOf(id) === i);
  const sections = ids.map((id): ReportSection => {
    const src = SECTION_SOURCE[id];
    let availability: Availability = input.availability[id] ?? { state: "empty" };
    if (!src.inMain) availability = { state: "pending-integration", pendingOn: src.pendingOn ?? src.module };
    if (availability.state === "available" && (!Number.isInteger(availability.items) || availability.items < 1)) availability = { state: "empty" };
    const limitations = [BASE_LIMITS[id]];
    if (availability.state === "pending-integration") limitations.push(`Sección pendiente de integración (${availability.pendingOn}): no se muestra contenido.`);
    if (availability.state === "empty") limitations.push("Sin datos registrados para este proyecto: no equivale a «sin problemas».");
    return { id, label: SECTION_LABEL[id], availability, limitations };
  });
  return {
    format: "rubik-manual-report-v0",
    projectScope: input.scope,
    generatedAt: input.generatedAt,
    generatedBy: input.generatedBy,
    sections,
    complete: sections.length > 0 && sections.every((s) => s.availability.state === "available"),
    effects: { sends: false, schedules: false, publishes: false, callsProviders: false },
  };
}
