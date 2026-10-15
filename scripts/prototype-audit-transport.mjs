// Local-only U01 gate: direct PostgreSQL transport and transaction semantics.
import { randomBytes } from "node:crypto";
import assert from "node:assert/strict";
import pg from "pg";

const url = process.env.RUBIK_S1_LOCAL_DB_URL ?? "postgresql://postgres:postgres@127.0.0.1:56322/postgres";
const parsed = new URL(url);
if (parsed.hostname !== "127.0.0.1" || parsed.port !== "56322" || parsed.pathname !== "/postgres") {
  throw new Error("S1 prototype requires the isolated local database on 127.0.0.1:56322");
}
const suffix = `${process.pid}_${randomBytes(3).toString("hex")}`;
const role = `rubik_s1_probe_${suffix}`;
const table = `private.s1_probe_${suffix}`;
const password = randomBytes(32).toString("hex");
const admin = new pg.Pool({ connectionString: url, max: 1, connectionTimeoutMillis: 2000 });
const writerUrl = new URL(url);
writerUrl.username = role;
writerUrl.password = password;
const writer = new pg.Pool({ connectionString: writerUrl.toString(), max: 2, connectionTimeoutMillis: 2000, idleTimeoutMillis: 1000 });
let created = false;
let writes = 0;

try {
  await admin.query(`create role ${role} login password '${password}' nobypassrls nocreaterole nocreatedb noinherit`);
  created = true;
  await admin.query(`create table ${table} (id text primary key)`);
  await admin.query(`alter table ${table} enable row level security`);
  await admin.query(`create policy s1_probe on ${table} to ${role} using (true) with check (true)`);
  await admin.query(`grant usage on schema private to ${role}`);
  await admin.query(`grant select, insert on ${table} to ${role}`);

  const flags = await admin.query("select rolbypassrls, rolcreaterole, rolcreatedb, rolsuper from pg_roles where rolname = $1", [role]);
  assert.deepEqual(flags.rows[0], { rolbypassrls: false, rolcreaterole: false, rolcreatedb: false, rolsuper: false });
  const a = await writer.connect();
  const firstPid = (await a.query("select pg_backend_pid() as pid")).rows[0].pid;
  await a.query("begin");
  await a.query(`insert into ${table} values ($1)`, ["commit"]);
  await a.query("commit");
  writes++;
  await a.query("begin");
  await a.query(`insert into ${table} values ($1)`, ["rollback"]);
  await a.query("rollback");
  assert.equal((await a.query(`select count(*)::int as n from ${table}`)).rows[0].n, 1);
  a.release();

  const reused = await writer.connect();
  assert.equal((await reused.query("select pg_backend_pid() as pid")).rows[0].pid, firstPid);
  await reused.query("begin");
  await reused.query("set local statement_timeout = '40ms'");
  await assert.rejects(reused.query("select pg_sleep(0.2)"), (error) => error.code === "57014");
  await reused.query("rollback");
  assert.equal((await reused.query("select current_setting('statement_timeout') as timeout")).rows[0].timeout, "0");
  reused.release();

  const lost = await writer.connect();
  const lostPid = (await lost.query("select pg_backend_pid() as pid")).rows[0].pid;
  await lost.query("begin");
  await lost.query(`insert into ${table} values ($1)`, ["lost"]);
  await admin.query("select pg_terminate_backend($1)", [lostPid]);
  await assert.rejects(lost.query("commit"));
  lost.release(true);
  const next = await writer.connect();
  assert.equal((await next.query(`select count(*)::int as n from ${table}`)).rows[0].n, 1);
  next.release();

  await admin.query(`revoke insert on ${table} from ${role}`);
  const revoked = await writer.connect();
  await assert.rejects(revoked.query(`insert into ${table} values ('revoked')`), (error) => error.code === "42501");
  revoked.release();
  console.log(`S1 local transport gate PASS: role flags, commit, rollback, pool reuse, timeout, connection loss, revoked INSERT (${writes} committed)`);
} finally {
  await writer.end();
  if (created) {
    await admin.query(`drop table if exists ${table}`);
    await admin.query(`revoke usage on schema private from ${role}`);
    await admin.query(`drop role if exists ${role}`);
  }
  await admin.end();
}
