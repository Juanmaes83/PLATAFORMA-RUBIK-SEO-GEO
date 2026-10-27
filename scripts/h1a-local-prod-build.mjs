// Build only against the explicitly selected loopback Supabase test stack.
import { spawnSync } from 'node:child_process';
import { localSupabaseEnv } from './supabase-test-env.mjs';

const local = localSupabaseEnv();
const env = {
  ...process.env,
  NEXT_PUBLIC_SUPABASE_URL: local.apiUrl,
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: local.publishableKey,
  RUBIK_N2_SCHEMA_AVAILABLE: 'false',
  RUBIK_N2_CONTENT_GEO_SCHEMA_AVAILABLE: 'false',
  NEXT_TELEMETRY_DISABLED: '1',
};
const result = spawnSync(process.execPath, ['scripts/run-next.mjs', 'build'], {
  env, stdio: 'inherit', windowsHide: true,
});
process.exit(result.status ?? 1);
