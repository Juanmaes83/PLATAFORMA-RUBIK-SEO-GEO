import "server-only";

// F1 dashboard signals. Every read runs with the signed-in user's client (RLS) and reuses the
// existing module repositories with small bounds; nothing here invents data and a failed read
// becomes "unavailable", never an empty or a zero. The audit timestamp uses one bounded query
// (latest event only) instead of the full chain verification, which stays in the report/export
// path: a date on a card is not a claim that the whole chain verifies.
import type { SupabaseClient } from "@supabase/supabase-js";
import { listCompetitors } from "@/lib/competitors/repository";
import { listBriefs, listOpportunities } from "@/lib/content/repository";
import { listObservations as listGeoObservations } from "@/lib/geo/repository";
import { listImports, loadProjectRef } from "@/lib/imports/repository";
import { contentGeoSchemaAvailable, n2SchemaAvailable } from "@/lib/n2/availability";
import { listGoogleCaptures } from "@/lib/openseo/google/capture";
import type { ProjectRef } from "@/lib/provenance/audit";
import type { Keyring } from "@/lib/provenance/keyring";
import { listProviderResults, loadProviderResult } from "@/lib/provenance/repository";
import { diagnoseAudit } from "@/lib/seo/diagnosis";
import type { Database } from "@/lib/supabase/database.types";
import { formatDateTime } from "@/lib/format";
import type { ProjectRecord } from "@/lib/access";

type Client = SupabaseClient<Database>;

const CAPTURE_LIMIT = 1;
const TECHNICAL_SCAN_LIMIT = 25;

/** The only three honest states a dashboard source can be in. */
export type SourceState = "data" | "no_data" | "unavailable";

export interface ModuleSignal {
  state: SourceState;
  /** Real indicators from the same bounded read, already dated and labelled. */
  lines: string[];
  /** Secondary line for limits of the read (unverified signature, schema off is NOT here: that is state). */
  note: string | null;
}

const unavailable: ModuleSignal = { state: "unavailable", lines: [], note: null };

async function guarded(read: () => Promise<ModuleSignal>): Promise<ModuleSignal> {
  try { return await read(); } catch { return unavailable; }
}

const plural = (n: number, one: string, many: string) => `${n.toLocaleString("es-ES")} ${n === 1 ? one : many}`;

async function measurement(client: Client, ref: ProjectRef, keyring: Keyring | null): Promise<ModuleSignal> {
  const history = await listGoogleCaptures(client, ref, CAPTURE_LIMIT);
  if (!history.ok) return unavailable;
  const latest = history.rows[0];
  if (!latest) return { state: "no_data", lines: [], note: null };
  const lines = [`Última captura · ${formatDateTime(latest.capturedAt ?? latest.createdAt)}`];
  let note: string | null = null;
  if (!keyring) {
    note = "Firma no verificable en este entorno";
  } else {
    const loaded = await loadProviderResult(client, ref, latest.id, keyring);
    if (!loaded.ok || !loaded.verification.verified) {
      note = "Captura guardada sin verificación de firma";
    } else {
      const rows = Array.isArray(loaded.row.data) ? loaded.row.data.length : null;
      if (loaded.row.status === "EMPTY") lines.push("Consulta verificada, sin filas");
      else if (rows !== null) lines.push(plural(rows, "fila devuelta", "filas devueltas"));
      if (loaded.row.status === "PARTIAL") note = "Cobertura parcial: no representa el total";
    }
  }
  return { state: "data", lines, note };
}

async function technical(client: Client, ref: ProjectRef, keyring: Keyring | null): Promise<ModuleSignal> {
  const listed = await listProviderResults(client, ref, { limit: TECHNICAL_SCAN_LIMIT });
  if (!listed.ok) return unavailable;
  const latest = listed.rows.find((r) => r.provider === "openseo" && r.operation === "auditIssues");
  if (!latest) return { state: "no_data", lines: [], note: null };
  const lines = [`Última auditoría · ${formatDateTime(latest.captured_at ?? latest.created_at)}`];
  let note: string | null = null;
  if (!keyring) {
    note = "Firma no verificable en este entorno";
  } else {
    const loaded = await loadProviderResult(client, ref, latest.id, keyring);
    if (!loaded.ok || !loaded.verification.verified) {
      note = "Auditoría guardada sin verificación de firma";
    } else {
      const issues = diagnoseAudit(loaded.verification.result);
      if (issues.length === 0) lines.push("Sin incidencias detectadas en la auditoría");
      else {
        const errors = issues.filter((i) => i.severity === "ERROR").length;
        const warnings = issues.filter((i) => i.severity === "WARNING").length;
        lines.push(errors > 0 || warnings > 0
          ? `${plural(errors, "error", "errores")} · ${plural(warnings, "aviso", "avisos")}`
          : plural(issues.length, "incidencia menor", "incidencias menores"));
      }
    }
  }
  return { state: "data", lines, note };
}

