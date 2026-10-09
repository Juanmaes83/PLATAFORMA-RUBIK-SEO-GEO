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
  issuesResultId: string | null;
  pagesResultId: string | null;
}
type Outcome = { ok: true; job: ProjectAuditJob } | { ok: false; error: "JOB_NOT_FOUND" | "JOB_UNAVAILABLE" | "JOB_INVALID_RESPONSE" };
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const audit = /^[A-Za-z0-9_-]{1,64}$/;

/** Session client only; never a service key. Error details are not serialized. */
async function command(client: SupabaseClient<Database>, project: ProjectRef,
  p_command: "acquire" | "get" | "bind" | "complete" | "fail", p_job_id?: string, p_payload?: Json): Promise<Outcome> {
  if (!uuid.test(project.projectId) || !uuid.test(project.organizationId) || (p_job_id && !uuid.test(p_job_id))) {
    return { ok: false, error: "JOB_INVALID_RESPONSE" };
  }
  try {
    const { data, error } = await client.rpc("openseo_job", { p_project_id: project.projectId, p_command, p_job_id, p_payload });
    if (error) return { ok: false, error: error.code === "22023" ? "JOB_NOT_FOUND" : "JOB_UNAVAILABLE" };
    if (!data || Array.isArray(data) || typeof data !== "object") return { ok: false, error: "JOB_INVALID_RESPONSE" };
    const j = data as Record<string, unknown>;
    const nullableUuid = (v: unknown) => v === null || (typeof v === "string" && uuid.test(v));
    if (typeof j.jobId !== "string" || !uuid.test(j.jobId)
      || !(j.auditId === null || (typeof j.auditId === "string" && audit.test(j.auditId)))
      || !["STARTING", "SYNCING", "COMPLETED", "FAILED"].includes(String(j.state))
      || typeof j.acquired !== "boolean" || !nullableUuid(j.issuesResultId) || !nullableUuid(j.pagesResultId)
      || (j.state === "SYNCING" && !j.auditId)) return { ok: false, error: "JOB_INVALID_RESPONSE" };
    return { ok: true, job: { jobId: j.jobId, auditId: j.auditId as string | null,
      state: j.state as ProjectAuditJob["state"], acquired: j.acquired,
      issuesResultId: j.issuesResultId as string | null, pagesResultId: j.pagesResultId as string | null } };
  } catch { return { ok: false, error: "JOB_UNAVAILABLE" }; }
}

export const acquireAuditJob = (client: SupabaseClient<Database>, project: ProjectRef) => command(client, project, "acquire");
export const bindAuditJob = (client: SupabaseClient<Database>, project: ProjectRef, jobId: string, auditId: string) =>
  command(client, project, "bind", jobId, { auditId });
export const findAuditJob = (client: SupabaseClient<Database>, project: ProjectRef, auditId: string): Promise<Outcome> =>
  audit.test(auditId) ? command(client, project, "get", undefined, { auditId }) : Promise.resolve({ ok: false, error: "JOB_NOT_FOUND" });
export const failAuditJob = (client: SupabaseClient<Database>, project: ProjectRef, jobId: string) => command(client, project, "fail", jobId);
export const completeAuditJob = (client: SupabaseClient<Database>, project: ProjectRef, jobId: string, results: PreparedAuditResults) =>
  command(client, project, "complete", jobId, JSON.parse(JSON.stringify({ auditIssues: results.issues, auditPages: results.pages })) as Json);

export const projectJobsEnabled = (env: Record<string, string | undefined> = process.env) => env.OPENSEO_PROJECT_JOBS_ENABLED === "true";
