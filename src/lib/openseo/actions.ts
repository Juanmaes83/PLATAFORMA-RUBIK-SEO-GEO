"use server";

import { projectAccess } from "@/lib/access";
import { currentUser } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { myProjectMembership } from "@/lib/tenancy";
import { revalidatePath } from "next/cache";
import { loadProjectRef } from "@/lib/imports/repository";
import { serverKeyring } from "@/lib/provenance/keyring";
import { appendAudit } from "@/lib/provenance/repository";
import { preflightTrustedWriter } from "@/lib/provenance/writer";
import { projectJobsEnabled } from "./jobs";
import { followProjectAudit, reconcileStartingJob, startProjectAudit, type ReconcileResult, type SaveStatus } from "./project-audit";
import { checkGoogleTools, testOpenSeoConnection, type AuditFollowUp, type AuditStart, type BridgeError, type ConnectionReport, type GoogleToolsReport } from "./bridge";
import { resolveOpenSeoTarget } from "./target";
import { connectProject, revokeProjectConnection, type ConnectionError } from "./connections";
import { googleCatalogCheckEnabled } from "./mcp-client";
import { recordProviderGate, requestProviderRunId } from "./provider-egress";

// OpenSEO Server Actions (ADR 0006). Every action authenticates, loads the membership through
// RLS and asks the Core whether the role may `manage-connectors` in THAT project; the hidden
// tenant/project fields are only a lookup key. Only then does the server talk to OpenSEO, with
// credentials that never leave the server. Each call is one explicit click: nothing runs on
// render, on a timer or in the background.
const field = (formData: FormData, name: string) => String(formData.get(name) ?? "").trim();

type Denied = { denied: true };

async function authorized(formData: FormData) {
  const [user, supabase] = await Promise.all([currentUser(), createClient()]);
  if (!user || !supabase) return null;
  const access = projectAccess(await myProjectMembership(supabase, user.id, field(formData, "tenant"), field(formData, "project")));
  if (!access?.permissions.find((p) => p.action === "manage-connectors")?.decision.allowed) return null;
  const project = await loadProjectRef(supabase, { tenantId: access.project.tenantId, projectId: access.project.projectId });
  return project ? { access, client: supabase, project, userId: user.id } : null;
}

async function writerReady(context: NonNullable<Awaited<ReturnType<typeof authorized>>>) {
  const keyring = serverKeyring();
  return keyring ? (await preflightTrustedWriter(context.client, context.project, context.userId, keyring, "openseo")).ok : false;
}
const writerError: BridgeError = { code: "AUDIT_WRITER_UNAVAILABLE",
  message: "La auditoría firmada no está disponible. No se ha llamado a OpenSEO ni se ha cambiado el proyecto.", retryable: true };

export type ConnectionState = ConnectionReport | Denied | null;
export type AuditStartState = AuditStart | Denied | null;
export type AuditFollowState = (AuditFollowUp & { auditId: string; saveStatus?: SaveStatus }) | Denied | null;

const startRefused = (error: BridgeError): AuditStart => ({ ok: false, auditId: null, url: null, maxPages: null, startedAt: null, reused: false, error });
const followRefused = (error: BridgeError): AuditFollowUp => ({ report: null, captureError: null,
  progress: { ok: false, state: null, providerStatus: null, phase: null, pagesCrawled: null, pagesTotal: null, checkedAt: null, error } });

export async function testConnectionAction(_prev: ConnectionState, formData: FormData): Promise<ConnectionState> {
  const context = await authorized(formData);
  if (!context) return { denied: true };
  const runId = await requestProviderRunId();
  if (!await writerReady(context)) {
    recordProviderGate(runId, "openseo", "blocked");
    return { status: "NOT_CONNECTED", health: null, authorization: "NOT_VERIFIED", reason: writerError.code,
      failingChecks: [], whoamiFields: [], checkedAt: null, error: writerError };
  }
  const target = await resolveOpenSeoTarget(context.client, context.project.projectId);
  if ("error" in target) return { status: "NOT_CONNECTED", health: null, authorization: "NOT_VERIFIED", reason: target.error.code,
    failingChecks: [], whoamiFields: [], checkedAt: null, error: target.error };
  return testOpenSeoConnection({ env: target.env, runId });
}

