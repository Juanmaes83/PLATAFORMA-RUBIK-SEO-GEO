import "server-only";

import { createServerClient } from "@supabase/ssr";
import { createClient as createBearerSupabaseClient } from "@supabase/supabase-js";
import { cookies } from "next/headers";
import { previewDatabaseIdentityMatches, supabasePublicConfig } from "@/lib/auth/mode";
import type { Database } from "./database.types";

// Supabase client for Server Components, Server Actions and Route Handlers, following the
// @supabase/ssr pattern for the App Router: a new client per request, cookies read with
// getAll and written with setAll. It uses only the publishable key, so every query runs as
// the signed-in user and Postgres RLS decides what it can read or change. No privileged
// (secret) key is used anywhere in the application.
export async function createClient() {
  const config = supabasePublicConfig(process.env);
  if (!config) return null;
  if (process.env.VERCEL_ENV === "preview" && !await previewDatabaseIdentityMatches(process.env)) return null;
  const cookieStore = await cookies();
  return createServerClient<Database>(config.url, config.publishableKey, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          cookiesToSet.forEach(({ name, value, options }) => cookieStore.set(name, value, options));
        } catch {
          // Called from a Server Component, which cannot set cookies: src/proxy.ts refreshes
          // the session on every request instead.
        }
      },
    },
  });
}

/** Request-scoped public-key client for protected owner tools that carry a genuine Auth bearer. */
export async function createBearerClient(request: Request) {
  const match = /^Bearer ([A-Za-z0-9._~-]+)$/.exec(request.headers.get("authorization") ?? "");
  const config = supabasePublicConfig(process.env);
  if (!match || !config) return null;
  if (process.env.VERCEL_ENV === "preview" && !await previewDatabaseIdentityMatches(process.env)) return null;
  const client = createBearerSupabaseClient<Database>(config.url, config.publishableKey, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    global: { headers: { Authorization: `Bearer ${match[1]}` } },
  });
  const { data, error } = await client.auth.getUser(match[1]);
  if (error || !data.user) return null;
  return { client, user: data.user };
}

export type ServerClient = NonNullable<Awaited<ReturnType<typeof createClient>>>;
