"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { PASSWORD_RULE, isValidEmail } from "./credentials";
import { safeNextPath } from "./redirect";

// Supabase Auth with e-mail and password, entirely on the server. Errors are reported as
// short codes in the URL (never the submitted values) and explained on the page.
const field = (formData: FormData, name: string) => String(formData.get(name) ?? "").trim();

export async function signIn(formData: FormData): Promise<void> {
  const supabase = await createClient();
  if (!supabase) redirect("/acceso");
  const email = field(formData, "email");
  const password = String(formData.get("password") ?? "");
  if (!isValidEmail(email) || !password) redirect("/acceso?error=datos");
  const { error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) redirect(`/acceso?error=${error.code === "email_not_confirmed" ? "sin-confirmar" : "credenciales"}`);
  redirect(safeNextPath(formData.get("next")));
}

export async function signUp(formData: FormData): Promise<void> {
  const supabase = await createClient();
  if (!supabase) redirect("/registro");
  const email = field(formData, "email");
  const password = String(formData.get("password") ?? "");
  if (!isValidEmail(email)) redirect("/registro?error=correo");
  if (!PASSWORD_RULE.test(password)) redirect("/registro?error=clave");
  // Supabase only honours this redirect if it is in the project's allowed redirect URLs.
  const origin = (await headers()).get("origin");
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: origin ? { emailRedirectTo: `${origin}/auth/confirm` } : undefined,
  });
  if (error) redirect(`/registro?error=${error.code === "weak_password" ? "clave" : "registro"}`);
  // With e-mail confirmation (the hosted default) there is no session until the link is used.
  // The answer is the same whether or not the address already had an account.
  redirect(data.session ? "/panel" : "/acceso?aviso=confirma");
}

export async function signOut(): Promise<void> {
  const supabase = await createClient();
  if (supabase) await supabase.auth.signOut();
  redirect("/");
}
