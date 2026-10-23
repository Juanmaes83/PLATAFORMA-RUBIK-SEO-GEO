import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { isValidEmail } from "@/lib/auth/credentials";
import { safeNextPath } from "@/lib/auth/redirect";

// A normal form POST keeps the browser on a document navigation. In protected
// Preview, the client-side Server Action redirect requested missing static
// chunks after login. Keep the same Auth and redirect checks on the server.
export async function POST(request: NextRequest) {
  // Next may construct nextUrl with an internal hostname behind a proxy. The
  // Host header names the destination the browser actually submitted to.
  let origin: URL;
  try { origin = new URL(request.headers.get("origin") ?? ""); }
  catch { return new Response(null, { status: 403 }); }
  const host = request.headers.get("host");
  const isLoopback = ["localhost", "127.0.0.1", "[::1]"].includes(origin.hostname);
  if (!host || origin.host !== host ||
      (origin.protocol !== "https:" && !(origin.protocol === "http:" && isLoopback)))
    return new Response(null, { status: 403 });
  if (!request.headers.get("content-type")?.startsWith("application/x-www-form-urlencoded"))
    return new Response(null, { status: 415 });
  const rawLength = request.headers.get("content-length");
  const length = Number(rawLength);
  if (!rawLength || !/^\d+$/.test(rawLength) || !Number.isSafeInteger(length) || length > 8192)
    return new Response(null, { status: 413 });

  let form: FormData;
  try { form = await request.formData(); }
  catch { return new Response(null, { status: 400 }); }
  const destination = (path: string) => NextResponse.redirect(new URL(path, origin), 303);
  const supabase = await createClient();
  if (!supabase) return destination("/acceso");
  const email = String(form.get("email") ?? "").trim();
  const password = String(form.get("password") ?? "");
  if (!isValidEmail(email) || !password) return destination("/acceso?error=datos");
  const { error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) return destination(`/acceso?error=${error.code === "email_not_confirmed" ? "sin-confirmar" : "credenciales"}`);
  return destination(safeNextPath(form.get("next")));
}
