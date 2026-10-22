import { randomBytes, randomUUID } from "node:crypto";
import { execFileSync } from "node:child_process";
import { appendFile, mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { afterAll, expect, it } from "vitest";
import { createClient } from "@supabase/supabase-js";
import { providers } from "@/lib/core";
import { verifyAuditTrail } from "@/lib/provenance/audit";
import { loadKeyring } from "@/lib/provenance/keyring";
import { appendAudit, eraseProviderResults, loadProviderResult, readAuditTrail, storeProviderResult } from "@/lib/provenance/repository";
import { openProviderResult } from "@/lib/provenance/results";
import { processAuditOutbox } from "@/lib/provenance/outbox";
import { eraseImport, importFile, listImports, loadProjectRef } from "@/lib/imports/repository";
import { createDataApiFixtureRun, U03_PREVIEW_REF } from "../../scripts/u03-preview-data-api.mjs";
import { buildMinimalInstallSql, buildMinimalRollbackSql, ROLE } from "../../scripts/u03-window-minimal-principal.mjs";
import { env } from "./support";
import { localDatabaseContainer } from "../../scripts/supabase-test-env.mjs";
import { selectedStack } from "../../scripts/test-stacks.mjs";

const runId = randomUUID();
const functionalSha = execFileSync("git", ["rev-parse", "HEAD"], { encoding: "utf8" }).trim();
const localLedgerPath = join(process.cwd(), "test-results", "u03-i5-local", `${runId}.jsonl`);
const rolePassword = randomBytes(32).toString("base64url");
const signingSecret = randomBytes(32).toString("base64");
const loaded = loadKeyring({ PROVENANCE_SIGNING_KEYS: `u03-i5-local:${signingSecret}`, PROVENANCE_ACTIVE_KEY_ID: "u03-i5-local" });
const container = localDatabaseContainer();
const envKeys = ["RUBIK_AUDIT_DATABASE_URL", "VERCEL_ENV", "RUBIK_TEST_U03_WINDOW_STACK", "NEXT_PUBLIC_SUPABASE_URL",
  "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY", "PROVENANCE_SIGNING_KEYS", "PROVENANCE_ACTIVE_KEY_ID", "RUBIK_RECOVERY_SCHEMA_ATTESTATION"];
const originalEnv = Object.fromEntries(envKeys.map(key => [key, process.env[key]]));
const ledgerRows: Record<string, unknown>[] = [];
const phases = ["N1_PREFLIGHT", "FIXTURE_SETUP", "ROLE_INSTALL", "SIGNED_WRITES", "POPULATED_RLS",
  "RECEIPT_CLEANUP", "FIXTURE_CLEANUP", "CAPABILITY_ROLLBACK", "FINAL_READ"] as const;
let currentPhase: typeof phases[number] = "N1_PREFLIGHT";
let fixtures: ReturnType<typeof createDataApiFixtureRun> | undefined;
let roleInstalled = false;
const scopes: Record<string, { projectId: string; organizationId: string; scope: { tenantId: string; projectId: string } }> = {};
const createdImportIds: Record<string, string> = {};

function sql(statement: string) {
  try {
    return execFileSync("docker", ["exec", "-i", container, "psql", "-X", "-U", "postgres", "-d", "postgres", "-v", "ON_ERROR_STOP=1", "-v", "VERBOSITY=sqlstate", "-q", "-At"],
      { input: statement, encoding: "utf8", stdio: ["pipe", "pipe", "pipe"] }).trim();
  } catch (error) {
    const stderr = String((error as NodeJS.ErrnoException & { stderr?: Buffer }).stderr ?? "");
    const state = stderr.match(/\b(42501|23514|23505|42703|42P01|42883|28000|28P01|2BP01|42710|3F000|22023)\b/)?.[1];
    throw new Error(state ? `LOCAL_SQLSTATE_${state}` : "LOCAL_SQL_COMMAND_FAILED");
  }
}

async function record(caseId: string, status: string, detail: Record<string, unknown> = {}) {
  const allowed = new Set(["actor", "stage", "expectedCount", "observedCount", "valueMatch", "category", "code", "sqlstate", "receiptState", "count", "phase"]);
  const safe = Object.fromEntries(Object.entries(detail).filter(([key, value]) => allowed.has(key) &&
    (typeof value === "number" || typeof value === "boolean" || typeof value === "string" &&
      (/^[A-Z][A-Z0-9_]{1,79}$/.test(value) || key === "actor" && ["ownerA", "ownerB", "outsider"].includes(value) || key === "phase" && phases.includes(value as typeof phases[number])) || value === null)));
  const row = { utc: new Date().toISOString(), runId, functionalSha, transport: "postgres-direct-local", caseId, status, ...safe };
  ledgerRows.push(row);
  await appendFile(localLedgerPath, `${JSON.stringify(row)}\n`, { mode: 0o600 });
}

async function safeLocalPhase(caseId: string, status: string, code: string) {
  return record(caseId, status, { category: "LOCAL_INTEGRATION", code });
}

it("creates legitimately signed I-5 rows for A and B, proves populated RLS isolation, resolves receipts and cleans the N1 stack data", async () => {
  let primaryFailure: unknown;
  let cleanupFailure: string | undefined;
  const safeErrorCode = (error: unknown) => {
    const message = error instanceof Error ? error.message : "";
    const candidate = /^[A-Z][A-Z0-9_]{1,79}$/.test(message) ? message : "";
    const allowed = new Set(["I5_LOCAL_PROJECT_SCOPE_UNAVAILABLE", "I5_LOCAL_KEYRING_INVALID", "I5_LOCAL_AUDIT_SIGN_OR_RETRY_FAILED",
      "I5_LOCAL_AUDIT_SIGNATURE_INVALID", "I5_LOCAL_AUDIT_ROW_ABSENT", "I5_LOCAL_TAMPER_ACCEPTED", "I5_LOCAL_RESULT_STORE_FAILED",
      "I5_LOCAL_RESULT_SIGNATURE_INVALID", "I5_LOCAL_RESULT_TAMPER_ACCEPTED", "I5_LOCAL_IMPORT_FLOW_FAILED",
      "I5_LOCAL_IMPORT_POSITIVE_READ_FAILED", "I5_LOCAL_IMPORT_RECEIPT_NOT_RESOLVED", "I5_LOCAL_IMPORT_RECEIPT_RETRY_FAILED",
      "I5_LOCAL_POPULATED_ISOLATION_FAILED", "I5_LOCAL_OUTBOX_PENDING_AFTER_CLEANUP", "I5_LOCAL_RESULT_ERASE_OR_RECEIPT_FAILED",
      "I5_LOCAL_IMPORT_ERASE_OR_RECEIPT_FAILED", "FIXTURE_CLEANUP_FAILED", "IMPORT_RECEIPT_PENDING", "RESULT_RECEIPT_PENDING",
      "LOCAL_INVENTORY_OR_OUTBOX_RESIDUE", "LOCAL_INVENTORY_OR_CAPABILITY_RESIDUE", "LOCAL_SQL_COMMAND_FAILED",
      "LOCAL_SQLSTATE_42501", "LOCAL_SQLSTATE_23514", "LOCAL_SQLSTATE_23505", "LOCAL_SQLSTATE_42703",
      "LOCAL_SQLSTATE_42P01", "LOCAL_SQLSTATE_42883", "LOCAL_SQLSTATE_28000", "LOCAL_SQLSTATE_28P01",
      "LOCAL_SQLSTATE_2BP01", "LOCAL_SQLSTATE_42710", "LOCAL_SQLSTATE_3F000", "LOCAL_SQLSTATE_22023"]);
    return allowed.has(candidate) ? candidate : "OTHER_LOCAL_FAILURE";
  };
  try {
    await mkdir(join(process.cwd(), "test-results", "u03-i5-local"), { recursive: true });
    await writeFile(localLedgerPath, "", { flag: "wx", mode: 0o600 });
    expect(loaded.ok).toBe(true);
    expect(sql("select count(*)::text||'|'||max(version)::text from supabase_migrations.schema_migrations")).toBe("27|20261015210000");
    expect(sql("select (select count(*) from auth.users)::text||'|'||(select count(*) from public.organizations)::text||'|'||" +
      "(select count(*) from public.projects)::text||'|'||(select count(*) from public.audit_events)::text||'|'||" +
      "(select count(*) from public.provider_results)::text||'|'||(select count(*) from public.imports)::text||'|'||" +
      "(select count(*) from private.audit_outbox)::text||'|'||(select count(*) from private.audit_outbox where state='pending')")).toBe("0|0|0|0|0|0|0|0");
    await safeLocalPhase("n1-preflight", "PASS", "MIGRATIONS_27_EMPTY");

    // Environment identity is provisioned out of band in Preview, not by the 27 N1 migrations.
    // Model only that immutable deployment identity in this disposable local stack.
    sql("create table private.environment_identity(environment text not null, project_ref text not null); " +
      "insert into private.environment_identity values ('preview','rhnnplewqsekrnaousyl')");

    currentPhase = "FIXTURE_SETUP";
    const admin = createClient(env.apiUrl, env.secretKey, { auth: { persistSession: false, autoRefreshToken: false } });
    fixtures = createDataApiFixtureRun({ runId, sha: functionalSha, admin, publicKey: env.publishableKey, ref: U03_PREVIEW_REF,
      clientFactory: (_url, key, options) => createClient(env.apiUrl, key, options), ledger: record });
    await fixtures.createUsers();
    const organizations = await fixtures.createOrganizations();
    const projects = await fixtures.createProjects(organizations);
    for (const [actor, tenantId, projectSlug] of [["ownerA", `${fixtures.namespace}-a`, "a1"], ["ownerB", `${fixtures.namespace}-b`, "b1"]] as const) {
      const project = await loadProjectRef(fixtures.actorAccess(actor).api, { tenantId, projectId: projectSlug });
      if (!project) throw new Error("I5_LOCAL_PROJECT_SCOPE_UNAVAILABLE");
      scopes[actor] = project;
    }
    const expiry = new Date(Date.now() + 10 * 60_000).toISOString();
    currentPhase = "ROLE_INSTALL";
    sql(buildMinimalInstallSql(runId, rolePassword, expiry));
    roleInstalled = true;
    sql(`alter role ${ROLE} login valid until '${expiry}'`);
    const stackConfig = selectedStack();
    if (stackConfig.projectId !== "rubik-u03-i5-20261022") throw new Error("I5_LOCAL_STACK_IDENTITY_MISMATCH");
    const databaseUrl = new URL(`postgresql://${ROLE}:${rolePassword}@127.0.0.1:${stackConfig.dbPort}/postgres`);
    Object.assign(process.env, {
      RUBIK_AUDIT_DATABASE_URL: databaseUrl.toString(), VERCEL_ENV: "development", RUBIK_TEST_U03_WINDOW_STACK: "1",
      NEXT_PUBLIC_SUPABASE_URL: env.apiUrl, NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: env.publishableKey,
      PROVENANCE_SIGNING_KEYS: `u03-i5-local:${signingSecret}`, PROVENANCE_ACTIVE_KEY_ID: "u03-i5-local",
      RUBIK_RECOVERY_SCHEMA_ATTESTATION: "pre-n2-through-20261015210000",
    });
    await safeLocalPhase("run-scoped-writer", "PASS", "ROLE_RUN_SCOPED");

    currentPhase = "SIGNED_WRITES";
    const auditRows: Record<string, number> = {};
    const resultIds: Record<string, string> = {};
    const importIds: Record<string, string> = {};
    for (const actor of ["ownerA", "ownerB"] as const) {
      const access = fixtures.actorAccess(actor);
      const project = scopes[actor];
      const operationId = randomUUID();
      const input = { actor: { id: access.id, role: "owner" as const }, action: "u03.fixture.audit", target: runId,
        outcome: "allowed" as const, details: { runId, fixture: true } };
      const firstAudit = await appendAudit(access.api, project, input, loaded.ok ? loaded.keyring : (() => { throw new Error("I5_LOCAL_KEYRING_INVALID"); })(), { operationId });
      if (!firstAudit.ok) {
        await record("i5-audit-sign", "BLOCKED", { actor, stage: "AUDIT_APPEND_FIRST", category: "PRODUCT_RESULT", code: firstAudit.error });
        throw new Error("I5_LOCAL_AUDIT_SIGN_OR_RETRY_FAILED");
      }
      const retryAudit = await appendAudit(access.api, project, input, loaded.ok ? loaded.keyring : (() => { throw new Error("I5_LOCAL_KEYRING_INVALID"); })(), { operationId });
      if (!retryAudit.ok) {
        await record("i5-audit-sign", "BLOCKED", { actor, stage: "AUDIT_APPEND_RETRY", category: "PRODUCT_RESULT", code: retryAudit.error });
        throw new Error("I5_LOCAL_AUDIT_SIGN_OR_RETRY_FAILED");
      }
      if (firstAudit.row.seq !== retryAudit.row.seq) throw new Error("I5_LOCAL_AUDIT_SIGN_OR_RETRY_FAILED");
      auditRows[actor] = firstAudit.row.seq;
      const trail = await readAuditTrail(access.api, project, loaded.ok ? loaded.keyring : (() => { throw new Error("I5_LOCAL_KEYRING_INVALID"); })());
      if (!trail.ok || !trail.verification.valid) throw new Error("I5_LOCAL_AUDIT_SIGNATURE_INVALID");
      const tamperedTrail = structuredClone(trail.rows);
      const fixtureRow = tamperedTrail.find(row => row.seq === firstAudit.row.seq);
      if (!fixtureRow) throw new Error("I5_LOCAL_AUDIT_ROW_ABSENT");
      fixtureRow.action = "u03.tampered";
      if (verifyAuditTrail(tamperedTrail, project, loaded.ok ? loaded.keyring : (() => { throw new Error("I5_LOCAL_KEYRING_INVALID"); })()).valid)
        throw new Error("I5_LOCAL_TAMPER_ACCEPTED");

      const synthetic = await providers.runProviderRequest({ provider: "search-console", operation: "searchAnalytics",
        input: { siteUrl: "sc-domain:fixture.invalid", startDate: "2026-10-01", endDate: "2026-10-01", rowLimit: 1 },
        transport: { kind: "live", request: async () => ({ rows: [{ query: "u03 synthetic", clicks: 1, impressions: 1, ctr: 1, averagePosition: 1 }], truncated: false }) },
        clock: () => new Date("2026-10-01T00:00:00.000Z"), budget: { maxUnits: 1, maxRequests: 1 } });
      const resultOperationId = randomUUID();
      const stored = await storeProviderResult(access.api, project, synthetic, loaded.ok ? loaded.keyring : (() => { throw new Error("I5_LOCAL_KEYRING_INVALID"); })(),
        { operationId: resultOperationId });
      if (!stored.ok) throw new Error("I5_LOCAL_RESULT_STORE_FAILED");
      const loadedResult = await loadProviderResult(access.api, project, stored.id, loaded.ok ? loaded.keyring : (() => { throw new Error("I5_LOCAL_KEYRING_INVALID"); })());
      if (!loadedResult.ok || !loadedResult.verification.verified) throw new Error("I5_LOCAL_RESULT_SIGNATURE_INVALID");
      const tamperedResult = structuredClone(loadedResult.row);
      (tamperedResult as unknown as { data: unknown }).data = { tampered: true };
      if (openProviderResult(tamperedResult, project, loaded.ok ? loaded.keyring : (() => { throw new Error("I5_LOCAL_KEYRING_INVALID"); })()).verified)
        throw new Error("I5_LOCAL_RESULT_TAMPER_ACCEPTED");
      resultIds[actor] = stored.id;

      const bytes = new TextEncoder().encode(JSON.stringify({ format: "rubik-import-v1", scope: project.scope,
        source: { kind: "manual-review", label: "U03 ficticio", url: null, tool: null }, capturedAt: "2026-10-01T00:00:00.000Z",
        findings: [{ url: "https://fixture.invalid/u03", ruleId: "u03.synthetic", severity: "info", title: "Fixture U03",
          observation: "Dato ficticio", proposal: null, evidenceRef: runId, status: "open" }] }));
      const imported = await importFile(access.api, project, bytes, { id: access.id, role: "owner" }, loaded.ok ? loaded.keyring : (() => { throw new Error("I5_LOCAL_KEYRING_INVALID"); })());
      if (!imported.ok) throw new Error("I5_LOCAL_IMPORT_FLOW_FAILED");
      importIds[actor] = imported.id;
      createdImportIds[actor] = imported.id;
      const ownRows = await access.api.from("imports").select("id").eq("project_id", project.projectId).eq("id", imported.id);
      if (ownRows.error || ownRows.data?.length !== 1) throw new Error("I5_LOCAL_IMPORT_POSITIVE_READ_FAILED");
      const receipt = sql(`select count(*)::text||'|'||count(*) filter (where state='completed')::text||'|'||count(*) filter (where state='pending')::text from private.audit_outbox where project_id='${project.projectId}'::uuid and action='import.file'`);
      if (receipt !== "1|1|0") throw new Error("I5_LOCAL_IMPORT_RECEIPT_NOT_RESOLVED");
      const receiptId = sql(`select id::text from private.audit_outbox where project_id='${project.projectId}'::uuid and action='import.file' limit 1`);
      const receiptRetry = await processAuditOutbox(receiptId, loaded.ok ? loaded.keyring : (() => { throw new Error("I5_LOCAL_KEYRING_INVALID"); })());
      if (!receiptRetry.ok) throw new Error("I5_LOCAL_IMPORT_RECEIPT_RETRY_FAILED");
    }
    currentPhase = "POPULATED_RLS";
    await safeLocalPhase("legitimate-signing-and-receipts", "PASS", "SIGNATURES_VALID_RECEIPTS_IDEMPOTENT");

    const checked = await fixtures.verifyPopulatedCrossSurface({ a1: projects.a1, b1: projects.b1,
      auditSeqA: auditRows.ownerA, auditSeqB: auditRows.ownerB, resultIdA: resultIds.ownerA, resultIdB: resultIds.ownerB,
      importIdA: importIds.ownerA, importIdB: importIds.ownerB });
    if (!checked.passed || checked.checks.length !== 3) throw new Error("I5_LOCAL_POPULATED_ISOLATION_FAILED");
    expect(ledgerRows.filter(row => row.status === "ATTEMPTED" && ["OWN_READ", "CROSS_READ", "OUTSIDER_READ", "MISSING_READ"].includes(String(row.stage))).length).toBe(24);
    expect(ledgerRows.filter(row => row.status === "PASS" && row.stage === "OWN_READ" && row.observedCount === 1).length).toBe(6);
    expect(ledgerRows.filter(row => row.status === "PASS" && ["CROSS_READ", "OUTSIDER_READ"].includes(String(row.stage)) && row.observedCount === 0).length).toBe(12);
    await safeLocalPhase("i5-populated-audit-events", "PASS", "A_B_OWN_AND_CROSS_RLS_VERIFIED");

    // Resolve erase receipts using the product repositories before deleting only this run's scopes.
    for (const actor of ["ownerA", "ownerB"] as const) {
      const access = fixtures.actorAccess(actor);
      const project = scopes[actor];
      const results = await eraseProviderResults(access.api, project, { id: access.id, role: "owner" }, loaded.ok ? loaded.keyring : (() => { throw new Error("I5_LOCAL_KEYRING_INVALID"); })());
      if (!results.ok || results.erased !== 1) throw new Error("I5_LOCAL_RESULT_ERASE_OR_RECEIPT_FAILED");
      const imports = await listImports(access.api, project);
      for (const row of imports) {
        const erased = await eraseImport(access.api, project, row.id, { id: access.id, role: "owner" }, loaded.ok ? loaded.keyring : (() => { throw new Error("I5_LOCAL_KEYRING_INVALID"); })());
        if (!erased.ok || erased.erased !== 1) throw new Error("I5_LOCAL_IMPORT_ERASE_OR_RECEIPT_FAILED");
      }
      const remaining = sql(`select count(*)::text||'|'||count(*) filter (where state='pending')::text from private.audit_outbox where project_id='${project.projectId}'::uuid`);
      if (!/^\d+\|0$/.test(remaining)) throw new Error("I5_LOCAL_OUTBOX_PENDING_AFTER_CLEANUP");
    }
  } catch (error) {
    primaryFailure = error;
    await record("i5-local-case", "BLOCKED", { category: "LOCAL_INTEGRATION", phase: currentPhase, code: safeErrorCode(error) });
  } finally {
    try {
      currentPhase = "RECEIPT_CLEANUP";
      // Product receipt processing must run while the scoped signing principal is still usable.
      // If setup failed before role installation, only Auth/org/project fixtures can exist.
      if (fixtures && roleInstalled && loaded.ok) {
        for (const actor of ["ownerA", "ownerB"] as const) {
          if (!scopes[actor]) continue;
          const access = fixtures.actorAccess(actor);
          const imports = await listImports(access.api, scopes[actor]);
          for (const row of imports) {
            const erased = await eraseImport(access.api, scopes[actor], row.id, { id: access.id, role: "owner" }, loaded.keyring);
            if (!erased.ok) throw new Error("IMPORT_RECEIPT_PENDING");
          }
          const results = await eraseProviderResults(access.api, scopes[actor], { id: access.id, role: "owner" }, loaded.keyring);
          if (!results.ok) throw new Error("RESULT_RECEIPT_PENDING");
        }
      }
      currentPhase = "FIXTURE_CLEANUP";
      if (fixtures && !(await fixtures.cleanup()).ok) throw new Error("FIXTURE_CLEANUP_FAILED");
      if (roleInstalled) {
        currentPhase = "CAPABILITY_ROLLBACK";
        sql(`alter role ${ROLE} nologin; select pg_terminate_backend(pid) from pg_stat_activity where usesysid=(select oid from pg_roles where rolname='${ROLE}') and pid<>pg_backend_pid()`);
        const finalBeforeRollback = sql(`select (select count(*) from auth.users)::text||'|'||(select count(*) from public.organizations)::text||'|'||
          (select count(*) from public.projects)::text||'|'||(select count(*) from public.project_members)::text||'|'||
          (select count(*) from public.audit_events)::text||'|'||(select count(*) from public.provider_results)::text||'|'||
          (select count(*) from public.imports)::text||'|'||(select count(*) from private.audit_outbox)::text||'|'||
          (select count(*) from private.audit_outbox where state='pending')`);
        if (finalBeforeRollback !== "0|0|0|0|0|0|0|0|0") throw new Error("LOCAL_INVENTORY_OR_OUTBOX_RESIDUE");
        sql(buildMinimalRollbackSql(runId));
        roleInstalled = false;
      }
      sql("drop table if exists private.environment_identity");
      currentPhase = "FINAL_READ";
      const final = sql(`select (select count(*) from auth.users)::text||'|'||(select count(*) from public.organizations)::text||'|'||
        (select count(*) from public.projects)::text||'|'||(select count(*) from public.project_members)::text||'|'||
        (select count(*) from public.audit_events)::text||'|'||(select count(*) from public.provider_results)::text||'|'||
        (select count(*) from public.imports)::text||'|'||(select count(*) from private.audit_outbox)::text||'|'||
        (select count(*) from private.audit_outbox where state='pending')||'|'||
        (select count(*) from pg_roles where rolname='${ROLE}')::text||'|'||
        (select count(*) from pg_policy where polname like 'u03_preview_writer_%')::text||'|'||
        (select not rolcanlogin from pg_roles where rolname='rubik_audit_writer')::text`);
      if (final !== "0|0|0|0|0|0|0|0|0|0|0|true") throw new Error("LOCAL_INVENTORY_OR_CAPABILITY_RESIDUE");
      await safeLocalPhase("i5-cleanup-independent-read", "PASS", "INVENTORY_OUTBOX_ROLE_POLICIES_ZERO");
    } catch {
      cleanupFailure = "LOCAL_CLEANUP_OR_ROLLBACK_FAILED";
      if (roleInstalled) {
        try { sql(`alter role ${ROLE} nologin; select pg_terminate_backend(pid) from pg_stat_activity where usesysid=(select oid from pg_roles where rolname='${ROLE}') and pid<>pg_backend_pid()`); } catch { /* retain owned stack for reconciliation */ }
      }
      await record("i5-cleanup-independent-read", "BLOCKED", { category: "LOCAL_CLEANUP", phase: currentPhase, code: cleanupFailure });
    }
    for (const key of envKeys) {
      if (originalEnv[key] === undefined) delete process.env[key]; else process.env[key] = originalEnv[key]!;
    }
  }
  if (cleanupFailure) throw new Error(cleanupFailure);
  if (primaryFailure) throw new Error("I5_LOCAL_CASE_FAILED");
  expect(roleInstalled).toBe(false);
  expect(createdImportIds.ownerA).toBeTruthy();
  expect(createdImportIds.ownerB).toBeTruthy();
});

afterAll(async () => {
  expect(ledgerRows.length).toBeGreaterThan(0);
  const serialized = JSON.stringify(ledgerRows);
  const forbiddenLedgerContent = /@ejemplo\.test|postgresql:\/\/|(?:^|[^A-Za-z0-9_-])[A-Za-z0-9_-]{24,}\.[A-Za-z0-9_-]{24,}\.[A-Za-z0-9_-]{24,}|["'](?:access_token|signature|password|secret)["']\s*:/i;
  expect(serialized).not.toMatch(forbiddenLedgerContent);
  const text = await readFile(localLedgerPath, "utf8");
  expect(text).not.toMatch(forbiddenLedgerContent);
});
