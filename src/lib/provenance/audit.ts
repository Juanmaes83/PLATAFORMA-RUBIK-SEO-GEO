import "server-only";

import { platform, providers, type AuditEvent, type Role } from "@/lib/core";
import { sha256, type Keyring } from "./keyring";

// Append-only audit chain (ADR 0004). The Core builds and verifies the chain (auditEvent,
// verifyAuditChain) with the injected SHA-256; the platform adds an HMAC over each hash so a
// row written directly through the Data API with a self-computed hash is detected.

/** A row of public.audit_events as stored. */
export interface AuditRow {
  project_id: string;
  organization_id: string;
  seq: number;
  at: string;
  actor_role: string;
  actor_id: string;
  action: string;
  target: string | null;
  outcome: string;
  details: unknown;
  prev_hash: string | null;
  hash: string;
  key_id: string;
  signature: string;
}

/** Project identity: database ids plus the Core scope (organization and project slugs). */
export interface ProjectRef {
  projectId: string;
  organizationId: string;
  scope: { tenantId: string; projectId: string };
}

export interface AuditInput {
  at: string;
  actor: { role: Role; id: string };
  action: string;
  target?: string | null;
  outcome?: "allowed" | "denied" | "error";
  details?: Record<string, string | number | boolean | null>;
}

const signedText = (hash: string) => "rubik-audit-v1:" + hash;

/** The Core event that a stored row represents. */
export function rowToEvent(row: AuditRow, scope: ProjectRef["scope"]): AuditEvent {
  return {
    seq: row.seq,
    at: new Date(row.at).toISOString(),
    actor: { role: row.actor_role as Role, id: row.actor_id },
    action: row.action,
    scope: { tenantId: scope.tenantId, projectId: scope.projectId, key: `${scope.tenantId}/${scope.projectId}` },
    target: row.target,
    outcome: row.outcome as AuditEvent["outcome"],
    details: (row.details ?? {}) as AuditEvent["details"],
    prevHash: row.prev_hash,
    hash: row.hash,
  };
}

/** Builds the next row of the chain. `previous` is the last stored row (null for the first). */
export function buildAuditRow(
  previous: AuditRow | null,
  input: AuditInput,
  project: ProjectRef,
  keyring: Keyring,
): { ok: true; row: Omit<AuditRow, "actor_id"> } | { ok: false; error: string } {
  const prev = previous ? rowToEvent(previous, project.scope) : null;
  const built = platform.auditEvent(prev, { ...input, scope: project.scope }, { providers, hasher: sha256.hash });
  if (!built.ok) return { ok: false, error: built.error.code };
  const e = built.event;
  const { keyId, signature } = keyring.sign(signedText(e.hash));
  return {
    ok: true,
    row: {
      project_id: project.projectId,
      organization_id: project.organizationId,
      seq: e.seq,
      at: e.at,
      actor_role: e.actor.role,
      action: e.action,
      target: e.target,
      outcome: e.outcome,
      details: e.details,
      prev_hash: e.prevHash,
      hash: e.hash,
      key_id: keyId,
      signature,
    },
  };
}

export type AuditVerification =
  | { valid: true; length: number }
  | { valid: false; brokenAt: number; reason: "SEQUENCE" | "LINK" | "HASH" | "SIGNATURE" | "SCOPE" };

/** Verifies order, links, SHA-256 hashes (Core) and the HMAC of every row (platform). */
export function verifyAuditTrail(rows: AuditRow[], project: ProjectRef, keyring: Keyring): AuditVerification {
  const sorted = [...rows].sort((a, b) => a.seq - b.seq);
  for (let i = 0; i < sorted.length; i++) {
    if (sorted[i].project_id !== project.projectId || sorted[i].organization_id !== project.organizationId) {
      return { valid: false, brokenAt: i, reason: "SCOPE" };
    }
  }
  const chain = platform.verifyAuditChain(sorted.map((r) => rowToEvent(r, project.scope)), { hasher: sha256.hash });
  if (!chain.valid) return chain;
  for (let i = 0; i < sorted.length; i++) {
    if (!keyring.verify(signedText(sorted[i].hash), sorted[i].signature, sorted[i].key_id)) {
      return { valid: false, brokenAt: i, reason: "SIGNATURE" };
    }
  }
  return { valid: true, length: sorted.length };
}
