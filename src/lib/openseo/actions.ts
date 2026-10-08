"use server";

import { projectAccess, type ProjectAccess } from "@/lib/access";
import { currentUser } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { myProjectMembership } from "@/lib/tenancy";
import { followSiteAudit, startSiteAudit, testOpenSeoConnection, type AuditFollowUp, type AuditStart, type ConnectionReport } from "./bridge";

// OpenSEO Server Actions (ADR 0006). Every action authenticates, loads the membership through
// RLS and asks the Core whether the role may `manage-connectors` in THAT project; the hidden
// tenant/project fields are only a lookup key. Only then does the server talk to OpenSEO, with
// credentials that never leave the server. Each call is one explicit click: nothing runs on
// render, on a timer or in the background.
const field = (formData: FormData, name: string) => String(formData.get(name) ?? "").trim();

type Denied = { denied: true };

async function authorized(formData: FormData): Promise<ProjectAccess | null> {
  const [user, supabase] = await Promise.all([currentUser(), createClient()]);
  if (!user || !supabase) return null;
  const access = projectAccess(await myProjectMembership(supabase, user.id, field(formData, "tenant"), field(formData, "project")));
  if (!access?.permissions.find((p) => p.action === "manage-connectors")?.decision.allowed) return null;
  return access;
}

export type ConnectionState = ConnectionReport | Denied | null;
export type AuditStartState = AuditStart | Denied | null;
export type AuditFollowState = (AuditFollowUp & { auditId: string }) | Denied | null;

export async function testConnectionAction(_prev: ConnectionState, formData: FormData): Promise<ConnectionState> {
  if (!(await authorized(formData))) return { denied: true };
  return testOpenSeoConnection();
}

export async function startAuditAction(_prev: AuditStartState, formData: FormData): Promise<AuditStartState> {
  const access = await authorized(formData);
  if (!access) return { denied: true };
  if (field(formData, "confirm") !== "on") {
    return { ok: false, auditId: null, url: null, maxPages: null, startedAt: null, error: { code: "CONFIRMATION_REQUIRED", message: "Confirma el lanzamiento manual.", retryable: false } };
  }
  return startSiteAudit({ url: field(formData, "url"), maxPages: Number(field(formData, "maxPages")), projectDomain: access.project.domain });
}

export async function followAuditAction(_prev: AuditFollowState, formData: FormData): Promise<AuditFollowState> {
  const access = await authorized(formData);
  if (!access) return { denied: true };
  const auditId = field(formData, "auditId");
  return { auditId, ...(await followSiteAudit(auditId, access.project.domain)) };
}
