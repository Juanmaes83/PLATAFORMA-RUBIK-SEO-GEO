import "server-only";

import { cache } from "react";
import { redirect } from "next/navigation";
import { connection } from "next/server";
import { createClient, type ServerClient } from "@/lib/supabase/server";
import { resolveAuthMode, type AuthModeInfo } from "./mode";

export interface SessionUser {
  /** Supabase Auth user id (JWT `sub`), verified on the server. */
  id: string;
  email: string | null;
}

export function authMode(): AuthModeInfo {
  return resolveAuthMode(process.env);
}

/** Auth mode read at request time, never baked into a prerendered page at build time. */
export async function requestAuthMode(): Promise<AuthModeInfo> {
  await connection();
  return authMode();
}

/**
 * The signed-in user, or null. getClaims() verifies the access token (signature and expiry)
 * on the server; the session cookie alone is never trusted, and profile metadata is never read.
 * Cached per request.
 */
export const currentUser = cache(async (): Promise<SessionUser | null> => {
  await connection();
  const supabase = await createClient();
  if (!supabase) return null;
  const { data, error } = await supabase.auth.getClaims();
  const sub = data?.claims?.sub;
  if (error || typeof sub !== "string" || !sub) return null;
  const email = data.claims.email;
  return { id: sub, email: typeof email === "string" ? email : null };
});

/** For protected pages and actions: the verified user and an RLS-bound client, or /acceso. */
export async function requireSession(): Promise<{ user: SessionUser; supabase: ServerClient }> {
  const [user, supabase] = await Promise.all([currentUser(), createClient()]);
  if (!user || !supabase) redirect("/acceso");
  return { user, supabase };
}
