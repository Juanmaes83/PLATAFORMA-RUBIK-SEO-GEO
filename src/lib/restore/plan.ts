import "server-only";
import { randomBytes } from "node:crypto";
import type { Keyring } from "@/lib/provenance/keyring";
import { verifyProjectExport } from "@/lib/recovery/verify-export";
import { checkGoogleState, googleSql } from "./google";

// Restore drill (Entrega E2, docs/RECUPERACION-ENSAYO.md). Turns a VERIFIED project export into
// one SQL transaction that an operator runs with psql against a database they control (the
// drill: a disposable local stack). It never connects anywhere, never re-signs and never
// changes a stored value: rows keep their ids, UUIDs, hashes and signatures, so the same
// keyring verifies them after the restore exactly as before.
//
// Fail closed, twice:
// - here, before any SQL exists: a tampered file, a broken audit chain or a result whose
//   signature does not verify refuses the plan (unless the operator explicitly skips
//   unverified results, which are reported and never restored);
// - in the database, before anything is written: an organization, project, audit event,
//   result or import that already exists with other content (or another owner project, slug
//   or file) aborts the WHOLE transaction with a readable message. A row that exists and
//   matches is left as is, so a partial or repeated restore only adds what is missing.
//
// Memberships of existing organizations and projects are never touched. The file has no
// organization or project rows (only ids and slugs): a missing organization is created with
// the operator as its owner (the tenancy trigger does that), a missing project is created in
// its organization, and the operator becomes its owner only if they already own that
// organization, as in the app.

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const SLUG = /^[a-z0-9][a-z0-9-]{1,62}$/;

export type RestoreRefusal =
  | "NOT_AN_EXPORT" | "UNSUPPORTED_FORMAT" | "MIXED_PROJECTS" | "EMPTY_SCOPE"
  | "TAMPERED" | "AUDIT_CHAIN_INVALID" | "UNVERIFIED_RESULTS" | "INVALID_OPERATOR" | "INVALID_ROWS" | "GOOGLE_STATE_MISMATCH";

export interface RestorePlan {
  projectId: string;
  organizationId: string;
  scope: { tenantId: string; projectId: string };
  counts: { audit: number; results: number; imports: number; skippedUnverified: number;
    /** Google state (operations.google): null when the export has none (older file) or could not read it. */
    google: { connections: number; bindings: number; captures: number; skippedCaptures: number } | null };
  /** One transaction: adds only what is missing, or changes nothing at all on a conflict. */
  sql: string;
}

/** Message prefix of every conflict raised by the generated SQL (SQLSTATE P0001). */
export const RESTORE_CONFLICT = "Restauración rechazada";

const literal = (value: unknown) => {
  const json = JSON.stringify(value);
  // A fresh dollar-quote tag that cannot occur in the payload, so nothing can close it early.
  let tag: string;
  do tag = `$rubik_${randomBytes(6).toString("hex")}$`; while (json.includes(tag));
  return `${tag}${json}${tag}::jsonb`;
};

// Columns compared when a row already exists. Everything stored except `created_by` (replaced
// by the operator when its author no longer exists here) and, for audit events, `created_at`
// (the chain trigger sets it at insert time; it is not signed, `at` is).
const AUDIT_COLS = ["organization_id", "at", "actor_role", "actor_id", "action", "target", "outcome", "details", "prev_hash", "hash", "key_id", "signature"];
const RESULT_COLS = ["project_id", "organization_id", "provider", "operation", "status", "captured_at", "signed_payload", "data", "data_hash_alg", "data_hash", "key_id", "signature", "created_at"];
const IMPORT_COLS = ["project_id", "organization_id", "format", "source_kind", "source_label", "source_url", "source_tool", "captured_at",
  "period_start", "period_end", "status", "finding_count", "error_count", "findings", "errors", "file_sha256", "file_bytes", "created_at"];
const differs = (a: string, b: string, cols: string[]) => `(${cols.map((c) => `${a}.${c}`).join(", ")}) is distinct from (${cols.map((c) => `${b}.${c}`).join(", ")})`;
const fail = (message: string, from: string) => `select pg_temp.rubik_restore_fail(${message}) ${from} limit 1;`;

