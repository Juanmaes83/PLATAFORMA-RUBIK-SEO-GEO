"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { findDemoUser } from "@/lib/fixtures/demo";
import { MOCK_SESSION_COOKIE, authMode } from "./session";

export async function signInAsDemoUser(formData: FormData): Promise<void> {
  if (authMode().mode !== "mock") redirect("/acceso");
  const user = findDemoUser(String(formData.get("userId") ?? ""));
  if (!user) redirect("/acceso?error=usuario");
  const store = await cookies();
  store.set(MOCK_SESSION_COOKIE, user.id, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 8,
  });
  redirect("/proyectos");
}

export async function signOut(): Promise<void> {
  const store = await cookies();
  store.delete(MOCK_SESSION_COOKIE);
  redirect("/");
}
