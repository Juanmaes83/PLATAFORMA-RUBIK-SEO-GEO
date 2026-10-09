import "server-only";
import { randomBytes } from "node:crypto";
import type { Keyring } from "@/lib/provenance/keyring";
import { verifyProjectExport } from "@/lib/recovery/verify-export";

// Restore drill (Entrega E2, docs/RECUPERACION-ENSAYO.md). Turns a VERIFIED project export into
// one idempotent SQL transaction that an operator runs with psql against a database they
// control (the drill: a disposable local stack). It never connects anywhere, never re-signs and
// never changes a stored value: rows keep their ids, UUIDs, hashes and signatures, so the same
// keyring verifies them after the restore exactly as before.
//
// Fail closed: a tampered file (recorded verification disagrees with the recomputed one), a
// broken audit chain, or a result whose signature does not verify refuses the whole restore,
// unless the operator explicitly asks to skip unverified results (reported, never restored).
//
// The file has no organization or project rows (only ids and slugs), so the plan recreates
// them only if missing, with the slugs as names and the operator as owner. An existing row
// with the same id is kept as is; a slug taken by another id makes the transaction fail.

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const SLUG = /^[a-z0-9][a-z0-9-]{1,62}$/;

export type RestoreRefusal =
  | "NOT_AN_EXPORT" | "UNSUPPORTED_FORMAT" | "MIXED_PROJECTS" | "EMPTY_SCOPE"
  | "TAMPERED" | "AUDIT_CHAIN_INVALID" | "UNVERIFIED_RESULTS" | "INVALID_OPERATOR" | "INVALID_ROWS";

export interface RestorePlan {
  projectId: string;
  organizationId: string;
  scope: { tenantId: string; projectId: string };
  counts: { audit: number; results: number; imports: number; skippedUnverified: number };
  /** One transaction; safe to run twice (rows already present are left untouched). */
  sql: string;
}

const literal = (value: unknown) => {
  const json = JSON.stringify(value);
  // A fresh dollar-quote tag that cannot occur in the payload, so nothing can close it early.
  let tag: string;
  do tag = `$rubik_${randomBytes(6).toString("hex")}$`; while (json.includes(tag));
  return `${tag}${json}${tag}::jsonb`;
};

export function planRestore(doc: unknown, keyring: Keyring, opts: { operatorId: string; skipUnverified?: boolean }):
  { ok: true; plan: RestorePlan; skipped: { index: number; reason: string | null }[] } | { ok: false; error: RestoreRefusal } {
  if (!UUID.test(opts.operatorId)) return { ok: false, error: "INVALID_OPERATOR" };
  const check = verifyProjectExport(doc, keyring);
  if (!check.ok) return { ok: false, error: check.error };
  if (check.mismatches.length > 0) return { ok: false, error: "TAMPERED" };
  if (!check.audit.valid) return { ok: false, error: "AUDIT_CHAIN_INVALID" };
  if (check.results.failed.length > 0 && !opts.skipUnverified) return { ok: false, error: "UNVERIFIED_RESULTS" };

  const d = doc as { scope: { tenantId: string; projectId: string }; audit: { rows: Record<string, unknown>[] };
    results: { row: Record<string, unknown> }[]; imports?: unknown };
  const { projectId, organizationId } = check.project;
  const scope = { tenantId: d.scope.tenantId, projectId: d.scope.projectId };
  if (!SLUG.test(scope.tenantId) || !SLUG.test(scope.projectId)) return { ok: false, error: "EMPTY_SCOPE" };
  const failed = new Set(check.results.failed.map((f) => f.index));
  const results = d.results.map((r) => r.row).filter((_, i) => !failed.has(i));
  const audit = [...d.audit.rows].sort((a, b) => Number(a.seq) - Number(b.seq));
  const imports = Array.isArray(d.imports) ? d.imports as Record<string, unknown>[] : [];
  const inScope = (r: Record<string, unknown>) => r && r.project_id === projectId && r.organization_id === organizationId;
  if (!imports.every(inScope) || !imports.every((r) => typeof r.id === "string" && UUID.test(r.id))
    || !results.every((r) => typeof r.id === "string" && UUID.test(r.id))) return { ok: false, error: "INVALID_ROWS" };

  const op = `'${opts.operatorId}'::uuid`;
  const org = `'${organizationId}'::uuid`, prj = `'${projectId}'::uuid`;
  // Creator of a row that no longer exists in this database: the operator (the column is NOT NULL).
  const actor = (j: string) => `coalesce((select u.id from auth.users u where u.id = (${j}->>'created_by')::uuid), ${op})`;
  const lines = [
    "-- Rubik restore drill. Generated from a verified export; review before running.",
    "begin;",
    "set local statement_timeout = '60s';",
    `insert into public.organizations (id, slug, name, created_by) values (${org}, '${scope.tenantId}', '${scope.tenantId}', ${op}) on conflict (id) do nothing;`,
    `insert into public.organization_members (organization_id, user_id, role) values (${org}, ${op}, 'owner') on conflict do nothing;`,
    `insert into public.projects (id, organization_id, slug, name) values (${prj}, ${org}, '${scope.projectId}', '${scope.projectId}') on conflict (id) do nothing;`,
    `insert into public.project_members (project_id, organization_id, user_id, role) values (${prj}, ${org}, ${op}, 'owner') on conflict do nothing;`,
    // In seq order, each guarded: the chain trigger runs before any ON CONFLICT check.
    ...audit.map((row) => `insert into public.audit_events select (jsonb_populate_record(null::public.audit_events, ${literal(row)})).* `
      + `where not exists (select 1 from public.audit_events e where e.project_id = ${prj} and e.seq = ${Number(row.seq)});`),
    ...results.map((row) => `with src(j) as (values (${literal(row)})) insert into public.provider_results `
      + `select (jsonb_populate_record(null::public.provider_results, j || jsonb_build_object('created_by', ${actor("j")}))).* from src `
      + `where not exists (select 1 from public.provider_results p where p.id = (j->>'id')::uuid);`),
    ...imports.map((row) => `with src(j) as (values (${literal(row)})) insert into public.imports `
      + `select (jsonb_populate_record(null::public.imports, j || jsonb_build_object('created_by', ${actor("j")}))).* from src `
      + `where not exists (select 1 from public.imports i where i.id = (j->>'id')::uuid or (i.project_id = ${prj} and i.file_sha256 = j->>'file_sha256'));`),
    "commit;",
  ];
  return {
    ok: true,
    skipped: check.results.failed,
    plan: { projectId, organizationId, scope, counts: { audit: audit.length, results: results.length, imports: imports.length, skippedUnverified: failed.size }, sql: lines.join("\n") + "\n" },
  };
}