export async function startAuditAction(_prev: AuditStartState, formData: FormData): Promise<AuditStartState> {
  const context = await authorized(formData);
  if (!context) return { denied: true };
  const { access, client, project } = context;
  if (field(formData, "confirm") !== "on") {
    return { ok: false, auditId: null, url: null, maxPages: null, startedAt: null, reused: false, error: { code: "CONFIRMATION_REQUIRED", message: "Confirma el lanzamiento manual.", retryable: false } };
  }
  const runId = await requestProviderRunId();
  if (!await writerReady(context)) { recordProviderGate(runId, "openseo", "blocked"); return startRefused(writerError); }
  const input = { url: field(formData, "url"), maxPages: Number(field(formData, "maxPages")), projectDomain: access.project.domain };
  const target = await resolveOpenSeoTarget(client, project.projectId);
  if ("error" in target) return startRefused(target.error);
  if (!projectJobsEnabled()) return startRefused({ code: "PERSISTENCE_DISABLED", message: "El registro de trabajos no está activado. No se ha lanzado ningún rastreo.", retryable: false });
  if (!serverKeyring()) return startRefused({ code: "SIGNING_MISSING", message: "Faltan las claves de firma del servidor. No se ha lanzado ningún rastreo.", retryable: false });
  return startProjectAudit(client, project, input, { env: target.env, runId }, target.connection);
}

export async function followAuditAction(_prev: AuditFollowState, formData: FormData): Promise<AuditFollowState> {
  const context = await authorized(formData);
  if (!context) return { denied: true };
  const { access, client, project } = context;
  const auditId = field(formData, "auditId");
  const save = field(formData, "intent") === "save";
  const runId = await requestProviderRunId();
  if (!await writerReady(context)) {
    recordProviderGate(runId, "openseo", "blocked");
    return { auditId, saveStatus: "unavailable", ...followRefused(writerError) };
  }
  const target = await resolveOpenSeoTarget(client, project.projectId);
  if ("error" in target) return { auditId, saveStatus: "unavailable", ...followRefused(target.error) };
  if (projectJobsEnabled()) {
    const result = await followProjectAudit(client, project, auditId, access.project.domain, save, serverKeyring(), { env: target.env, runId }, target.connection);
    if (result.saveStatus === "saved" || result.saveStatus === "audit-pending") revalidatePath(`/proyectos/${access.project.tenantId}/${access.project.projectId}/auditoria-tecnica`);
    return { auditId, ...result };
  }
  return { auditId, saveStatus: "unavailable", report: null, captureError: null,
    progress: { ok: false, state: null, providerStatus: null, phase: null, pagesCrawled: null, pagesTotal: null, checkedAt: null,
      error: { code: "PERSISTENCE_DISABLED", message: "El registro de trabajos no está activado. No se ha consultado a OpenSEO.", retryable: false } } };
}

// Per-project connection (ADR 0007, phase 3). Owner only, explicit consent, no secret: the form
// sends the OpenSEO project identifier and the audit hosts, and the database rechecks both.
export type ConnectionChangeState = { ok: true; change: "connected" | "revoked"; audited: boolean } | { ok: false; error: ConnectionError | "CONFIRMATION_REQUIRED" } | Denied | null;

const auditPath = (tenantId: string, projectId: string) => `/proyectos/${tenantId}/${projectId}/auditoria-tecnica`;

/**
 * Records an owner change in the signed audit chain (ADR 0004) after it succeeded. The change
 * and the event are separate writes: a failed append is reported as `audited: false`, never
 * hidden. Details carry no OpenSEO identifier, only shapes and states.
 */
async function audit(context: NonNullable<Awaited<ReturnType<typeof authorized>>>, action: string, details: Record<string, string | number | boolean | null>) {
  const keyring = serverKeyring();
  if (!keyring) return false;
  const logged = await appendAudit(context.client, context.project, { actor: { role: "owner", id: context.userId }, action, outcome: "allowed", details }, keyring);
  return logged.ok;
}