export function planRestore(doc: unknown, keyring: Keyring, opts: { operatorId: string; skipUnverified?: boolean }):
  { ok: true; plan: RestorePlan; skipped: { index: number; reason: string | null }[] } | { ok: false; error: RestoreRefusal } {
  if (!UUID.test(opts.operatorId)) return { ok: false, error: "INVALID_OPERATOR" };
  const check = verifyProjectExport(doc, keyring);
  if (!check.ok) return { ok: false, error: check.error };
  if (check.mismatches.length > 0) return { ok: false, error: "TAMPERED" };
  if (!check.audit.valid) return { ok: false, error: "AUDIT_CHAIN_INVALID" };
  if (check.results.failed.length > 0 && !opts.skipUnverified) return { ok: false, error: "UNVERIFIED_RESULTS" };

  const d = doc as { scope: { tenantId: string; projectId: string }; audit: { rows: Record<string, unknown>[] };
    results: { row: Record<string, unknown> }[]; imports?: unknown; operations?: { google?: unknown } };
  const { projectId, organizationId } = check.project;
  const scope = { tenantId: d.scope.tenantId, projectId: d.scope.projectId };
  if (!SLUG.test(scope.tenantId) || !SLUG.test(scope.projectId)) return { ok: false, error: "EMPTY_SCOPE" };
  const failed = new Set(check.results.failed.map((f) => f.index));
  const results = d.results.map((r) => r.row).filter((_, i) => !failed.has(i));
  const audit = [...d.audit.rows].sort((a, b) => Number(a.seq) - Number(b.seq));
  if (d.imports !== undefined && !Array.isArray(d.imports)) return { ok: false, error: "INVALID_ROWS" };
  const imports = (d.imports ?? []) as Record<string, unknown>[];
  const inScope = (r: Record<string, unknown>) => !!r && typeof r === "object" && r.project_id === projectId && r.organization_id === organizationId;
  const hasId = (r: Record<string, unknown>) => typeof r.id === "string" && UUID.test(r.id);
  const unique = (values: unknown[]) => new Set(values).size === values.length;
  if (![...audit, ...results, ...imports].every(inScope) || !results.every(hasId) || !imports.every(hasId)
    || !imports.every((r) => typeof r.file_sha256 === "string" && /^[0-9a-f]{64}$/.test(r.file_sha256))
    || !audit.every((r) => Number.isInteger(r.seq)) || !unique(audit.map((r) => r.seq))
    || !unique(results.map((r) => r.id)) || !unique(imports.map((r) => r.id)) || !unique(imports.map((r) => r.file_sha256))) {
    return { ok: false, error: "INVALID_ROWS" };
  }
  const skippedIds = new Set(d.results.filter((_, i) => failed.has(i)).map((r) => r.row?.id as string));
  const google = checkGoogleState(d.operations?.google, { projectId, organizationId }, results, skippedIds);
  if (!google.ok) return { ok: false, error: "GOOGLE_STATE_MISMATCH" };

  const op = `'${opts.operatorId}'::uuid`;
  const org = `'${organizationId}'::uuid`, prj = `'${projectId}'::uuid`;
  const orgSlug = `'${scope.tenantId}'`, prjSlug = `'${scope.projectId}'`;
  const msg = (text: string, ...args: string[]) => `format('${RESTORE_CONFLICT}: ${text}'${args.map((a) => `, ${a}`).join("")})`;
  const g = google.state ? googleSql(google.state, { literal, op, prj, fail, msg, differs }) : { load: [], checks: [], setup: [], captures: [] };
  const lines = [
    "-- Rubik restore drill. Generated from a verified export; review before running with psql.",
    "-- Adds only what is missing. Any conflict aborts the whole transaction: nothing is written.",
    "\\set ON_ERROR_STOP on",
    "begin;",
    "set local statement_timeout = '60s';",
    "create function pg_temp.rubik_restore_fail(msg text) returns void language plpgsql as $f$ begin raise exception using message = msg, errcode = 'P0001'; end $f$;",

    "-- 1 · Who operates and where: checked before any write.",
    fail(msg("el operador %s no existe en auth.users.", `${op}::text`), `where not exists (select 1 from auth.users u where u.id = ${op})`),
    fail(msg("la organización %s ya existe con el slug %s, no %s.", `o.id::text`, `o.slug`, orgSlug), `from public.organizations o where o.id = ${org} and o.slug <> ${orgSlug}`),
    fail(msg("el slug de organización %s ya pertenece a otra organización (%s).", orgSlug, `o.id::text`), `from public.organizations o where o.slug = ${orgSlug} and o.id <> ${org}`),
    fail(msg("el proyecto %s ya existe en otra organización o con otro slug (%s/%s).", `p.id::text`, `p.organization_id::text`, `p.slug`),
      `from public.projects p where p.id = ${prj} and (p.organization_id <> ${org} or p.slug <> ${prjSlug})`),
    fail(msg("el slug de proyecto %s ya pertenece a otro proyecto (%s) de la organización.", prjSlug, `p.id::text`),
      `from public.projects p where p.organization_id = ${org} and p.slug = ${prjSlug} and p.id <> ${prj}`),

    "-- 2 · The export's rows, typed by the destination tables.",
    `create temp table rubik_audit on commit drop as select * from jsonb_populate_recordset(null::public.audit_events, ${literal(audit)});`,
    `create temp table rubik_results on commit drop as select * from jsonb_populate_recordset(null::public.provider_results, ${literal(results)});`,
    `create temp table rubik_imports on commit drop as select * from jsonb_populate_recordset(null::public.imports, ${literal(imports)});`,
    // Author of a row who no longer exists in this database: the operator (NOT NULL, not signed).
    `update rubik_results r set created_by = ${op} where not exists (select 1 from auth.users u where u.id = r.created_by);`,
    `update rubik_imports i set created_by = ${op} where not exists (select 1 from auth.users u where u.id = i.created_by);`,
    ...g.load,

    "-- 3 · Rows that already exist must be identical; otherwise nothing is restored.",
    fail(msg("el evento de auditoría %s del proyecto ya existe con otro contenido.", "a.seq::text"),
      `from rubik_audit a join public.audit_events e on e.project_id = a.project_id and e.seq = a.seq where ${differs("e", "a", AUDIT_COLS)} order by a.seq`),
    fail(msg("el resultado %s ya existe en otro proyecto.", "r.id::text"),
      `from rubik_results r join public.provider_results p on p.id = r.id where p.project_id <> r.project_id or p.organization_id <> r.organization_id`),
    fail(msg("el resultado %s ya existe con otro contenido.", "r.id::text"),
      `from rubik_results r join public.provider_results p on p.id = r.id where ${differs("p", "r", RESULT_COLS)}`),
    fail(msg("la importación %s ya existe en otro proyecto.", "s.id::text"),
      `from rubik_imports s join public.imports i on i.id = s.id where i.project_id <> s.project_id or i.organization_id <> s.organization_id`),
    fail(msg("la importación %s ya existe con otro contenido.", "s.id::text"),
      `from rubik_imports s join public.imports i on i.id = s.id where ${differs("i", "s", IMPORT_COLS)}`),
    fail(msg("el archivo %s ya está importado en el proyecto con otro id (%s, no %s).", "s.file_sha256", "i.id::text", "s.id::text"),
      `from rubik_imports s join public.imports i on i.project_id = s.project_id and i.file_sha256 = s.file_sha256 where i.id <> s.id`),
    ...g.checks,

    "-- 4 · Create only what is missing. Existing memberships and roles are never touched.",
    `create temp table rubik_restore_state on commit drop as select not exists (select 1 from public.organizations where id = ${org}) as new_org, `
      + `not exists (select 1 from public.projects where id = ${prj}) as new_project;`,
    // The tenancy trigger makes created_by (the operator) the owner of a NEW organization only.
    `insert into public.organizations (id, slug, name, created_by) select ${org}, ${orgSlug}, ${orgSlug}, ${op} from rubik_restore_state where new_org;`,
    `insert into public.projects (id, organization_id, slug, name) select ${prj}, ${org}, ${prjSlug}, ${prjSlug} from rubik_restore_state where new_project;`,
    `insert into public.project_members (project_id, organization_id, user_id, role) select ${prj}, ${org}, ${op}, 'owner' from rubik_restore_state `
      + `where new_project and exists (select 1 from public.organization_members m where m.organization_id = ${org} and m.user_id = ${op} and m.role = 'owner');`,
    ...g.setup,
    // In seq order, one row at a time: the chain trigger checks each link against the previous.
    "do $rubik_chain$ declare r public.audit_events; begin",
    "  for r in select * from rubik_audit a where not exists (select 1 from public.audit_events e where e.project_id = a.project_id and e.seq = a.seq) order by a.seq loop",
    "    insert into public.audit_events values (r.*);",
    "  end loop;",
    "end $rubik_chain$;",
    "insert into public.provider_results select * from rubik_results r where not exists (select 1 from public.provider_results p where p.id = r.id);",
    "insert into public.imports select * from rubik_imports s where not exists (select 1 from public.imports i where i.id = s.id);",
    // Capture records point at results, so they go last.
    ...g.captures,
    "commit;",
  ];
  return {
    ok: true,
    skipped: check.results.failed,
    plan: { projectId, organizationId, scope, counts: { audit: audit.length, results: results.length, imports: imports.length, skippedUnverified: failed.size,
      google: google.state ? { connections: google.state.connections.length, bindings: google.state.bindings.length, captures: google.state.captures.length, skippedCaptures: google.skippedCaptures } : null }, sql: lines.join("\n") + "\n" },
  };
}
