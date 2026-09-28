import type { EmailOtpType } from "@supabase/supabase-js";
import { redirect } from "next/navigation";
import type { NextRequest } from "next/server";
import { safeNextPath } from "@/lib/auth/redirect";
import { createClient } from "@/lib/supabase/server";

// E-mail confirmation link (supabase/templates/confirmation.html): the token hash is verified
// on the server with verifyOtp, which also creates the session cookies.
const TYPES: readonly EmailOtpType[] = ["email", "signup"];

export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  const tokenHash = searchParams.get("token_hash");
  const type = searchParams.get("type") as EmailOtpType | null;
  const supabase = await createClient();
  if (supabase && tokenHash && type && TYPES.includes(type)) {
    const { error } = await supabase.auth.verifyOtp({ type, token_hash: tokenHash });
    if (!error) redirect(safeNextPath(searchParams.get("next")));
  }
  redirect("/acceso?error=enlace");
}
