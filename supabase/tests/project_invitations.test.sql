-- Project invitations (migration 20261012090000, ADR 0020): organization owners only, token returned once and
-- stored hashed, bound to a confirmed address, single use, revocable, expiring, no cross-project use.
begin;
create extension if not exists pgtap with schema extensions;
select no_plan();
insert into auth.users(id,email,aud,role,email_confirmed_at) values
 ('00000000-0000-4000-8000-0000000000c1','inv-owner@example.test','authenticated','authenticated',now()),
 ('00000000-0000-4000-8000-0000000000c2','inv-other@example.test','authenticated','authenticated',now()),
 ('00000000-0000-4000-8000-0000000000c3','Inv-Guest@Example.test','authenticated','authenticated',now()),
 ('00000000-0000-4000-8000-0000000000c4','inv-unconfirmed@example.test','authenticated','authenticated',null),
 ('00000000-0000-4000-8000-0000000000c5','inv-analyst@example.test','authenticated','authenticated',now());
create function pg_temp.act_as(uid uuid) returns void language sql as $$
 select set_config('role','authenticated',true),
 set_config('request.jwt.claims',json_build_object('sub',uid,'role','authenticated')::text,true);
$$;
select pg_temp.act_as('00000000-0000-4000-8000-0000000000c1');
insert into public.organizations(slug,name) values('inv-a','A');
insert into public.projects(organization_id,slug,name)
 select id,s,s from public.organizations, (values ('inv-p1'),('inv-p2')) v(s) where slug='inv-a';
select pg_temp.act_as('00000000-0000-4000-8000-0000000000c2');
insert into public.organizations(slug,name) values('inv-b','B');
insert into public.projects(organization_id,slug,name) select id,'inv-q1','q1' from public.organizations where slug='inv-b';
select set_config('role','postgres',true);
-- A project owner who is NOT an organization owner cannot invite.
insert into public.organization_members(organization_id,user_id,role) select id,'00000000-0000-4000-8000-0000000000c5','member' from public.organizations where slug='inv-a';
insert into public.project_members(project_id,organization_id,user_id,role)
 select id,organization_id,'00000000-0000-4000-8000-0000000000c5','owner' from public.projects where slug='inv-p1';
create temp table ids as select slug,id project_id from public.projects where slug like 'inv-%';
grant select on ids to authenticated;
create temp table k(name text primary key, v text);
grant all on k to authenticated;
create function pg_temp.pid(s text) returns uuid language sql as $$ select project_id from ids where slug=s $$;
create function pg_temp.kv(s text) returns text language sql as $$ select v from k where name=s $$;
create function pg_temp.i(s text, cmd text, payload jsonb default '{}') returns jsonb language sql as $$
 select public.project_invitations(pg_temp.pid(s),cmd,payload) $$;

-- Structure and privileges
select ok((select relrowsecurity from pg_class where oid='private.project_invitations'::regclass),'invitations have RLS');
select ok(not has_table_privilege('authenticated','private.project_invitations','select,insert,update,delete'),'no direct access');
select ok(not has_function_privilege('anon','public.project_invitations(uuid,text,jsonb)','execute'),'anon cannot manage');
select ok(not has_function_privilege('anon','public.accept_project_invitation(text)','execute'),'anon cannot accept');

-- Who can manage
select pg_temp.act_as('00000000-0000-4000-8000-0000000000c5');
select throws_ok($$select pg_temp.i('inv-p1','list')$$,'42501',null,'project owner without org ownership refused');
select pg_temp.act_as('00000000-0000-4000-8000-0000000000c2');
select throws_ok($$select pg_temp.i('inv-p1','list')$$,'42501',null,'owner of another organization refused');
select throws_ok($$select public.project_invitations('00000000-0000-4000-8000-00000000dead','list','{}')$$,'42501',null,'unknown project refused like a foreign one');

select pg_temp.act_as('00000000-0000-4000-8000-0000000000c1');
select is(pg_temp.i('inv-p1','list'),'[]'::jsonb,'empty list');
select throws_ok($$select pg_temp.i('inv-p1','delete')$$,'22023',null,'unknown command refused');
select throws_ok($$select pg_temp.i('inv-p1','create','{"email":"no-at","role":"analyst"}')$$,'22023',null,'malformed email refused');
select throws_ok($$select pg_temp.i('inv-p1','create','{"email":"x@example.test","role":"owner"}')$$,'22023',null,'owner role cannot be invited');

