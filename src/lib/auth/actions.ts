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

/**
 * Password recovery, step 1. The answer is the same whether or not the address has an account,
 * and Supabase rate-limits the e-mails. The link comes back to /auth/confirm (an exact allowed
 * redirect URL), which only ever continues to /restablecer.
 */
export async function requestPasswordReset(formData: FormData): Promise<void> {
  const supabase = await createClient();
  if (!supabase) redirect("/recuperar");
  const email = field(formData, "email");
  if (!isValidEmail(email)) redirect("/recuperar?error=correo");
  const origin = (await headers()).get("origin");
  try {
    await supabase.auth.resetPasswordForEmail(email, origin ? { redirectTo: `${origin}/auth/confirm` } : undefined);
  } catch {
    // Same answer either way: never reveal whether the address exists or the send failed.
  }
  redirect("/recuperar?aviso=enviado");
}

/**
 * Password recovery, step 2: needs the session created by the recovery link. After the change
 * every session of the account is closed, so the new password is required to enter again.
 */
export async function updatePassword(formData: FormData): Promise<void> {
  const supabase = await createClient();
  if (!supabase) redirect("/recuperar");
  const { data } = await supabase.auth.getUser();
  if (!data.user) redirect("/recuperar?error=enlace");
  const password = String(formData.get("password") ?? "");
  if (!PASSWORD_RULE.test(password)) redirect("/restablecer?error=clave");
  if (password !== String(formData.get("confirm") ?? "")) redirect("/restablecer?error=distintas");
  const { error } = await supabase.auth.updateUser({ password });
  if (error) redirect(`/restablecer?error=${error.code === "weak_password" || error.code === "same_password" ? "clave" : "fallo"}`);
  await supabase.auth.signOut({ scope: "global" });
  redirect("/acceso?aviso=clave");
}

export async function signOut(): Promise<void> {
  const supabase = await createClient();
  if (supabase) await supabase.auth.signOut();
  redirect("/");
}
