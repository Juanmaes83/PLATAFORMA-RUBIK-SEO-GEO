import "server-only";

import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { supabasePublicConfig } from "@/lib/auth/mode";
import type { Database } from "./database.types";

// Supabase client for Server Components, Server Actions and Route Handlers, following the
// @supabase/ssr pattern for the App Router: a new client per request, cookies read with
// getAll and written with setAll. It uses only the publishable key, so every query runs as
// the signed-in user and Postgres RLS decides what it can read or change. No privileged
// (secret) key is used anywhere in the application.
export async function createClient() {
  const config = supabasePublicConfig(process.env);
  if (!config) return null;
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

export type ServerClient = NonNullable<Awaited<ReturnType<typeof createClient>>>;
