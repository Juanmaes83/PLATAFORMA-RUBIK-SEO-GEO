import "server-only";

import { createHash } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database, Json } from "@/lib/supabase/database.types";
import type { Keyring } from "@/lib/provenance/keyring";
import type { AuditInput, ProjectRef } from "@/lib/provenance/audit";
import { appendAudit } from "@/lib/provenance/repository";
import { parseImport, type FileError, type Finding, type ImportStatus, type RowError } from "./contract";

// CORE-9.3 persistence (ADR 0005). Every call runs as the signed-in user (publishable key), so
// RLS decides who may import, read or erase. Each accepted or rejected file leaves an audit
// event; a file rejected as a whole stores nothing else.

type Client = SupabaseClient<Database>;

export interface ImportRow {
  id: string;
  project_id: string;
  organization_id: string;
  format: string;
  source_kind: string;
  source_label: string;
  source_url: string | null;
  source_tool: string | null;
  captured_at: string;
  period_start: string | null;
  period_end: string | null;
  status: ImportStatus;
  finding_count: number;
  error_count: number;
  findings: Finding[];
  errors: RowError[];
  file_sha256: string;
  file_bytes: number;
  created_by: string | null;
  created_at: string;
}

export type ImportSummary = Omit<ImportRow, "findings" | "errors">;
const SUMMARY_FIELDS =
  "id, project_id, organization_id, format, source_kind, source_label, source_url, source_tool, captured_at, period_start, period_end, status, finding_count, error_count, file_sha256, file_bytes, created_by, created_at";

export type ImportOutcome =
  | { ok: true; id: string; status: ImportStatus; findings: number; errors: number }
  | { ok: false; error: FileError | "DUPLICATE" | "NOT_ALLOWED" | "WRITE_FAILED" | "AUDIT_FAILED" | "PROJECT_NOT_FOUND"; existingId?: string };

/** Database ids for a project the user can read, from the Core scope (organization/project slugs). */
export async function loadProjectRef(client: Client, scope: { tenantId: string; projectId: string }): Promise<ProjectRef | null> {
  const { data, error } = await client
    .from("projects")
    .select("id, organization_id, organizations!inner(slug)")
    .eq("slug", scope.projectId)
    .eq("organizations.slug", scope.tenantId)
    .maybeSingle();
  if (error || !data) return null;
  return { projectId: data.id, organizationId: data.organization_id, scope };
}

/**
 * Validates and stores one file. `bytes` is the raw upload; it is decoded as UTF-8 (invalid
 * UTF-8 is rejected as NOT_JSON) and hashed for idempotency, then discarded.
 */
export async function importFile(client: Client, project: ProjectRef, bytes: Uint8Array, actor: AuditInput["actor"], keyring: Keyring): Promise<ImportOutcome> {
  const sha256 = createHash("sha256").update(bytes).digest("hex");
  const audit = (outcome: "allowed" | "denied", details: AuditInput["details"]) =>
    appendAudit(client, project, { actor, action: "import.file", target: sha256, outcome, details }, keyring);

  let text: string;
  try {
    text = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    text = "\u0000";
  }
  const parsed = parseImport(text, project.scope, bytes.byteLength);
  if (!parsed.ok) {
    const logged = await audit("denied", { reason: parsed.error, bytes: bytes.byteLength });
    return logged.ok ? { ok: false, error: parsed.error } : { ok: false, error: logged.error === "NOT_ALLOWED" ? "NOT_ALLOWED" : "AUDIT_FAILED" };
  }

  const existing = await client.from("imports").select("id").eq("project_id", project.projectId).eq("file_sha256", sha256).maybeSingle();
  if (existing.data) {
    await audit("denied", { reason: "DUPLICATE", importId: existing.data.id });
    return { ok: false, error: "DUPLICATE", existingId: existing.data.id };
  }

  const p = parsed.import;
  const { data, error } = await client
    .from("imports")
    .insert({
      project_id: project.projectId,
      organization_id: project.organizationId,
      format: p.format,
      source_kind: p.source.kind,
      source_label: p.source.label,
      source_url: p.source.url,
      source_tool: p.source.tool,
      captured_at: p.capturedAt,
      period_start: p.period?.start ?? null,
      period_end: p.period?.end ?? null,
      status: p.status,
      finding_count: p.findings.length,
      error_count: p.errors.length,
      findings: p.findings as unknown as NonNullable<Json>,
      errors: p.errors as unknown as NonNullable<Json>,
      file_sha256: sha256,
      file_bytes: bytes.byteLength,
    })
    .select("id")
    .single();
  if (error) {
    if (error.code === "23505") return { ok: false, error: "DUPLICATE" };
    await audit("denied", { reason: error.code === "42501" ? "NOT_ALLOWED" : "WRITE_FAILED" });
    return { ok: false, error: error.code === "42501" ? "NOT_ALLOWED" : "WRITE_FAILED" };
  }
  const logged = await audit("allowed", { importId: data.id, status: p.status, findings: p.findings.length, errors: p.errors.length });
  if (!logged.ok) return { ok: false, error: "AUDIT_FAILED" };
  return { ok: true, id: data.id, status: p.status, findings: p.findings.length, errors: p.errors.length };
}

export async function listImports(client: Client, project: ProjectRef): Promise<ImportSummary[]> {
  const { data, error } = await client.from("imports").select(SUMMARY_FIELDS).eq("project_id", project.projectId).order("created_at", { ascending: false });
  if (error) throw new Error(`No se pudieron leer las importaciones (${error.code}).`);
  return data as ImportSummary[];
}

export async function getImport(client: Client, project: ProjectRef, id: string): Promise<ImportRow | null> {
  if (!/^[0-9a-f-]{36}$/.test(id)) return null;
  const { data, error } = await client.from("imports").select("*").eq("project_id", project.projectId).eq("id", id).maybeSingle();
  if (error || !data) return null;
  return data as unknown as ImportRow;
}

/** Findings of every import of the project for one URL (exact match on the normalised URL). */
export async function findingsForUrl(client: Client, project: ProjectRef, url: string): Promise<{ importId: string; capturedAt: string; finding: Finding }[]> {
  const rows = await client.from("imports").select("id, captured_at, findings").eq("project_id", project.projectId).order("captured_at", { ascending: false });
  if (rows.error) throw new Error(`No se pudieron leer las importaciones (${rows.error.code}).`);
  return (rows.data as unknown as { id: string; captured_at: string; findings: Finding[] }[]).flatMap((r) =>
    r.findings.filter((f) => f.url === url).map((finding) => ({ importId: r.id, capturedAt: r.captured_at, finding })),
  );
}

/** Erases one import (owner only, enforced by RLS) and records it in the audit trail. */
export async function eraseImport(client: Client, project: ProjectRef, id: string, actor: AuditInput["actor"], keyring: Keyring): Promise<{ ok: true; erased: number } | { ok: false; error: string }> {
  const { data, error } = await client.from("imports").delete().eq("project_id", project.projectId).eq("id", id).select("id");
  if (error) return { ok: false, error: "WRITE_FAILED" };
  if (data.length === 0) return { ok: false, error: "NOT_FOUND_OR_NOT_ALLOWED" };
  const logged = await appendAudit(client, project, { actor, action: "import.erase", target: id, outcome: "allowed", details: { erased: data.length } }, keyring);
  return logged.ok ? { ok: true, erased: data.length } : { ok: false, error: "AUDIT_FAILED" };
}
