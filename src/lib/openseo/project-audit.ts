import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/database.types";
import type { ProjectRef } from "@/lib/provenance/audit";
import type { Keyring } from "@/lib/provenance/keyring";
import { followSiteAudit, startSiteAudit, validateAuditStart, type AuditStart, type AuditFollowUp, type BridgeDeps, type BridgeError } from "./bridge";
import { acquireAuditJob, bindAuditJob, completeAuditJob, failAuditJob, findActiveAuditJob, findAuditJob, releaseStartingAuditJob } from "./jobs";
import { prepareCompletedAuditResults } from "./persistence";
import type { OpenSeoProjectConnection } from "./connections";

const failStart = (code: string, message: string): AuditStart => ({ ok: false, auditId: null, url: null,
  maxPages: null, startedAt: null, reused: false, error: { code, message, retryable: false } });
const unavailable = (code: string, message: string): AuditFollowUp => ({ progress: { ok: false, state: null,
  providerStatus: null, phase: null, pagesCrawled: null, pagesTotal: null, checkedAt: null,
  error: { code, message, retryable: false } }, report: null, captureError: null });

/**
 * Database reservation happens before the first provider request, across sessions. With a
 * connection (project mode) `deps.env` must already carry that connection's OpenSEO ids and
 * the job records the connection; a job reserved under another connection is never reused.
 */
export async function startProjectAudit(client: SupabaseClient<Database>, project: ProjectRef,
  input: { url: string; maxPages: number; projectDomain: string | null }, deps: BridgeDeps = {},
  connection: OpenSeoProjectConnection | null = null): Promise<AuditStart> {
  const validation = validateAuditStart(input, deps);
  if (validation) return { ...failStart(validation.code, validation.message), error: validation };
  const acquired = await acquireAuditJob(client, project, connection?.connectionId);
  if (!acquired.ok) return acquired.error === "JOB_CONNECTION_REFUSED"
    ? failStart("CONNECTION_NOT_ACTIVE", "La conexión de OpenSEO de este proyecto ya no está activa. No se ha lanzado ningún rastreo.")
    : failStart(acquired.error, "El registro de trabajos no está disponible. No se ha lanzado ningún rastreo.");
  const job = acquired.job;
  if ((connection?.connectionId ?? null) !== (job.connectionId ?? null)) {
    return failStart("JOB_CONNECTION_MISMATCH", "Hay un trabajo activo lanzado con otra conexión de OpenSEO. Reconcílialo antes de iniciar otro.");
  }
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

/**
 * Browser submits only a reference and intent; original trusted rows stay on server. With a
 * connection (project mode) the job must have been launched with that same ACTIVE connection:
 * legacy jobs and jobs of a revoked or replaced connection are refused before any request.
 */
export async function followProjectAudit(client: SupabaseClient<Database>, project: ProjectRef,
  auditId: string, projectDomain: string | null, save: boolean, keyring: Keyring | null,
  deps: BridgeDeps = {}, connection: OpenSeoProjectConnection | null = null): Promise<ProjectAuditFollow> {
  const found = await findAuditJob(client, project, auditId);
  if (!found.ok) return { ...unavailable(found.error === "JOB_NOT_FOUND" ? "AUDIT_NOT_BOUND" : found.error,
    "No se ha encontrado una auditoría vinculada a este proyecto."), saveStatus: "unavailable" };
  if ((connection?.connectionId ?? null) !== (found.job.connectionId ?? null)) return { ...unavailable("JOB_CONNECTION_MISMATCH",
    "Esta auditoría se lanzó con otra conexión de OpenSEO, ya revocada o sustituida. No se ha consultado."), saveStatus: "unavailable" };
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

export type Reconciliation = { mode: "bind"; auditId: string } | { mode: "release" };
export type ReconcileResult = { ok: true; state: "SYNCING" | "FAILED"; auditId: string | null } | { ok: false; error: BridgeError };
const refuse = (code: string, message: string): ReconcileResult => ({ ok: false, error: { code, message, retryable: false } });

/**
 * Owner-attested reconciliation of an uncertain launch (ADR 0008). No OpenSEO request: either
 * the audit id shown in OpenSEO is bound to the STARTING reservation (the database refuses an
 * id already used by any project), or the owner confirms no crawl was created and the
 * reservation is released atomically, only if it is still STARTING without an audit id.
 */
export async function reconcileStartingJob(client: SupabaseClient<Database>, project: ProjectRef,
  request: Reconciliation, connection: OpenSeoProjectConnection | null = null): Promise<ReconcileResult> {
  if (request.mode === "bind" && !/^[A-Za-z0-9_-]{1,64}$/.test(request.auditId)) return refuse("INVALID_AUDIT_ID", "El identificador de auditoría no es válido.");
  const active = await findActiveAuditJob(client, project);
  if (!active.ok) return refuse(active.error, "El registro de trabajos no está disponible. No se ha cambiado nada.");
  if (!active.job || active.job.state !== "STARTING") return refuse("NO_STARTING_JOB", "No hay ningún lanzamiento pendiente de confirmar.");
  if ((connection?.connectionId ?? null) !== (active.job.connectionId ?? null)) return refuse("JOB_CONNECTION_MISMATCH",
    "Esta reserva pertenece a otra conexión de OpenSEO. No se ha cambiado nada.");
  if (request.mode === "bind") {
    const bound = await bindAuditJob(client, project, active.job.jobId, request.auditId);
    return bound.ok ? { ok: true, state: "SYNCING", auditId: request.auditId }
      : refuse("RECONCILE_BIND_FAILED", "No se pudo vincular ese identificador: puede que ya pertenezca a otro trabajo o que la reserva haya cambiado. No se ha cambiado nada.");
  }
  const released = await releaseStartingAuditJob(client, project, active.job.jobId);
  return released.ok ? { ok: true, state: "FAILED", auditId: null }
    : refuse("RECONCILE_RELEASE_FAILED", "La reserva ya no está pendiente (quizá se vinculó mientras tanto). No se ha liberado nada.");
}
