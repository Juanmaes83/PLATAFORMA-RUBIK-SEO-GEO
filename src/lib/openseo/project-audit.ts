import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/database.types";
import type { ProjectRef } from "@/lib/provenance/audit";
import type { Keyring } from "@/lib/provenance/keyring";
import { followSiteAudit, startSiteAudit, validateAuditStart, type AuditStart, type AuditFollowUp, type BridgeDeps } from "./bridge";
import { acquireAuditJob, bindAuditJob, completeAuditJob, failAuditJob, findAuditJob } from "./jobs";
import { prepareCompletedAuditResults } from "./persistence";

const failStart = (code: string, message: string): AuditStart => ({ ok: false, auditId: null, url: null,
  maxPages: null, startedAt: null, reused: false, error: { code, message, retryable: false } });
const unavailable = (code: string, message: string): AuditFollowUp => ({ progress: { ok: false, state: null,
  providerStatus: null, phase: null, pagesCrawled: null, pagesTotal: null, checkedAt: null,
  error: { code, message, retryable: false } }, report: null, captureError: null });

/** Database reservation happens before the first provider request, across sessions. */
export async function startProjectAudit(client: SupabaseClient<Database>, project: ProjectRef,
  input: { url: string; maxPages: number; projectDomain: string | null }, deps: BridgeDeps = {}): Promise<AuditStart> {
  const validation = validateAuditStart(input, deps);
  if (validation) return { ...failStart(validation.code, validation.message), error: validation };
  const acquired = await acquireAuditJob(client, project);
  if (!acquired.ok) return failStart(acquired.error, "El registro de trabajos no está disponible. No se ha lanzado ningún rastreo.");
  const job = acquired.job;
  if (!job.acquired) {
    if (job.state === "SYNCING" && job.auditId) return { ok: true, auditId: job.auditId,
      url: null, maxPages: null, startedAt: null, reused: true, error: null };
    return failStart("START_IN_PROGRESS", "Existe un lanzamiento pendiente de confirmar. Reconcílialo antes de iniciar otro.");
  }
  let started: AuditStart;
  try { started = await startSiteAudit(input, deps); }
  catch { return failStart("START_UNCERTAIN", "No se pudo confirmar la respuesta del lanzamiento. La reserva se conserva para evitar duplicarlo."); }
  if (!started.ok || !started.auditId) {
    // Only documented refusals prove no new crawl was created. Transport errors,
    // malformed responses and generic TOOL_ERROR retain STARTING for reconciliation.
    if (["AUDIT_CAPACITY_REACHED", "AUDIT_ALREADY_RUNNING"].includes(started.error?.code ?? "")) {
      await failAuditJob(client, project, job.jobId);
    }
    return started;
  }
  const bound = await bindAuditJob(client, project, job.jobId, started.auditId);
  if (!bound.ok) return { ...started, ok: false, error: { code: "BIND_FAILED",
    message: "OpenSEO inició el rastreo, pero no se pudo confirmar su vínculo. La reserva se conserva; no lo relances.", retryable: true } };
  return started;
}

export type SaveStatus = "not-requested" | "saved" | "pending" | "unavailable";
export type ProjectAuditFollow = AuditFollowUp & { saveStatus: SaveStatus };

/** Browser submits only a reference and intent; original trusted rows stay on server. */
export async function followProjectAudit(client: SupabaseClient<Database>, project: ProjectRef,
  auditId: string, projectDomain: string | null, save: boolean, keyring: Keyring | null,
  deps: BridgeDeps = {}): Promise<ProjectAuditFollow> {
  const found = await findAuditJob(client, project, auditId);
  if (!found.ok) return { ...unavailable(found.error === "JOB_NOT_FOUND" ? "AUDIT_NOT_BOUND" : found.error,
    "No se ha encontrado una auditoría vinculada a este proyecto."), saveStatus: "unavailable" };
  if (save && !keyring) return { ...unavailable("SIGNING_MISSING", "Faltan las claves de firma del servidor. No se ha consultado ni guardado el resultado."), saveStatus: "unavailable" };
  if (found.job.state === "FAILED") return { ...unavailable("AUDIT_FAILED", "Este trabajo terminó con un fallo confirmado."), saveStatus: "unavailable" };
  let saveStatus: SaveStatus = save ? "pending" : "not-requested";
  const response = await followSiteAudit(auditId, projectDomain, {
    ...deps, boundAuditId: found.job.auditId,
    captureCompletedResults: save && keyring ? async capture => {
      const prepared = prepareCompletedAuditResults(capture, project, keyring);
      if (!prepared.ok) throw new Error("CAPTURE_FAILED");
      const stored = await completeAuditJob(client, project, found.job.jobId, prepared.prepared);
      if (!stored.ok || !stored.job.issuesResultId || !stored.job.pagesResultId) throw new Error("CAPTURE_FAILED");
      saveStatus = "saved";
    } : undefined,
  });
  if (response.progress.state === "FAILED") await failAuditJob(client, project, found.job.jobId);
  if (response.captureError || (save && response.progress.error)) saveStatus = "unavailable";
  return { ...response, saveStatus };
}
