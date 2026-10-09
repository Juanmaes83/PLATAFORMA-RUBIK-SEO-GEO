import type { EmailOtpType } from "@supabase/supabase-js";
import { redirect } from "next/navigation";
import type { NextRequest } from "next/server";
import { safeNextPath } from "@/lib/auth/redirect";
import { createClient } from "@/lib/supabase/server";

// Custom e-mail links use verifyOtp; standard PKCE callbacks exchange a code using
// the verifier stored by this request-scoped SSR client. Both write session cookies.
// URL-fragment access tokens never reach this server handler; implicit-flow templates
// still need an appropriate hosted configuration. A recovery link only ever leads to
// /restablecer, whatever `next` says, so it cannot be turned into a redirect elsewhere.
// Invites are not enabled here.
const TYPES: readonly EmailOtpType[] = ["email", "signup", "recovery"];

export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  const tokenHash = searchParams.get("token_hash");
  const type = searchParams.get("type") as EmailOtpType | null;
  const code = searchParams.get("code");
  const flowId = searchParams.get("sb_flow_id");
  const supabase = await createClient();
  let verified = false;
  if (supabase && (!type || TYPES.includes(type))) {
    try {
      if (tokenHash && type) {
        const { error } = await supabase.auth.verifyOtp({ type, token_hash: tokenHash });
        verified = !error;
      } else if (!tokenHash && code) {
        const { error } = await supabase.auth.exchangeCodeForSession(code, flowId !== null ? { flowId } : undefined);
        verified = !error;
      }
    } catch {
      // Return the same generic failure without exposing auth codes, tokens or errors.
    }
  }
  if (verified) redirect(type === "recovery" ? "/restablecer" : safeNextPath(searchParams.get("next")));
  redirect(type === "recovery" ? "/recuperar?error=enlace" : "/acceso?error=enlace");
}
