// Fresh N1-only destination stack for local restore drills. It owns a fixed workdir,
// Docker project label and non-overlapping ports; it does not start Supavisor.
import { cpSync, existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { join, resolve } from 'node:path';

const ROOT = resolve(import.meta.dirname, '..');
const WORKDIR = join(ROOT, 'test-results', 'u03-window-restore-destination');
const SUPABASE = join(WORKDIR, 'supabase');
const PROJECT = 'rubik-u03-restore-20261020';
const MARKER = join(WORKDIR, '.u03-owned-destination.json');
const CUT = 20261015210000;
const PORTS = new Map([[54320,63520],[54321,63521],[54322,63522],[54323,63523],[54324,63524],[54327,63527],[54329,63529],[8083,8113]]);
const EXCLUDE = 'gotrue,realtime,storage-api,imgproxy,kong,mailpit,postgrest,postgres-meta,studio,edge-runtime,logflare,vector,supavisor';

function run(command, args, options = {}) {
  try { return execFileSync(command, args, { cwd: ROOT, encoding: 'utf8', stdio: ['ignore','pipe','pipe'], ...options }); }
  catch { throw new Error('LOCAL_DESTINATION_COMMAND_FAILED'); }
}
function cli(args) {
  const base = ['--yes','supabase@2.118.0','--workdir',WORKDIR,...args];
  if (process.platform !== 'win32') return run('npx', base);
  const quote = s => `'${String(s).replaceAll("'", "''")}'`;
  return run('powershell.exe',['-NoProfile','-NonInteractive','-Command',`& npx.cmd ${base.map(quote).join(' ')}`]);
}
function names() { return run('docker',['ps','-a','--filter',`label=com.supabase.cli.project=${PROJECT}`,'--format','{{.Names}}']).split(/\r?\n/).filter(Boolean); }
function provision() {
  if (names().some(name => name !== `supabase_db_${PROJECT}`)) throw new Error('LOCAL_DESTINATION_ALREADY_EXISTS_OR_UNOWNED');
  if (existsSync(WORKDIR)) {
    if (!existsSync(MARKER)) throw new Error('LOCAL_DESTINATION_ALREADY_EXISTS_OR_UNOWNED');
    const marker = JSON.parse(readFileSync(MARKER,'utf8'));
    const config = readFileSync(join(SUPABASE,'config.toml'),'utf8');
    const count = readdirSync(join(SUPABASE,'migrations')).filter(n => n.endsWith('.sql')).length;
    if (marker.project !== PROJECT || marker.migrations !== 27 || count !== 27 || !config.includes(`project_id = "${PROJECT}"`))
      throw new Error('LOCAL_DESTINATION_OWNERSHIP_REJECTED');
    writeFileSync(join(SUPABASE,'config.toml'),configure(readFileSync(join(SUPABASE,'config.toml'),'utf8')));
    return;
  }
  const migrations = readdirSync(join(ROOT,'supabase','migrations')).filter(n => /^\d{14}_.*\.sql$/.test(n) && Number(n.slice(0,14)) <= CUT).sort();
  if (migrations.length !== 27 || Number(migrations.at(-1)?.slice(0,14)) !== CUT) throw new Error('LOCAL_DESTINATION_MIGRATION_SET_REJECTED');
  mkdirSync(join(SUPABASE,'migrations'),{recursive:true});
  for (const name of migrations) cpSync(join(ROOT,'supabase','migrations',name),join(SUPABASE,'migrations',name));
  cpSync(join(ROOT,'supabase','seed.sql'),join(SUPABASE,'seed.sql'));
  cpSync(join(ROOT,'supabase','templates'),join(SUPABASE,'templates'),{recursive:true});
  let config = readFileSync(join(ROOT,'supabase','config.toml'),'utf8').replace(/^project_id\s*=.*$/m,`project_id = "${PROJECT}"`);
  config = configure(config);
  writeFileSync(join(SUPABASE,'config.toml'),config,{flag:'wx'});
  writeFileSync(MARKER,JSON.stringify({project:PROJECT,migrations:27,lastMigration:String(CUT),createdAt:new Date().toISOString()}),{flag:'wx'});
}
function configure(input) {
  let config = input.replace(/^([ \t]*[a-z_]*port[ \t]*=[ \t]*)(\d+)(.*)$/gim,(line,prefix,port,suffix)=>PORTS.has(Number(port))?`${prefix}${PORTS.get(Number(port))}${suffix}`:line);
  config = config.replace(/(\[db\.pooler\]\r?\n)([\s\S]*?)(?=\r?\n\[|$)/,(_all,header,body)=>`${header}${body.replace(/^enabled\s*=\s*\w+/m,'enabled = false')}`);
  config = config.replace(/(\[db\.migrations\]\r?\n)([\s\S]*?)(?=\r?\n\[|$)/,(_all,header,body)=>`${header}${body.replace(/^enabled\s*=\s*\w+/m,'enabled = true')}`);
  return config;
}
const action = process.argv[2];
if (action === 'start') {
  provision();
  cli(['start','--exclude',EXCLUDE,'--yes']);
  if (!names().includes(`supabase_db_${PROJECT}`)) throw new Error('LOCAL_DESTINATION_DATABASE_MISSING');
  cli(['db','reset','--local','--no-seed','--yes']);
  const versions = run('docker',['exec',`supabase_db_${PROJECT}`,'psql','-X','-U','postgres','-d','postgres','-Atqc','select count(*)::text||\'|\'||max(version)::text from supabase_migrations.schema_migrations']).trim();
  if (versions !== `27|${CUT}`) throw new Error('LOCAL_DESTINATION_MIGRATIONS_MISMATCH');
  process.stdout.write('LOCAL_RESTORE_DESTINATION_STARTED migrations=27 last=20261015210000 supavisor=excluded\n');
} else if (action === 'inspect') {
  const marker = JSON.parse(readFileSync(MARKER,'utf8'));
  if (marker.project !== PROJECT || marker.migrations !== 27 || !names().includes(`supabase_db_${PROJECT}`)) throw new Error('LOCAL_DESTINATION_OWNERSHIP_REJECTED');
  process.stdout.write('LOCAL_RESTORE_DESTINATION_OWNERSHIP PASS\n');
} else if (action === 'stop') {
  const marker = JSON.parse(readFileSync(MARKER,'utf8'));
  const target = resolve(WORKDIR), allowed = resolve(ROOT,'test-results')+'\\';
  if (marker.project !== PROJECT || !target.startsWith(allowed)) throw new Error('LOCAL_DESTINATION_CLEANUP_REFUSED');
  cli(['stop']);
  if (names().length) throw new Error('LOCAL_DESTINATION_CONTAINERS_REMAIN');
  rmSync(WORKDIR,{recursive:true,force:false});
  process.stdout.write('LOCAL_RESTORE_DESTINATION_RETIRED containers=0 workdir=removed\n');
} else { process.stderr.write('Usage: node scripts/u03-window-local-destination.mjs start|inspect|stop\n'); process.exitCode=2; }
