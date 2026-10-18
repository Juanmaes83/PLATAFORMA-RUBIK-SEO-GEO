import "server-only";

// Reads behind the manual project report. Every read uses the signed-in user's client (RLS) and
// the existing repositories; an N2 table is only queried when its schema is accredited in this
// environment. A failed read becomes "no disponible", never an empty section. Reads are
// independent: the report is not a transactional snapshot (R1, undecided).
import type { SupabaseClient } from "@supabase/supabase-js";
import { listCompetitors, listObservations as listCompetitorObservations } from "@/lib/competitors/repository";
import { listBriefs, listClusters, listEvidence, listOpportunities } from "@/lib/content/repository";
import { listObservations as listGeoObservations, listProposals, OBSERVATION_LIMIT } from "@/lib/geo/repository";
import { listImports } from "@/lib/imports/repository";
import { contentGeoSchemaAvailable, n2SchemaAvailable } from "@/lib/n2/availability";
import { listGoogleCaptures } from "@/lib/openseo/google/capture";
import type { ProjectRef } from "@/lib/provenance/audit";
import type { Keyring } from "@/lib/provenance/keyring";
import { listProviderResults, loadProviderResult, readAuditTrail } from "@/lib/provenance/repository";
import { diagnoseAudit } from "@/lib/seo/diagnosis";
import type { Database } from "@/lib/supabase/database.types";
import {
  UNAVAILABLE, auditSection, competitorsSection, contentSection, geoSection, importsSection, keywordsSection, measurementSection, technicalSection,
  type AuditInput, type CompetitorsInput, type ContentInput, type GeoInput, type ImportsInput, type KeywordsInput, type MeasurementCapture,
  type MeasurementInput, type ReportSection, type TechnicalInput,
} from "./report";

type Client = SupabaseClient<Database>;

/** Read caps: the module's own list limits, so the report says "parcial" exactly when the module would. */
export const LIMITS = {
  technicalScan: 100, keywords: 500, captures: 25, competitors: 200, competitorObservations: 1000,
  clusters: 200, opportunities: 500, evidence: 2000, briefs: 500, geoObservations: OBSERVATION_LIMIT, proposals: 300,
} as const;

const failed = { kind: "unavailable", reason: UNAVAILABLE.readFailed } as const;
async function guarded<T>(read: () => Promise<T>): Promise<T | typeof failed> {
  try { return await read(); } catch { return failed; }
}

async function technical(client: Client, ref: ProjectRef, keyring: Keyring | null): Promise<TechnicalInput> {
  const listed = await listProviderResults(client, ref, { limit: LIMITS.technicalScan });
  if (!listed.ok) return failed;
  const latest = listed.rows.find((r) => r.provider === "openseo" && r.operation === "auditIssues");
  if (!latest) return { kind: "none", scanned: listed.rows.length, capped: listed.rows.length >= LIMITS.technicalScan };
  if (!keyring) return { kind: "unavailable", reason: UNAVAILABLE.noKeyring };
  const loaded = await loadProviderResult(client, ref, latest.id, keyring);
  if (!loaded.ok) return failed;
  if (!loaded.verification.verified) return { kind: "unverified", capturedAt: latest.captured_at };
  const result = loaded.verification.result as { provenance?: { evidence?: { auditId?: unknown } } };
  const auditId = typeof result?.provenance?.evidence?.auditId === "string" ? result.provenance.evidence.auditId : null;
  return { kind: "verified", capturedAt: latest.captured_at, status: loaded.row.status, auditId,
    issues: diagnoseAudit(loaded.verification.result).map((i) => ({ severity: i.severity, group: i.group })) };
}

async function measurement(client: Client, ref: ProjectRef, keyring: Keyring | null): Promise<MeasurementInput> {
  const history = await listGoogleCaptures(client, ref, LIMITS.captures);
  if (!history.ok) return failed;
  const captures: MeasurementCapture[] = [];
  for (const summary of history.rows) {
    const unverified: MeasurementCapture = { provider: summary.provider, capturedAt: summary.capturedAt, verified: false, status: null, period: null, rows: null };
    if (!keyring) { captures.push(unverified); continue; }
    const loaded = await loadProviderResult(client, ref, summary.id, keyring);
    if (!loaded.ok || !loaded.verification.verified) { captures.push(unverified); continue; }
    const payload = loaded.row.signed_payload as { provenance?: { requestContext?: { startDate?: unknown; endDate?: unknown } } } | null;
    const request = payload?.provenance?.requestContext;
    const text = (v: unknown) => (typeof v === "string" && v ? v : null);
    captures.push({ provider: summary.provider, capturedAt: loaded.row.captured_at, verified: true, status: loaded.row.status,
      period: request ? { start: text(request.startDate), end: text(request.endDate) } : null,
      rows: Array.isArray(loaded.row.data) ? loaded.row.data.length : null });
  }
  return { kind: "read", limit: LIMITS.captures, keyring: keyring !== null, captures };
}

async function keywords(client: Client, ref: ProjectRef): Promise<KeywordsInput> {
  if (!n2SchemaAvailable()) return { kind: "unavailable", reason: UNAVAILABLE.n2Schema };
  const { data, error } = await client.from("seo_keywords").select("intent, target_url, created_at")
    .eq("project_id", ref.projectId).eq("organization_id", ref.organizationId).order("created_at", { ascending: false }).limit(LIMITS.keywords);
  if (error) return failed;
  return { kind: "read", limit: LIMITS.keywords, rows: data };
}

