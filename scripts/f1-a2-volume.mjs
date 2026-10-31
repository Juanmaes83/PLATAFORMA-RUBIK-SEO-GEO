// Optional volume review: owned fictitious projects ONLY in the dedicated F1-A2 local stack.
import {createClient} from '@supabase/supabase-js';
import {localSupabaseEnv,localDatabaseContainer} from './supabase-test-env.mjs';
if(process.env.RUBIK_TEST_F1A2_STACK!=='1'||localDatabaseContainer()!=='supabase_db_rubik-f1-a2-20261101')throw Error('Dedicated F1-A2 stack only');
const env=localSupabaseEnv(),admin=createClient(env.apiUrl,env.secretKey,{auth:{persistSession:false}});
const must=r=>{if(r.error)throw r.error;return r.data;};
const org=must(await admin.from('organizations').select('id,created_by').eq('slug','demo-agencia').single());
const existing=must(await admin.from('projects').select('id').eq('organization_id',org.id).like('slug','f1-a2-volume-%'));
if(existing.length)throw Error('Volume fixtures already exist; no cleanup or replacement is automatic');
const projects=Array.from({length:46},(_,i)=>({organization_id:org.id,slug:`f1-a2-volume-${String(i+1).padStart(3,'0')}`,name:`Proyecto ficticio ${String(i+1).padStart(2,'0')} (demo)`,domain:`sitio-${i+1}.ejemplo.test`}));
const rows=must(await admin.from('projects').insert(projects).select('id,organization_id'));
must(await admin.from('project_members').insert(rows.map(p=>({project_id:p.id,organization_id:p.organization_id,user_id:org.created_by,role:'owner'}))));
console.log(`Created ${rows.length} fictitious local projects; original agency portfolio now has 50. No hosted writes.`);
