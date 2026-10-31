// Run-owned, fresh N1 source stack for the local H1-A HTTP/export drill.
import { cpSync, existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { join, resolve } from 'node:path';

const ROOT=resolve(import.meta.dirname,'..');
const RUN=process.env.U03_RESTORE_DESTINATION_RUN_ID??'';
if(!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(RUN)) throw new Error('H1A_LOCAL_SOURCE_RUN_ID_INVALID');
const PROJECT=`rubik-h1a-src-${RUN.replaceAll('-','').slice(0,12).toLowerCase()}`;
const WORKDIR=join(ROOT,'test-results',`${PROJECT}-source-stack`);
const SUPABASE=join(WORKDIR,'supabase');
const MARKER=join(WORKDIR,'.h1a-owned-source.json');
const CUT=20261015210000;
const PORTS=new Map([[54320,65420],[54321,65421],[54322,65422],[54323,65423],[54324,65424],[54327,65427],[54329,65429],[8083,65483]]);
const EXCLUDE='studio,realtime,storage-api,imgproxy,mailpit,postgres-meta,edge-runtime,logflare,vector,supavisor';
function run(command,args,options={}){try{return execFileSync(command,args,{cwd:ROOT,encoding:'utf8',stdio:['ignore','pipe','pipe'],...options});}catch{throw new Error('H1A_LOCAL_SOURCE_COMMAND_FAILED');}}
function cli(args){const base=['--yes','supabase@2.118.0','--workdir',WORKDIR,...args];if(process.platform!=='win32')return run('npx',base);const q=s=>`'${String(s).replaceAll("'","''")}'`;return run('powershell.exe',['-NoProfile','-NonInteractive','-Command',`& npx.cmd ${base.map(q).join(' ')}`]);}
function names(){return run('docker',['ps','-a','--filter',`label=com.supabase.cli.project=${PROJECT}`,'--format','{{.Names}}']).split(/\r?\n/).filter(Boolean);}
function provision(){if(names().length)throw new Error('H1A_LOCAL_SOURCE_ALREADY_EXISTS');if(existsSync(WORKDIR))throw new Error('H1A_LOCAL_SOURCE_UNOWNED_WORKDIR');
  const files=readdirSync(join(ROOT,'supabase','migrations')).filter(n=>/^\d{14}_.*\.sql$/.test(n)&&Number(n.slice(0,14))<=CUT).sort();
  if(files.length!==27||Number(files.at(-1)?.slice(0,14))!==CUT)throw new Error('H1A_LOCAL_SOURCE_MIGRATIONS_REJECTED');
  mkdirSync(join(SUPABASE,'migrations'),{recursive:true});for(const name of files)cpSync(join(ROOT,'supabase','migrations',name),join(SUPABASE,'migrations',name));
  cpSync(join(ROOT,'supabase','seed.sql'),join(SUPABASE,'seed.sql'));cpSync(join(ROOT,'supabase','templates'),join(SUPABASE,'templates'),{recursive:true});
  let config=readFileSync(join(ROOT,'supabase','config.toml'),'utf8').replace(/^project_id\s*=.*$/m,`project_id = "${PROJECT}"`);
  config=config.replace(/^([ \t]*[a-z_]*port[ \t]*=[ \t]*)(\d+)(.*)$/gim,(line,prefix,port,suffix)=>PORTS.has(Number(port))?`${prefix}${PORTS.get(Number(port))}${suffix}`:line);
  config=config.replace(/(\[db\.pooler\]\r?\n)([\s\S]*?)(?=\r?\n\[|$)/,(_a,h,b)=>`${h}${b.replace(/^enabled\s*=\s*\w+/m,'enabled = false')}`);
  writeFileSync(join(SUPABASE,'config.toml'),config,{flag:'wx'});writeFileSync(MARKER,JSON.stringify({project:PROJECT,runId:RUN,migrations:27,lastMigration:String(CUT)}),{flag:'wx'});
}
const action=process.argv[2];
if(action==='start'){provision();cli(['start','--exclude',EXCLUDE,'--yes']);if(!names().includes(`supabase_db_${PROJECT}`))throw new Error('H1A_LOCAL_SOURCE_DATABASE_MISSING');cli(['db','reset','--local','--no-seed','--yes']);
  const state=run('docker',['exec',`supabase_db_${PROJECT}`,'psql','-X','-U','postgres','-d','postgres','-Atqc','select count(*)::text||\'|\'||max(version)::text from supabase_migrations.schema_migrations']).trim();
  if(state!==`27|${CUT}`)throw new Error('H1A_LOCAL_SOURCE_MIGRATIONS_MISMATCH');process.stdout.write('H1A_LOCAL_SOURCE_STARTED migrations=27 last=20261015210000 loopback=true pooler=excluded\n');
}else if(action==='inspect'){const marker=JSON.parse(readFileSync(MARKER,'utf8'));if(marker.project!==PROJECT||marker.runId!==RUN||marker.migrations!==27||!names().includes(`supabase_db_${PROJECT}`))throw new Error('H1A_LOCAL_SOURCE_OWNERSHIP_REJECTED');process.stdout.write('H1A_LOCAL_SOURCE_OWNERSHIP PASS\n');
}else if(action==='stop'){const marker=JSON.parse(readFileSync(MARKER,'utf8'));const target=resolve(WORKDIR),allowed=resolve(ROOT,'test-results')+'\\';if(marker.project!==PROJECT||marker.runId!==RUN||!target.startsWith(allowed))throw new Error('H1A_LOCAL_SOURCE_CLEANUP_REFUSED');cli(['stop','--no-backup']);if(names().length)throw new Error('H1A_LOCAL_SOURCE_CONTAINERS_REMAIN');rmSync(WORKDIR,{recursive:true,force:false});process.stdout.write('H1A_LOCAL_SOURCE_RETIRED containers=0 workdir=removed\n');
}else{process.stderr.write('Usage: node scripts/h1a-local-source-stack.mjs start|inspect|stop\n');process.exitCode=2;}
