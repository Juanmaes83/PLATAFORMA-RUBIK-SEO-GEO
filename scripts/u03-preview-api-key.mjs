import { createClient } from '@supabase/supabase-js';

const isSecretApiKey = key => typeof key === 'string' && key.startsWith('sb_secret_');

/** Headers for direct REST probes: new API keys are apikey-only; legacy JWTs
 * retain the historic Bearer behavior needed by projects not yet migrated. */
export function apiKeyHeaders(apiKey) {
  const headers = { apikey: apiKey };
  if (!isSecretApiKey(apiKey)) headers.Authorization = `Bearer ${apiKey}`;
  return headers;
}

/** Build a server-only Auth Admin client. supabase-js versions may add the
 * API key as a Bearer fallback, so strip only the identical sb_secret value.
 * A real user access token or legacy JWT behavior remains untouched. */
export function createPreviewAdminClient(url, apiKey, fetchImpl = fetch) {
  const safeFetch = async (input, init = {}) => {
    const headers = new Headers(init.headers);
    headers.set('apikey', apiKey);
    const authorization = headers.get('Authorization');
    if (
      isSecretApiKey(apiKey) &&
      authorization?.trim() === `Bearer ${apiKey}`
    ) {
      headers.delete('Authorization');
    }
    return fetchImpl(input, { ...init, headers });
  };

  return createClient(url, apiKey, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { fetch: safeFetch },
  });
}
