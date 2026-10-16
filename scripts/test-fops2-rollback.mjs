// Execute the actual rollback in a local transaction, then verify ROLLBACK restores the guard.
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { localDatabaseContainer } from "./supabase-test-env.mjs";

if (process.env.RUBIK_TEST_FOPS2_COMBINED_STACK !== "1") throw new Error("Refused: select F-OPS-2 combined stack");
const name = localDatabaseContainer();
if (name !== "supabase_db_rubik-fops2-n2-combined-20261016") throw new Error("Refused: unexpected database");
const rollback = readFileSync(resolve(import.meta.dirname, "../supabase/rollbacks/20261016120000_fops2_google_capture_reservation_guard.sql"), "utf8");
const sql = `
select to_regclass('private.google_captures') is not null and exists
  (select 1 from pg_trigger where tgname = 'guard_google_capture_uncertain_retry') as before_guard;
begin;
${rollback}
select not exists (select 1 from pg_trigger where tgname = 'guard_google_capture_uncertain_retry')
  and to_regprocedure('private.guard_google_capture_uncertain_retry()') is null as removed;
rollback;
select exists (select 1 from pg_trigger where tgname = 'guard_google_capture_uncertain_retry')
  and to_regprocedure('private.guard_google_capture_uncertain_retry()') is not null as restored;
`;
const out = execFileSync("docker", ["exec", "-i", name, "psql", "-U", "postgres", "-v", "ON_ERROR_STOP=1", "-qAt"],
  { input: sql, encoding: "utf8" }).trim().split(/\r?\n/).filter(line => line === "t" || line === "f");
if (out.join("|") !== "t|t|t") throw new Error(`Rollback drill failed: ${out.join("|")}`);
console.log("PASS: actual rollback removed guard in transaction and ROLLBACK restored it (3/3)");