async function imports(client: Client, ref: ProjectRef): Promise<ModuleSignal> {
  const rows = await listImports(client, ref);
  if (rows.length === 0) return { state: "no_data", lines: [], note: null };
  const latest = rows.reduce((a, b) => (a.created_at >= b.created_at ? a : b));
  return {
    state: "data",
    lines: [plural(rows.length, "importación registrada", "importaciones registradas"), `Última · ${formatDateTime(latest.created_at)}`],
    note: null,
  };
}

async function competitors(client: Client, ref: ProjectRef): Promise<ModuleSignal> {
  if (!n2SchemaAvailable()) return unavailable;
  const rows = await listCompetitors(client, ref);
  const active = rows.filter((c) => c.status === "active").length;
  if (rows.length === 0) return { state: "no_data", lines: [], note: null };
  return {
    state: "data",
    lines: [plural(active, "competidor activo", "competidores activos")],
    note: active < rows.length ? `${plural(rows.length - active, "archivado", "archivados")}` : null,
  };
}

async function content(client: Client, ref: ProjectRef): Promise<ModuleSignal> {
  if (!contentGeoSchemaAvailable()) return unavailable;
  const [opportunities, briefs] = await Promise.all([listOpportunities(client, ref), listBriefs(client, ref)]);
  const lines: string[] = [];
  if (opportunities.length > 0) lines.push(plural(opportunities.length, "oportunidad", "oportunidades"));
  if (briefs.length > 0) lines.push(plural(briefs.length, "brief", "briefs"));
  if (lines.length === 0) return { state: "no_data", lines: [], note: null };
  return { state: "data", lines, note: null };
}

async function geo(client: Client, ref: ProjectRef): Promise<ModuleSignal> {
  if (!contentGeoSchemaAvailable()) return unavailable;
  const observations = await listGeoObservations(client, ref);
  if (observations.length === 0) return { state: "no_data", lines: [], note: null };
  const latest = observations.reduce((a, b) => (a.observedOn >= b.observedOn ? a : b));
  return {
    state: "data",
    lines: [plural(observations.length, "observación registrada", "observaciones registradas"), `Última · ${formatDateTime(latest.observedOn)}`],
    note: null,
  };
}

async function audit(client: Client, ref: ProjectRef): Promise<ModuleSignal> {
  const { data, error } = await client.from("audit_events")
    .select("at").eq("project_id", ref.projectId).eq("organization_id", ref.organizationId)
    .order("seq", { ascending: false }).limit(1);
  if (error) return unavailable;
  const last = data[0]?.at;
  if (typeof last !== "string") return { state: "no_data", lines: [], note: null };
  return { state: "data", lines: [`Último evento · ${formatDateTime(last)}`], note: null };
}

export interface ProjectModules {
  measurement: ModuleSignal;
  technical: ModuleSignal;
  imports: ModuleSignal;
  competitors: ModuleSignal;
  content: ModuleSignal;
  geo: ModuleSignal;
  audit: ModuleSignal;
}

/** Bounded module signals for one project. Reads are independent: one failure never blanks the rest. */
export async function readProjectOverview(client: Client, ref: ProjectRef, keyring: Keyring | null): Promise<ProjectModules> {
  const [measurement, technical, importsSignal, competitorsSignal, contentSignal, geoSignal, auditSignal] = await Promise.all([
    guarded(() => measurement(client, ref, keyring)),
    guarded(() => technical(client, ref, keyring)),
    guarded(() => imports(client, ref)),
    guarded(() => competitors(client, ref)),
    guarded(() => content(client, ref)),
    guarded(() => geo(client, ref)),
    guarded(() => audit(client, ref)),
  ]);
  return {
    measurement, technical, imports: importsSignal, competitors: competitorsSignal,
    content: contentSignal, geo: geoSignal, audit: auditSignal,
  };
}

/**
 * The dashboard row for one membership: resolves the database ids through the user's RLS
 * client and reads the module signals. Null when the project row is not readable (the panel
 * simply skips it, same policy as the pages' 404).
 */
export async function overviewForProject(
  client: Client, project: ProjectRecord, keyring: Keyring | null,
): Promise<{ modules: ProjectModules } | null> {
  const ref = await loadProjectRef(client, { tenantId: project.tenantId, projectId: project.projectId });
  if (!ref) return null;
  return { modules: await readProjectOverview(client, ref, keyring) };
}
