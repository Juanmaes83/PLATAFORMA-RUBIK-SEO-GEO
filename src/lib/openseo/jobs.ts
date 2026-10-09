import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database, Json } from "@/lib/supabase/database.types";
import type { ProjectRef } from "@/lib/provenance/audit";
import type { PreparedAuditResults } from "./persistence";

export interface ProjectAuditJob {
  jobId: string;
  auditId: string | null;
  state: "STARTING" | "SYNCING" | "COMPLETED" | "FAILED";
  acquired: boolean;
  /** Per-project connection that launched it; null for a legacy job (global OPENSEO_PROJECT_ID). */
  connectionId: string | null;
  issuesResultId: string | null;
  pagesResultId: string | null;
}
type Outcome = { ok: true; job: ProjectAuditJob } | { ok: false; error: "JOB_NOT_FOUND" | "JOB_UNAVAILABLE" | "JOB_INVALID_RESPONSE" | "JOB_CONNECTION_REFUSED" };
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const audit = /^[A-Za-z0-9_-]{1,64}$/;

function parseJob(data: unknown): Outcome {
  if (!data || Array.isArray(data) || typeof data !== "object") return { ok: false, error: "JOB_INVALID_RESPONSE" };
  const j = data as Record<string, unknown>;
  const nullableUuid = (v: unknown) => v === null || (typeof v === "string" && uuid.test(v));
  if (typeof j.jobId !== "string" || !uuid.test(j.jobId)
    || !(j.auditId === null || (typeof j.auditId === "string" && audit.test(j.auditId)))
    || !["STARTING", "SYNCING", "COMPLETED", "FAILED"].includes(String(j.state))
    || typeof j.acquired !== "boolean" || !nullableUuid(j.connectionId ?? null) || !nullableUuid(j.issuesResultId) || !nullableUuid(j.pagesResultId)
    || (j.state === "SYNCING" && !j.auditId)) return { ok: false, error: "JOB_INVALID_RESPONSE" };
  return { ok: true, job: { jobId: j.jobId, auditId: j.auditId as string | null,
    state: j.state as ProjectAuditJob["state"], acquired: j.acquired, connectionId: (j.connectionId ?? null) as string | null,
    issuesResultId: j.issuesResultId as string | null, pagesResultId: j.pagesResultId as string | null } };
}

/** Session client only; never a service key. Error details are not serialized. */
async function command(client: SupabaseClient<Database>, project: ProjectRef,
  p_command: "acquire" | "get" | "bind" | "complete" | "fail", p_job_id?: string, p_payload?: Json): Promise<Outcome> {
  if (!uuid.test(project.projectId) || !uuid.test(project.organizationId) || (p_job_id && !uuid.test(p_job_id))) {
    return { ok: false, error: "JOB_INVALID_RESPONSE" };
  }
  try {
    const { data, error } = await client.rpc("openseo_job", { p_project_id: project.projectId, p_command, p_job_id, p_payload });
    if (error) return { ok: false, error: error.code === "22023" ? "JOB_NOT_FOUND" : error.code === "23514" && p_command === "acquire" ? "JOB_CONNECTION_REFUSED" : "JOB_UNAVAILABLE" };
    return parseJob(data);
  } catch { return { ok: false, error: "JOB_UNAVAILABLE" }; }
}

/** With a connection id (project mode) the database checks it is this project's ACTIVE connection. */
export const acquireAuditJob = (client: SupabaseClient<Database>, project: ProjectRef, connectionId?: string) =>
  connectionId === undefined ? command(client, project, "acquire")
    : uuid.test(connectionId) ? command(client, project, "acquire", undefined, { connectionId })
      : Promise.resolve<Outcome>({ ok: false, error: "JOB_CONNECTION_REFUSED" });
export const bindAuditJob = (client: SupabaseClient<Database>, project: ProjectRef, jobId: string, auditId: string) =>
  command(client, project, "bind", jobId, { auditId });
export const findAuditJob = (client: SupabaseClient<Database>, project: ProjectRef, auditId: string): Promise<Outcome> =>
  audit.test(auditId) ? command(client, project, "get", undefined, { auditId }) : Promise.resolve({ ok: false, error: "JOB_NOT_FOUND" });
export const failAuditJob = (client: SupabaseClient<Database>, project: ProjectRef, jobId: string) => command(client, project, "fail", jobId);
export const completeAuditJob = (client: SupabaseClient<Database>, project: ProjectRef, jobId: string, results: PreparedAuditResults) =>
  command(client, project, "complete", jobId, JSON.parse(JSON.stringify({ auditIssues: results.issues, auditPages: results.pages })) as Json);

export const projectJobsEnabled = (env: Record<string, string | undefined> = process.env) => env.OPENSEO_PROJECT_JOBS_ENABLED === "true";

/** Read-only: the project's STARTING/SYNCING job, or null. Never creates a reservation. */
export async function findActiveAuditJob(client: SupabaseClient<Database>, project: ProjectRef):
  Promise<{ ok: true; job: (ProjectAuditJob & { createdAt: string }) | null } | { ok: false; error: "JOB_UNAVAILABLE" | "JOB_INVALID_RESPONSE" }> {
  if (!uuid.test(project.projectId)) return { ok: false, error: "JOB_INVALID_RESPONSE" };
  try {
    const { data, error } = await client.rpc("openseo_active_job", { p_project_id: project.projectId });
    if (error) return { ok: false, error: "JOB_UNAVAILABLE" };
    if (data && typeof data === "object" && !Array.isArray(data) && (data as { state?: unknown }).state === "NONE") return { ok: true, job: null };
    const parsed = parseJob(data);
    const createdAt = (data as { createdAt?: unknown } | null)?.createdAt;
    if (!parsed.ok || typeof createdAt !== "string" || Number.isNaN(Date.parse(createdAt))
      || !["STARTING", "SYNCING"].includes(parsed.job.state)) return { ok: false, error: "JOB_INVALID_RESPONSE" };
    return { ok: true, job: { ...parsed.job, createdAt } };
  } catch { return { ok: false, error: "JOB_UNAVAILABLE" }; }
}

/** Releases only a STARTING reservation without audit id; a job bound meanwhile is never released. */
export async function releaseStartingAuditJob(client: SupabaseClient<Database>, project: ProjectRef, jobId: string): Promise<Outcome> {
  if (!uuid.test(project.projectId) || !uuid.test(jobId)) return { ok: false, error: "JOB_INVALID_RESPONSE" };
  try {
    const { data, error } = await client.rpc("openseo_release_starting_job", { p_project_id: project.projectId, p_job_id: jobId });
    if (error) return { ok: false, error: error.code === "23514" ? "JOB_NOT_FOUND" : "JOB_UNAVAILABLE" };
    return parseJob(data);
  } catch { return { ok: false, error: "JOB_UNAVAILABLE" }; }
}
