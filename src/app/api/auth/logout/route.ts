import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

// Keep logout on a document POST, with the same destination-origin policy as login.
// The shared public-key client retains Preview identity/session guards and cookie handling.
export async function POST(request: NextRequest) {
  const rawOrigin = request.headers.get("origin") ?? "";
  let origin: URL;
  try { origin = new URL(rawOrigin); }
  catch { return new Response(null, { status: 403 }); }
  if (rawOrigin !== origin.origin || origin.host !== request.headers.get("host") ||
      (origin.protocol !== "https:" && !(origin.protocol === "http:" && origin.hostname === "127.0.0.1")))
    return new Response(null, { status: 403 });
  if (request.headers.get("content-type")?.split(";")[0].trim().toLowerCase() !== "application/x-www-form-urlencoded")
    return new Response(null, { status: 415 });
  const length = request.headers.get("content-length");
  if (length !== null && (!/^\d+$/.test(length) || !Number.isSafeInteger(Number(length)) || Number(length) > 8192))
    return new Response(null, { status: 413 });
  // No form fields or redirect destinations are accepted or parsed.
  const unavailable = () => NextResponse.json({ error: "No se pudo confirmar el cierre de sesión. Vuelve a intentarlo." }, { status: 503 });
  try {
    const supabase = await createClient();
    if (!supabase) return unavailable();
    const { error } = await supabase.auth.signOut();
    if (error) return unavailable();
    return NextResponse.redirect(new URL("/", origin), 303);
  } catch { return unavailable(); }
}
