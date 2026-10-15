import { appendFileSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { execSync } from "node:child_process";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "../src/lib/supabase/database.types";
import { localSupabaseEnv } from "../scripts/supabase-test-env.mjs";
import { assertFixtureEndpoint, fixtureScope } from "./fixture-scope";

type OwnedUser = { id: string; email: string };
type OwnedOrg = { id: string; slug: string; created_by: string | null };
type OwnedProject = { id: string; slug: string; organization_id: string };
export type Ledger = { run: string; users: OwnedUser[]; organizations: OwnedOrg[]; projects: OwnedProject[]; pendingEmails: string[] };
export type Snapshot = {
  users: (OwnedUser & { run?: string })[];
  organizations: OwnedOrg[]; projects: OwnedProject[];
  organizationMembers: { organization_id: string; user_id: string }[];
  projectMembers: { organization_id: string; project_id: string; user_id: string }[];
};

// Build the ENTIRE deletion plan before performing any mutation. A namespace or an email
// suffix alone never proves ownership; every id must have a successful creation receipt.
export function planCleanup(ledger: Ledger, actual: Snapshot) {
  if (!/^[a-f0-9]{32}$/.test(ledger.run)) throw new Error("Invalid ownership ledger");
  const userIds = new Set(ledger.users.map((u) => u.id));
  const orgIds = new Set(ledger.organizations.map((o) => o.id));
  const projectIds = new Set(ledger.projects.map((p) => p.id));
  const refuse = () => { throw new Error("Ambiguous E2E ownership; nothing deleted. Preserve ledger for review."); };
  if (userIds.size !== ledger.users.length || orgIds.size !== ledger.organizations.length || projectIds.size !== ledger.projects.length) refuse();
  for (const owned of ledger.users) {
    const found = actual.users.find((u) => u.id === owned.id);
    if (found && (found.email !== owned.email || found.run !== ledger.run)) refuse();
  }
  for (const email of ledger.pendingEmails) {
    if (actual.users.some((u) => u.email === email && !userIds.has(u.id))) refuse();
  }
  for (const owned of ledger.organizations) {
    const found = actual.organizations.find((o) => o.id === owned.id);
    if (!owned.created_by || !userIds.has(owned.created_by)) refuse();
    if (found && (found.slug !== owned.slug || found.created_by !== owned.created_by)) refuse();
  }
  for (const owned of ledger.projects) {
    const found = actual.projects.find((p) => p.id === owned.id);
    if (!orgIds.has(owned.organization_id)) refuse();
    if (found && (found.slug !== owned.slug || found.organization_id !== owned.organization_id)) refuse();
  }
  // Check both sides of cascading references. A foreign member or an unregistered child
  // inside our org, or our account attached to a foreign org, blocks the whole teardown.
  if (actual.organizations.some((o) => o.created_by && userIds.has(o.created_by) && !orgIds.has(o.id))) refuse();
  if (actual.projects.some((p) => orgIds.has(p.organization_id) && !projectIds.has(p.id))) refuse();
  if (actual.organizationMembers.some((m) => orgIds.has(m.organization_id) !== userIds.has(m.user_id))) refuse();
  if (actual.projectMembers.some((m) =>
    (orgIds.has(m.organization_id) || projectIds.has(m.project_id) || userIds.has(m.user_id))
    && !(orgIds.has(m.organization_id) && projectIds.has(m.project_id) && userIds.has(m.user_id)))) refuse();
  return {
    organizations: ledger.organizations.filter((o) => actual.organizations.some((a) => a.id === o.id)),
    users: ledger.users.filter((u) => actual.users.some((a) => a.id === u.id)),
  };
}

let localClients: { admin: SupabaseClient; client: () => SupabaseClient<Database> } | undefined;
export function fixtureClients() {
  if (localClients) return localClients;
  const env = localSupabaseEnv();
  assertFixtureEndpoint(env.apiUrl);
  const options = { auth: { persistSession: false, autoRefreshToken: false } };
  return localClients = { admin: createClient(env.apiUrl, env.secretKey, options), client: () => createClient<Database>(env.apiUrl, env.publishableKey, options) };
}

const ledgerPath = () => join("test-results", "e2e-fixtures", `${fixtureScope().run}.jsonl`);
type Entry = { kind: "user"; value: OwnedUser } | { kind: "organization"; value: OwnedOrg }
  | { kind: "project"; value: OwnedProject } | { kind: "pending"; value: string };
export function initializeLedger() {
  mkdirSync(join("test-results", "e2e-fixtures"), { recursive: true });
  // Never resume or adopt receipts from a previous invocation, even with the same run id.
  writeFileSync(ledgerPath(), `${JSON.stringify({ run: fixtureScope().run })}\n`, { flag: "wx", mode: 0o600 });
}
export function recordFixture(entry: Entry) {
  appendFileSync(ledgerPath(), `${JSON.stringify(entry)}\n`);
}
export function readLedger(): Ledger {
  const [header, ...entries] = readFileSync(ledgerPath(), "utf8").trim().split(/\r?\n/).map((line) => JSON.parse(line));
  if (header.run !== fixtureScope().run) throw new Error("Wrong ownership ledger");
  const ledger: Ledger = { run: header.run, users: [], organizations: [], projects: [], pendingEmails: [] };
  for (const entry of entries as Entry[]) {
    if (entry.kind === "user") ledger.users.push(entry.value);
    else if (entry.kind === "organization") ledger.organizations.push(entry.value);
    else if (entry.kind === "project") ledger.projects.push(entry.value);
    else if (entry.kind === "pending") ledger.pendingEmails.push(entry.value);
    else throw new Error("Invalid ownership receipt");
  }
  return ledger;
}

export async function fixtureSnapshot(): Promise<Snapshot> {
  const { admin } = fixtureClients();
  const users: Snapshot["users"] = [];
  for (let page = 1; ; page++) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 100 });
    if (error) throw error;
    users.push(...data.users.map((u) => ({ id: u.id, email: u.email ?? "", run: u.app_metadata.rubik_e2e_run })));
    if (data.users.length < 100) break;
  }
  // Explicit pagination: a truncated snapshot cannot safely prove cascade ownership.
  async function rows(table: string, columns: string) {
    const result: Record<string, unknown>[] = [];
    for (let start = 0; ; start += 100) {
      let query = admin.from(table).select(columns).order(columns.split(",")[0]);
      if (table.endsWith("members")) query = query.order("user_id");
      const { data, error } = await query.range(start, start + 99);
      if (error) throw error;
      result.push(...data as unknown as Record<string, unknown>[]);
      if (data.length < 100) return result;
    }
  }
  const [organizations, projects, organizationMembers, projectMembers] = await Promise.all([
    rows("organizations", "id,slug,created_by"), rows("projects", "id,slug,organization_id"),
    rows("organization_members", "organization_id,user_id"), rows("project_members", "project_id,organization_id,user_id"),
  ]);
  return { users, organizations, projects, organizationMembers, projectMembers } as Snapshot;
}