insert into k select 'guest', pg_temp.i('inv-p1','create','{"email":"inv-guest@EXAMPLE.test","role":"analyst"}')->>'token';
select matches(pg_temp.kv('guest'),'^[0-9a-f]{64}$','token returned once, 64 hex');
select set_config('role','postgres',true);
select is((select email from private.project_invitations where project_id=pg_temp.pid('inv-p1')),'inv-guest@example.test','email stored lower-case');
select is((select token_hash from private.project_invitations where project_id=pg_temp.pid('inv-p1')),encode(sha256(convert_to(pg_temp.kv('guest'),'UTF8')),'hex'),'only the hash is stored');
select ok(not exists(select 1 from private.project_invitations where token_hash=pg_temp.kv('guest')),'plain token not stored');
select pg_temp.act_as('00000000-0000-4000-8000-0000000000c1');
select throws_ok($$select pg_temp.i('inv-p1','create','{"email":"inv-guest@example.test","role":"viewer"}')$$,'23505',null,'one open invitation per address');
select is(jsonb_array_length(pg_temp.i('inv-p1','list')),1,'listed');
select ok(not (pg_temp.i('inv-p1','list')->0 ? 'token') and not (pg_temp.i('inv-p1','list')->0 ? 'tokenHash'),'list never exposes the token or hash');
select is(pg_temp.i('inv-p1','list')->0->>'state','OPEN','state OPEN');

-- Accepting
select pg_temp.act_as('00000000-0000-4000-8000-0000000000c2');
select throws_ok(format('select public.accept_project_invitation(%L)',pg_temp.kv('guest')),'P0002','Invalid invitation','other address cannot use it');
select throws_ok($$select public.accept_project_invitation('not-a-token')$$,'P0002','Invalid invitation','malformed token same error');
select throws_ok($$select public.accept_project_invitation(repeat('a',64))$$,'P0002','Invalid invitation','unknown token same error');
select set_config('role','postgres',true);
select set_config('request.jwt.claims','{}',true);
select pg_temp.act_as('00000000-0000-4000-8000-0000000000c3');
select is(public.accept_project_invitation(pg_temp.kv('guest')),'{"role":"analyst","tenantId":"inv-a","projectId":"inv-p1"}'::jsonb,'invited address (any case) accepts');
select set_config('role','postgres',true);
select is((select role from public.project_members where user_id='00000000-0000-4000-8000-0000000000c3' and project_id=pg_temp.pid('inv-p1')),'analyst','project role granted');
select is((select role from public.organization_members m join public.organizations o on o.id=m.organization_id where o.slug='inv-a' and user_id='00000000-0000-4000-8000-0000000000c3'),'member','organization membership is member');
select ok(not exists(select 1 from public.project_members where user_id='00000000-0000-4000-8000-0000000000c3' and project_id=pg_temp.pid('inv-p2')),'no access to other projects of the organization');
select pg_temp.act_as('00000000-0000-4000-8000-0000000000c3');
select throws_ok(format('select public.accept_project_invitation(%L)',pg_temp.kv('guest')),'P0002',null,'single use');
select throws_ok($$select pg_temp.i('inv-p1','list')$$,'42501',null,'invited analyst cannot manage invitations');
select pg_temp.act_as('00000000-0000-4000-8000-0000000000c1');
select is(pg_temp.i('inv-p1','list')->0->>'state','ACCEPTED','state ACCEPTED');

-- Already a member: a second invitation to the same address and project cannot change the role
insert into k select 'again', pg_temp.i('inv-p1','create','{"email":"inv-guest@example.test","role":"viewer"}')->>'token';
select pg_temp.act_as('00000000-0000-4000-8000-0000000000c3');
select throws_ok(format('select public.accept_project_invitation(%L)',pg_temp.kv('again')),'23505',null,'existing member refused');
select set_config('role','postgres',true);
select is((select role from public.project_members where user_id='00000000-0000-4000-8000-0000000000c3' and project_id=pg_temp.pid('inv-p1')),'analyst','role unchanged');

-- Unconfirmed addresses, revocation and expiry
select pg_temp.act_as('00000000-0000-4000-8000-0000000000c1');
insert into k select 'unconf', pg_temp.i('inv-p2','create','{"email":"inv-unconfirmed@example.test","role":"viewer"}')->>'token';
select pg_temp.act_as('00000000-0000-4000-8000-0000000000c4');
select throws_ok(format('select public.accept_project_invitation(%L)',pg_temp.kv('unconf')),'P0002',null,'unconfirmed address refused');
select pg_temp.act_as('00000000-0000-4000-8000-0000000000c1');
insert into k select 'unconf-id', (select v->>'invitationId' from jsonb_array_elements(pg_temp.i('inv-p2','list')) v where v->>'email'='inv-unconfirmed@example.test');
select is(pg_temp.i('inv-p2','revoke',jsonb_build_object('invitationId',pg_temp.kv('unconf-id')))->>'invitationId',pg_temp.kv('unconf-id'),'owner revokes');
select throws_ok(format($$select pg_temp.i('inv-p2','revoke',jsonb_build_object('invitationId',%L))$$,pg_temp.kv('unconf-id')),'22023',null,'revoke once');
select throws_ok(format($$select pg_temp.i('inv-p1','revoke',jsonb_build_object('invitationId',%L))$$,pg_temp.kv('unconf-id')),'22023',null,'cannot revoke through another project');
select set_config('role','postgres',true);
update auth.users set email_confirmed_at=now() where id='00000000-0000-4000-8000-0000000000c4';
select pg_temp.act_as('00000000-0000-4000-8000-0000000000c4');
select throws_ok(format('select public.accept_project_invitation(%L)',pg_temp.kv('unconf')),'P0002',null,'revoked invitation refused');

