// Concurrency check for the pending-receipt delete guard (20261015201500), on the selected
// LOCAL S1 stack only, with two real PostgreSQL sessions. Fixtures are created with a unique
// prefix, receipts are completed and everything is deleted at the end (own rows only).
//   A. receipt committed while a project DELETE waits on its row → the DELETE must fail 55000.
//   B. project DELETE first, receipt insert waits on the FK → the receipt fails 23503; no
//      orphan receipt and no applied effect without a receipt.
//   C. organization cascade under scenario A → fails 55000.
import { randomBytes } from "node:crypto";
import { STACKS, selectedStack } from "./test-stacks.mjs";

const insist = (ok, why) => { if (!ok) throw new Error(why); };
const stack = selectedStack() === STACKS.claudeS1 ? STACKS.claudeS1 : STACKS.s1;
const raw = process.env.S1_LOCAL_POSTGRES_ADMIN_URL ?? "";
const url = new URL(raw);
insist(["127.0.0.1", "localhost"].includes(url.hostname) && url.port === String(stack.dbPort) && url.username === "postgres"
  && url.pathname === "/postgres" && !url.search, `Refusing any destination except the selected LOCAL S1 port ${stack.dbPort}`);

const { Client } = (await import("pg")).default ?? (await import("pg"));
const connect = async (name) => {
  const c = new Client({ connectionString: raw, ssl: false, application_name: `rubik_s1_race_${name}` });
  await c.connect();
  await c.query("set statement_timeout = '15s'");
  return c;
};
const tag = `race-${randomBytes(4).toString("hex")}`;
const user = "00000000-0000-4000-8000-" + randomBytes(6).toString("hex");
const admin = await connect("admin");
const a = await connect("a");
const b = await connect("b");
const code = (e) => (e && typeof e === "object" && "code" in e ? e.code : String(e));
const blocked = async (pid) => (await admin.query("select wait_event_type from pg_stat_activity where pid = $1", [pid])).rows[0]?.wait_event_type === "Lock";
const until = async (fn) => { for (let i = 0; i < 100; i++) { if (await fn()) return; await new Promise((r) => setTimeout(r, 50)); } throw new Error("timeout waiting for lock"); };

async function fixture(suffix) {
  const org = (await admin.query("insert into public.organizations(slug,name,created_by) values ($1,$1,$2) returning id", [`${tag}-${suffix}`, user])).rows[0].id;
  const project = (await admin.query("insert into public.projects(organization_id,slug,name) values ($1,$2,$2) returning id", [org, `${tag}-${suffix}-p`])).rows[0].id;
  return { org, project };
}
const receipt = (client, f) => client.query(
  "insert into private.audit_outbox (project_id, organization_id, actor_id, actor_role, action, target_id) values ($1,$2,$3,'owner','member.withdraw',$3)",
  [f.project, f.org, user]);

let failures = 0;
const check = (ok, label) => { console.log(`${ok ? "PASS" : "FAIL"}: ${label}`); if (!ok) failures++; };
try {
  await admin.query("insert into auth.users (id,email,aud,role,email_confirmed_at) values ($1,$2,'authenticated','authenticated',now())", [user, `${tag}@ejemplo.test`]);
  const bPid = (await b.query("select pg_backend_pid() as pid")).rows[0].pid;
  const aPid = (await a.query("select pg_backend_pid() as pid")).rows[0].pid;

  // A: receipt first (uncommitted), DELETE waits, receipt commits → DELETE refused.
  const fa = await fixture("a");
  await a.query("begin"); await receipt(a, fa);
  await b.query("begin");
  const del = b.query("delete from public.projects where id = $1", [fa.project]).then(() => "deleted", (e) => code(e));
  await until(() => blocked(bPid));
  await a.query("commit");
  const outA = await del; await b.query("rollback");
  check(outA === "55000", `A: concurrent DELETE after a committed pending receipt is refused (got ${outA})`);
  check((await admin.query("select count(*)::int n from private.audit_outbox where project_id=$1 and state='pending'", [fa.project])).rows[0].n === 1, "A: the pending receipt survives");

  // B: DELETE first (uncommitted), receipt insert waits on the FK, DELETE commits → receipt refused.
  const fb = await fixture("b");
  await b.query("begin");
  await b.query("delete from public.projects where id = $1", [fb.project]);
  await a.query("begin");
  const ins = receipt(a, fb).then(() => "inserted", (e) => code(e));
  await until(() => blocked(aPid));
  await b.query("commit");
  const outB = await ins; await a.query("rollback");
  check(outB === "23503", `B: a receipt for a project deleted concurrently fails its foreign key (got ${outB})`);
  check((await admin.query("select count(*)::int n from private.audit_outbox where project_id=$1", [fb.project])).rows[0].n === 0, "B: no orphan receipt");

  // C: organization cascade under A.
  const fc = await fixture("c");
  await a.query("begin"); await receipt(a, fc);
  await b.query("begin");
  const delOrg = b.query("delete from public.organizations where id = $1", [fc.org]).then(() => "deleted", (e) => code(e));
  await until(() => blocked(bPid));
  await a.query("commit");
  const outC = await delOrg; await b.query("rollback");
  check(outC === "55000", `C: concurrent organization cascade after a committed pending receipt is refused (got ${outC})`);
} finally {
  for (const c of [a, b]) { try { await c.query("rollback"); } catch { /* idle */ } }
  // Cleanup of this run's own rows only: complete its receipts, then delete its organizations and user.
  await admin.query("update private.audit_outbox set state='completed', event_seq=0, completed_at=now() where actor_id=$1 and state='pending'", [user]);
  await admin.query("delete from public.organizations where slug like $1", [`${tag}-%`]);
  await admin.query("delete from private.audit_outbox where actor_id=$1", [user]);
  await admin.query("delete from auth.users where id=$1", [user]);
  const left = (await admin.query("select (select count(*) from public.organizations where slug like $1)::int o, (select count(*) from private.audit_outbox where actor_id=$2)::int r", [`${tag}-%`, user])).rows[0];
  check(left.o === 0 && left.r === 0, "cleanup removed only this run's fixtures");
  await Promise.all([admin.end(), a.end(), b.end()]);
}
process.exitCode = failures ? 1 : 0;
