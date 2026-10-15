// S2 rehearsal only. Uses the real rollback and migration in ONE rolled-back transaction.
// Requires the dedicated local stack; never touches the shared/hosted database.
import { execSync } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { localDatabaseContainer, SUPABASE_CLI } from "./supabase-test-env.mjs";

if (process.env.RUBIK_TEST_ISOLATED_STACK !== "1") throw new Error("Rollback rehearsal requires the isolated local stack");
localDatabaseContainer();
const migration = readFileSync("supabase/migrations/20261015115750_membership_consent.sql", "utf8");
const rollback = readFileSync("supabase/rollbacks/20261015115750_membership_consent.sql", "utf8");
if (!/^begin;$/m.test(rollback) || !/^commit;$/m.test(rollback)) throw new Error("Unexpected rollback transaction wrapper");
const body = rollback.replace(/^begin;\r?$/m, "").replace(/^commit;\r?$/m, "");
const sql = `begin;
create extension if not exists pgtap with schema extensions;
select plan(10);
${body}
select ok(has_column_privilege('authenticated','public.organization_members','user_id','INSERT'), 'rollback restores org column INSERT');
select ok(has_column_privilege('authenticated','public.project_members','user_id','INSERT'), 'rollback restores project column INSERT');
select is((select count(*)::int from pg_policies where schemaname='public' and tablename in ('organization_members','project_members') and cmd='INSERT'),2,'rollback restores the two policies');
insert into auth.users(id,email,aud,role) values
 ('00000000-0000-4000-8000-00000000ee01','rollback-owner@example.test','authenticated','authenticated'),
 ('00000000-0000-4000-8000-00000000ee02','rollback-member@example.test','authenticated','authenticated');
select set_config('role','authenticated',true);
select set_config('request.jwt.claims','{"sub":"00000000-0000-4000-8000-00000000ee01","role":"authenticated"}',true);
insert into public.organizations(slug,name) values('s2-rollback-check','Rollback only');
insert into public.projects(organization_id,slug,name) select id,'rollback-project','Rollback only' from public.organizations where slug='s2-rollback-check';
select lives_ok($$insert into public.organization_members(organization_id,user_id,role) select id,'00000000-0000-4000-8000-00000000ee02','member' from public.organizations where slug='s2-rollback-check'$$,'rollback restores former direct org enrollment');
select lives_ok($$insert into public.project_members(project_id,organization_id,user_id,role) select id,organization_id,'00000000-0000-4000-8000-00000000ee02','analyst' from public.projects where slug='rollback-project'$$,'rollback restores former direct project enrollment');
select set_config('role','postgres',true);
${migration}
select ok(not has_any_column_privilege('authenticated','public.organization_members','INSERT'),'reapply removes org INSERT');
select ok(not has_any_column_privilege('authenticated','public.project_members','INSERT'),'reapply removes project INSERT');
select is((select count(*)::int from pg_policies where schemaname='public' and tablename in ('organization_members','project_members') and cmd='INSERT'),0,'reapply removes enrollment policies');
select set_config('role','authenticated',true);
select throws_ok($$insert into public.organization_members(organization_id,user_id,role) select id,'00000000-0000-4000-8000-00000000ee02','member' from public.organizations where slug='s2-rollback-check'$$,'42501',null,'reapply denies org INSERT');
select throws_ok($$insert into public.project_members(project_id,organization_id,user_id,role) select id,organization_id,'00000000-0000-4000-8000-00000000ee02','analyst' from public.projects where slug='rollback-project'$$,'42501',null,'reapply denies project INSERT');
select * from finish();
rollback;
`;
mkdirSync("test-results", { recursive: true });
const path = resolve("test-results/s2-rollback.test.sql");
writeFileSync(path, sql);
execSync(`${SUPABASE_CLI} test db --local "${path}"`, { stdio: "inherit" });
