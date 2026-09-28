import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { supabasePublicConfig } from "@/lib/auth/mode";

// Session refresh for every request (Supabase's recommended Proxy for Next.js 16). It only
// keeps the auth cookies fresh; it does not authorize anything. Each page verifies the user
// again on the server and Postgres RLS enforces tenant isolation.
export async function updateSession(request: NextRequest) {
  let response = NextResponse.next({ request });
  const config = supabasePublicConfig(process.env);
  if (!config) return response;

  const supabase = createServerClient(config.url, config.publishableKey, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet, headers) {
        cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
        response = NextResponse.next({ request });
        cookiesToSet.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
        Object.entries(headers ?? {}).forEach(([key, value]) => response.headers.set(key, value));
      },
    },
  });

  // Nothing between createServerClient and getClaims(): getClaims validates the JWT and
  // refreshes an expired session, writing the new cookies through setAll.
  await supabase.auth.getClaims();
  return response;
}