async function competitors(client: Client, ref: ProjectRef): Promise<CompetitorsInput> {
  if (!n2SchemaAvailable()) return { kind: "unavailable", reason: UNAVAILABLE.n2Schema };
  const [list, observations] = await Promise.all([listCompetitors(client, ref), listCompetitorObservations(client, ref)]);
  return { kind: "read", limits: { competitors: LIMITS.competitors, observations: LIMITS.competitorObservations },
    competitors: list.map((c) => ({ status: c.status })),
    observations: observations.map((o) => ({ competitorId: o.competitorId, verification: o.verification, observedOn: o.observedOn })) };
}

async function content(client: Client, ref: ProjectRef): Promise<ContentInput> {
  if (!contentGeoSchemaAvailable()) return { kind: "unavailable", reason: UNAVAILABLE.contentGeoSchema };
  const [clusters, opportunities, evidence, briefs] = await Promise.all([
    listClusters(client, ref), listOpportunities(client, ref), listEvidence(client, ref), listBriefs(client, ref)]);
  return { kind: "read", limits: { clusters: LIMITS.clusters, opportunities: LIMITS.opportunities, evidence: LIMITS.evidence, briefs: LIMITS.briefs },
    clusters: clusters.length, opportunities: opportunities.map((o) => ({ id: o.id, status: o.status })),
    evidenceKinds: evidence.map((e) => ({ opportunityId: e.opportunityId, kind: e.kind })),
    briefs: briefs.map((b) => ({ status: b.status, updatedAt: b.updatedAt })), counts: { evidence: evidence.length, briefs: briefs.length } };
}

async function geo(client: Client, ref: ProjectRef): Promise<GeoInput> {
  if (!contentGeoSchemaAvailable()) return { kind: "unavailable", reason: UNAVAILABLE.contentGeoSchema };
  const [observations, proposals] = await Promise.all([listGeoObservations(client, ref), listProposals(client, ref)]);
  return { kind: "read", limits: { observations: LIMITS.geoObservations, proposals: LIMITS.proposals },
    observations: observations.map((o) => ({ id: o.id, supersedesId: o.supersedesId, verification: o.verification, presence: o.presence, engine: o.engine, observedOn: o.observedOn })),
    proposals: proposals.map((p) => ({ status: p.status })) };
}

async function audit(client: Client, ref: ProjectRef, keyring: Keyring | null): Promise<AuditInput> {
  if (!keyring) return { kind: "unavailable", reason: UNAVAILABLE.noKeyring };
  const trail = await readAuditTrail(client, ref, keyring);
  if (!trail.ok) return failed;
  return { kind: "read", length: trail.rows.length, lastAt: trail.rows.at(-1)?.at ?? null,
    verification: trail.verification.valid ? { valid: true } : { valid: false, reason: trail.verification.reason } };
}

async function imports(client: Client, ref: ProjectRef): Promise<ImportsInput> {
  return { kind: "read", rows: await listImports(client, ref) };
}

/** Reads every section the environment accredits and assembles the report sections in a fixed order. */
export async function readReportSections(client: Client, ref: ProjectRef, base: string, keyring: Keyring | null): Promise<ReportSection[]> {
  const [t, i, k, m, c, ct, g, a] = await Promise.all([
    guarded(() => technical(client, ref, keyring)), guarded(() => imports(client, ref)), guarded(() => keywords(client, ref)),
    guarded(() => measurement(client, ref, keyring)), guarded(() => competitors(client, ref)), guarded(() => content(client, ref)),
    guarded(() => geo(client, ref)), guarded(() => audit(client, ref, keyring)),
  ]);
  const link = (path: string, label: string) => ({ href: `${base}${path}`, label });
  const n2Link = <T>(on: boolean, l: T) => (on ? l : null);
  return [
    technicalSection(t, { id: "technical", title: "SEO técnico", source: "Auditoría de OpenSEO guardada y firmada (provider_results)", link: link("/seo", "Abrir análisis SEO") }),
    importsSection(i, { id: "imports", title: "Hallazgos importados", source: "Importaciones manuales (CORE-9.3)", link: link("/importaciones", "Abrir importaciones") }),
    keywordsSection(k, { id: "keywords", title: "Palabras clave", source: "Palabras clave declaradas (N2-09, seo_keywords)", link: n2Link(n2SchemaAvailable(), link("/seo", "Abrir palabras clave")) }),
    measurementSection(m, { id: "measurement", title: "Medición orgánica", source: "Capturas de Google guardadas y firmadas (N2-10)", link: link("/medicion", "Abrir centro de medición") }),
    competitorsSection(c, { id: "competitors", title: "Competidores", source: "Competidores y lecturas registradas (N2-11)", link: n2Link(n2SchemaAvailable(), link("/competidores", "Abrir competidores")) }),
    contentSection(ct, { id: "content", title: "Contenidos", source: "Clústeres, oportunidades, evidencias y briefs (N2-12)", link: n2Link(contentGeoSchemaAvailable(), link("/contenidos", "Abrir contenidos")) }),
    geoSection(g, { id: "geo", title: "GEO e IA", source: "Observaciones manuales y propuestas (N2-13)", link: n2Link(contentGeoSchemaAvailable(), link("/geo", "Abrir GEO e IA")) }),
    auditSection(a, { id: "audit", title: "Registro de auditoría", source: "Cadena firmada de eventos del proyecto (S1, audit_events)", link: null }),
  ];
}
