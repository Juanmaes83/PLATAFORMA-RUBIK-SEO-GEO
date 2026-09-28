import "server-only";

import { cookies } from "next/headers";
import { connection } from "next/server";
import { findDemoUser, type DemoUser } from "@/lib/fixtures/demo";
import { resolveAuthMode, type AuthModeInfo } from "./mode";

// MOCK session: the cookie holds the id of a fictitious demo user. It is NOT secure (it
// is neither signed nor verified server-side against an identity provider) and exists
// only so the local skeleton can show per-role navigation. CORE-9.1 replaces it with
// Supabase Auth sessions verified on the server.
export const MOCK_SESSION_COOKIE = "rubik_demo_session";

export function authMode(): AuthModeInfo {
  return resolveAuthMode(process.env);
}

/** Auth mode read at request time, never baked into a prerendered page at build time. */
export async function requestAuthMode(): Promise<AuthModeInfo> {
  await connection();
  return authMode();
}

export async function currentUser(): Promise<DemoUser | null> {
  if ((await requestAuthMode()).mode !== "mock") return null;
  const store = await cookies();
  return findDemoUser(store.get(MOCK_SESSION_COOKIE)?.value);
}