export async function connectProjectAction(_prev: ConnectionChangeState, formData: FormData): Promise<ConnectionChangeState> {
  const context = await authorized(formData);
  if (!context) return { denied: true };
  if (field(formData, "consent") !== "on") return { ok: false, error: "CONFIRMATION_REQUIRED" };
  if (!await writerReady(context)) return { ok: false, error: "AUDIT_WRITER_UNAVAILABLE" };
  const result = await connectProject(context.client, context.project.projectId, {
    openseoProjectId: field(formData, "openseoProjectId"),
    allowedHosts: formData.getAll("host").map((h) => String(h)),
    consent: true,
  });
  if (!result.ok) return { ok: false, error: result.error };
  const audited = await audit(context, "openseo.connection.connect", { hosts: result.connection?.allowedHosts.length ?? 0, credentialMode: "platform" });
  revalidatePath(auditPath(context.access.project.tenantId, context.access.project.projectId));
  return { ok: true, change: "connected", audited };
}

export async function revokeProjectAction(_prev: ConnectionChangeState, formData: FormData): Promise<ConnectionChangeState> {
  const context = await authorized(formData);
  if (!context) return { denied: true };
  if (field(formData, "confirm") !== "on") return { ok: false, error: "CONFIRMATION_REQUIRED" };
  if (!await writerReady(context)) return { ok: false, error: "AUDIT_WRITER_UNAVAILABLE" };
  const result = await revokeProjectConnection(context.client, context.project.projectId);
  if (!result.ok) return { ok: false, error: result.error };
  const audited = await audit(context, "openseo.connection.revoke", { state: "REVOKED" });
  revalidatePath(auditPath(context.access.project.tenantId, context.access.project.projectId));
  return { ok: true, change: "revoked", audited };
}

// Uncertain launch reconciliation (ADR 0008). Owner only, explicit attestation, no OpenSEO call.
export type ReconcileState = (ReconcileResult & { audited?: boolean }) | Denied | null;

export async function reconcileAuditAction(_prev: ReconcileState, formData: FormData): Promise<ReconcileState> {
  const context = await authorized(formData);
  if (!context) return { denied: true };
  const refused = (code: string, message: string): ReconcileResult => ({ ok: false, error: { code, message, retryable: false } });
  if (field(formData, "confirm") !== "on") return refused("CONFIRMATION_REQUIRED", "Marca la confirmación para continuar.");
  if (!await writerReady(context)) return refused(writerError.code, writerError.message);
  if (!projectJobsEnabled()) return refused("PERSISTENCE_DISABLED", "El registro de trabajos no está activado en este servidor.");
  const target = await resolveOpenSeoTarget(context.client, context.project.projectId);
  if ("error" in target) return { ok: false, error: target.error };
  const intent = field(formData, "intent");
  const result = intent === "bind" ? await reconcileStartingJob(context.client, context.project, { mode: "bind", auditId: field(formData, "auditId") }, target.connection)
    : intent === "release" ? await reconcileStartingJob(context.client, context.project, { mode: "release" }, target.connection)
      : refused("INVALID_INTENT", "Acción no reconocida.");
  if (!result.ok) return result;
  const audited = await audit(context, "openseo.job.reconcile", { resolution: intent, state: result.state });
  revalidatePath(auditPath(context.access.project.tenantId, context.access.project.projectId));
  return { ...result, audited };
}

export type GoogleToolsState = GoogleToolsReport | Denied | null;

/** Owner click: reads the hosted tool list with the project's OpenSEO target. Never calls Google. */
export async function checkGoogleToolsAction(_prev: GoogleToolsState, formData: FormData): Promise<GoogleToolsState> {
  const context = await authorized(formData);
  if (!context) return { denied: true };
  const runId = await requestProviderRunId();
  if (!googleCatalogCheckEnabled()) recordProviderGate(runId, "google-via-openseo", "blocked");
  if (!googleCatalogCheckEnabled()) return { ok: false, error: { code: "GOOGLE_CATALOG_DISABLED", message: "La comprobación del catálogo de Google no está activada.", retryable: false } };
  if (!await writerReady(context)) return { ok: false, error: writerError };
  const target = await resolveOpenSeoTarget(context.client, context.project.projectId);
  if ("error" in target) return { ok: false, error: target.error };
  return checkGoogleTools({ env: target.env, runId });
}
