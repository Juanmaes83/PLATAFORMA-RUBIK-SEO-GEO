"use server";

import { projectAccess } from "@/lib/access";
import { currentUser } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { myProjectMembership } from "@/lib/tenancy";
import { revalidatePath } from "next/cache";
import { loadProjectRef } from "@/lib/imports/repository";
import { serverKeyring } from "@/lib/provenance/keyring";
import { projectJobsEnabled } from "./jobs";
import { followProjectAudit, startProjectAudit, type SaveStatus } from "./project-audit";
import { followSiteAudit, startSiteAudit, testOpenSeoConnection, type AuditFollowUp, type AuditStart, type BridgeError, type ConnectionReport } from "./bridge";
import { resolveOpenSeoTarget } from "./target";

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
  return project ? { access, client: supabase, project } : null;
}

export type ConnectionState = ConnectionReport | Denied | null;
export type AuditStartState = AuditStart | Denied | null;
export type AuditFollowState = (AuditFollowUp & { auditId: string; saveStatus?: SaveStatus }) | Denied | null;

const startRefused = (error: BridgeError): AuditStart => ({ ok: false, auditId: null, url: null, maxPages: null, startedAt: null, reused: false, error });
const followRefused = (error: BridgeError): AuditFollowUp => ({ report: null, captureError: null,
  progress: { ok: false, state: null, providerStatus: null, phase: null, pagesCrawled: null, pagesTotal: null, checkedAt: null, error } });

export async function testConnectionAction(_prev: ConnectionState, formData: FormData): Promise<ConnectionState> {
  const context = await authorized(formData);
  if (!context) return { denied: true };
  const target = await resolveOpenSeoTarget(context.client, context.project.projectId);
  if ("error" in target) return { status: "NOT_CONNECTED", health: null, authorization: "NOT_VERIFIED", reason: target.error.code,
    failingChecks: [], whoamiFields: [], checkedAt: null, error: target.error };
  return testOpenSeoConnection({ env: target.env });
}

export async function startAuditAction(_prev: AuditStartState, formData: FormData): Promise<AuditStartState> {
  const context = await authorized(formData);
  if (!context) return { denied: true };
  const { access, client, project } = context;
  if (field(formData, "confirm") !== "on") {
    return { ok: false, auditId: null, url: null, maxPages: null, startedAt: null, reused: false, error: { code: "CONFIRMATION_REQUIRED", message: "Confirma el lanzamiento manual.", retryable: false } };
  }
  const input = { url: field(formData, "url"), maxPages: Number(field(formData, "maxPages")), projectDomain: access.project.domain };
  const target = await resolveOpenSeoTarget(client, project.projectId);
  if ("error" in target) return startRefused(target.error);
  if (!projectJobsEnabled()) return startSiteAudit(input);
  if (!serverKeyring()) return startRefused({ code: "SIGNING_MISSING", message: "Faltan las claves de firma del servidor. No se ha lanzado ningún rastreo.", retryable: false });
  return startProjectAudit(client, project, input, { env: target.env }, target.connection);
}

export async function followAuditAction(_prev: AuditFollowState, formData: FormData): Promise<AuditFollowState> {
  const context = await authorized(formData);
  if (!context) return { denied: true };
  const { access, client, project } = context;
  const auditId = field(formData, "auditId");
  const save = field(formData, "intent") === "save";
  const target = await resolveOpenSeoTarget(client, project.projectId);
  if ("error" in target) return { auditId, saveStatus: "unavailable", ...followRefused(target.error) };
  if (projectJobsEnabled()) {
    const result = await followProjectAudit(client, project, auditId, access.project.domain, save, serverKeyring(), { env: target.env }, target.connection);
    if (result.saveStatus === "saved") revalidatePath(`/proyectos/${access.project.tenantId}/${access.project.projectId}/auditoria-tecnica`);
    return { auditId, ...result };
  }
  if (save) return { auditId, saveStatus: "unavailable", report: null, captureError: null,
    progress: { ok: false, state: null, providerStatus: null, phase: null, pagesCrawled: null, pagesTotal: null, checkedAt: null,
      error: { code: "PERSISTENCE_DISABLED", message: "El guardado aún no está activado en este servidor.", retryable: false } } };
  return { auditId, ...(await followSiteAudit(auditId, access.project.domain)) };
}