select pg_temp.act_as('00000000-0000-4000-8000-0000000000c1');
insert into k select 'late', pg_temp.i('inv-p2','create','{"email":"inv-unconfirmed@example.test","role":"viewer"}')->>'token';
select set_config('role','postgres',true);
update private.project_invitations set created_at=now()-interval '8 days', expires_at=now()-interval '1 day' where token_hash=encode(sha256(convert_to(pg_temp.kv('late'),'UTF8')),'hex');
select pg_temp.act_as('00000000-0000-4000-8000-0000000000c4');
select throws_ok(format('select public.accept_project_invitation(%L)',pg_temp.kv('late')),'P0002',null,'expired invitation refused');
select pg_temp.act_as('00000000-0000-4000-8000-0000000000c1');
select is((select v->>'state' from jsonb_array_elements(pg_temp.i('inv-p2','list')) v where v->>'role'='viewer' order by v->>'createdAt' limit 1),'EXPIRED','state EXPIRED');
select lives_ok($$select pg_temp.i('inv-p2','create','{"email":"inv-unconfirmed@example.test","role":"viewer"}')$$,'an expired invitation no longer blocks a new one');

-- Privilege escalation: accepting never grants or changes organization ownership
select pg_temp.act_as('00000000-0000-4000-8000-0000000000c1');
select throws_ok($$select pg_temp.i('inv-p1','create','{"email":"x@example.test","role":"OWNER"}')$$,'22023',null,'role is case-sensitive: OWNER refused');
select throws_ok($$select pg_temp.i('inv-p1','create','{"email":"x@example.test","role":"admin"}')$$,'22023',null,'unknown role refused');
insert into k select 'other-owner', pg_temp.i('inv-p2','create','{"email":"inv-other@example.test","role":"analyst"}')->>'token';
select pg_temp.act_as('00000000-0000-4000-8000-0000000000c2');
select ok((public.accept_project_invitation(pg_temp.kv('other-owner'))->>'role')='analyst','owner of another organization joins only with the invited role');
select set_config('role','postgres',true);
select is((select m.role from public.organization_members m join public.organizations o on o.id=m.organization_id where o.slug='inv-a' and m.user_id='00000000-0000-4000-8000-0000000000c2'),'member','becomes member, never owner, of the inviting organization');
select is((select m.role from public.organization_members m join public.organizations o on o.id=m.organization_id where o.slug='inv-b' and m.user_id='00000000-0000-4000-8000-0000000000c2'),'owner','own organization role unchanged');
select ok(not exists(select 1 from public.project_members where user_id='00000000-0000-4000-8000-0000000000c2' and project_id=pg_temp.pid('inv-p1')),'no access to the other project of the inviting organization');
select pg_temp.act_as('00000000-0000-4000-8000-0000000000c2');
select throws_ok($$select pg_temp.i('inv-p2','list')$$,'42501',null,'a joined member cannot manage invitations');
select set_config('role','postgres',true);
-- An existing organization member who accepts keeps the organization role it already had
select pg_temp.act_as('00000000-0000-4000-8000-0000000000c1');
insert into k select 'member-again', pg_temp.i('inv-p2','create','{"email":"inv-analyst@example.test","role":"viewer"}')->>'token';
select pg_temp.act_as('00000000-0000-4000-8000-0000000000c5');
select ok((public.accept_project_invitation(pg_temp.kv('member-again'))->>'role')='viewer','existing organization member joins a second project');
select set_config('role','postgres',true);
select is((select role from public.project_members where user_id='00000000-0000-4000-8000-0000000000c5' and project_id=pg_temp.pid('inv-p1')),'owner','role in the first project unchanged');
select is((select m.role from public.organization_members m join public.organizations o on o.id=m.organization_id where o.slug='inv-a' and m.user_id='00000000-0000-4000-8000-0000000000c5'),'member','organization role unchanged');

-- Anonymous sessions
select set_config('role','postgres',true);
select set_config('request.jwt.claims','{}',true);
select set_config('role','authenticated',true);
select throws_ok(format('select public.accept_project_invitation(%L)',pg_temp.kv('late')),'42501',null,'no session refused');

select * from finish();
rollback;