export async function cleanupFixtures() {
  const ledger = readLedger();
  fixtureClients(); // credentials are bound to the confirmed local endpoint for this process
  const plan = planCleanup(ledger, await fixtureSnapshot());
  const sql = readFileSync(join("e2e", "fixture-cleanup.sql"), "utf8")
    .replace("__LEDGER_HEX__", Buffer.from(JSON.stringify(ledger)).toString("hex"));
  const file = join("test-results", "e2e-fixtures", `${ledger.run}.cleanup.sql`);
  writeFileSync(file, sql, { mode: 0o600 });
  // Fixed local command, no remote flags, URLs or keys. SQL repeats the checks under
  // locks and deletes both roots atomically. A mismatch or lock timeout rolls it all back.
  try {
    execSync(`npx --yes supabase@2.118.0 db query --local --file "${file}"`, { stdio: "pipe", timeout: 30_000 });
  } catch (error) {
    const failed = error as { stdout?: unknown; stderr?: unknown };
    const diagnostic = `${failed.stdout ?? ""}${failed.stderr ?? ""}`;
    // Only fixed categories leave the helper; never echo database records or raw SQL.
    const reason = diagnostic.includes("Foreign E2E dependency") ? "foreign dependency"
      : diagnostic.includes("Ambiguous E2E ownership") ? "ownership changed"
      : /lock timeout/i.test(diagnostic) ? "lock contention" : "local SQL error";
    throw new Error(`Atomic E2E cleanup refused: ${reason}; preserve ledger and inspect local dependencies`);
  }
  const after = await fixtureSnapshot();
  if (planCleanup(ledger, after).users.length || planCleanup(ledger, after).organizations.length) throw new Error("E2E cleanup incomplete");
  console.log(`E2E cleanup: ${plan.users.length} owned users, ${plan.organizations.length} owned organizations; no leftovers`);
}

export async function reserveBrowserAccount(email: string) {
  if (!email.startsWith(`${fixtureScope().prefix}-`) || !email.endsWith("@ejemplo.test")) throw new Error("Account outside run namespace");
  if ((await fixtureSnapshot()).users.some((u) => u.email === email)) throw new Error("Preexisting account; refusing adoption");
  recordFixture({ kind: "pending", value: email });
}

export async function claimBrowserAccount(email: string) {
  if (!readLedger().pendingEmails.includes(email)) throw new Error("Account was not reserved by this run");
  const { admin, client } = fixtureClients();
  // Knowledge of the unique run password proves that UI signup created this account.
  // A failed/unconfirmed signup is deliberately NOT adopted by email and blocks cleanup.
  const { data, error } = await client().auth.signInWithPassword({ email, password: process.env.RUBIK_E2E_PASSPHRASE! });
  if (error || !data.user) throw new Error("Cannot prove UI account ownership");
  const tagged = await admin.auth.admin.updateUserById(data.user.id, { app_metadata: { ...data.user.app_metadata, rubik_e2e_run: fixtureScope().run } });
  if (tagged.error) throw tagged.error;
  recordFixture({ kind: "user", value: { id: data.user.id, email } });
}

export async function recordBrowserProject(slug: string) {
  const ledger = readLedger();
  const found = (await fixtureSnapshot()).projects.filter((p) => p.slug === slug && ledger.organizations.some((o) => o.id === p.organization_id));
  if (found.length !== 1 || !slug.startsWith(`${fixtureScope().prefix}-`)) throw new Error("Cannot prove UI project ownership");
  recordFixture({ kind: "project", value: found[0] });
}
