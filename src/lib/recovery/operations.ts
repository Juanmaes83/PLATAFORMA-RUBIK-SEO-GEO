import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/database.types";
import type { ProjectRef } from "@/lib/provenance/audit";
import type { ProviderResultRow } from "@/lib/provenance/results";
import { getProjectConnection, type OpenSeoProjectConnection } from "@/lib/openseo/connections";
import { findActiveAuditJob, findAuditJob, type ProjectAuditJob } from "@/lib/openseo/jobs";
import { getWebmasterProperty, type WebmasterProperty } from "@/lib/webmaster/properties";

// Pilot recovery (ROADMAP phase 1): operational state that the signed export alone does not
// carry. Read through the owner's session RPCs only (private tables are never reachable
// directly); each part reports its own error code so one failure never hides the rest.
// Nothing here writes, calls a provider or returns a secret.

type Part<T> = { ok: true; value: T } | { ok: false; error: string };
function part<T>(r: { ok: true } | { ok: false; error: string }, value: () => T): Part<T> {
  return r.ok ? { ok: true, value: value() } : { ok: false, error: r.error };
}

export interface OperationalState {
  openseo: {
    /** Current ACTIVE connection or null. Revoked history is not readable through the RPC. */
    connection: Part<OpenSeoProjectConnection | null>;
    activeJob: Part<(ProjectAuditJob & { createdAt: string }) | null>;
    /** Jobs linked to the audit ids found in the exported OpenSEO results. */
    jobs: { auditId: string; job: Part<ProjectAuditJob> }[];
  };
  webmaster: { searchConsole: Part<WebmasterProperty | null>; bing: Part<WebmasterProperty | null> };
  /** What a restore cannot recover from this file; stated so nobody assumes otherwise. */
  notIncluded: string[];
}

export const NOT_INCLUDED = Object.freeze([
  "signing-keys: the HMAC keyring lives outside the database and must be kept separately by the owner",
  "revoked-openseo-connections: only the active connection is readable through the owner RPC",
  "openseo-jobs-without-stored-results: jobs that never stored a result have no audit id to look them up",
  "credentials: no provider credential is stored by the platform or exported",
]);

const AUDIT_ID = /^[A-Za-z0-9_-]{1,64}$/;

/** Distinct OpenSEO audit ids carried in the signed provenance of stored results. */
export function auditIdsFromResults(rows: Pick<ProviderResultRow, "provider" | "signed_payload">[]): string[] {
  const ids = new Set<string>();
  for (const row of rows) {
    if (row.provider !== "openseo") continue;
    const id = (row.signed_payload as { provenance?: { evidence?: { auditId?: unknown } } } | null)?.provenance?.evidence?.auditId;
    if (typeof id === "string" && AUDIT_ID.test(id)) ids.add(id);
  }
  return [...ids].sort();
}

export async function readOperationalState(client: SupabaseClient<Database>, project: ProjectRef,
  results: Pick<ProviderResultRow, "provider" | "signed_payload">[]): Promise<OperationalState> {
  const [connection, activeJob, searchConsole, bing] = await Promise.all([
    getProjectConnection(client, project.projectId),
    findActiveAuditJob(client, project),
    getWebmasterProperty(client, project.projectId, "search-console"),
    getWebmasterProperty(client, project.projectId, "bing-webmaster"),
  ]);
  const jobs = [];
  for (const auditId of auditIdsFromResults(results)) {
    const found = await findAuditJob(client, project, auditId);
    jobs.push({ auditId, job: part(found, () => (found as { job: ProjectAuditJob }).job) });
  }
  return {
    openseo: {
      connection: part(connection, () => (connection as { connection: OpenSeoProjectConnection | null }).connection),
      activeJob: part(activeJob, () => (activeJob as { job: (ProjectAuditJob & { createdAt: string }) | null }).job),
      jobs,
    },
    webmaster: {
      searchConsole: part(searchConsole, () => (searchConsole as { property: WebmasterProperty | null }).property),
      bing: part(bing, () => (bing as { property: WebmasterProperty | null }).property),
    },
    notIncluded: [...NOT_INCLUDED],
  };
}
