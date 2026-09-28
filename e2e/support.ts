import { expect, type Page } from "@playwright/test";

// Fictitious e2e accounts on the LOCAL Supabase stack, created by e2e/global-setup.ts through
// the same RLS-protected Data API the app uses. Reserved `.test` addresses; no real data.
// Fictitious passphrase for local test accounts only (they exist only in the local stack).
export const TEST_PASSPHRASE = "prueba-local-2026";
export const TENANT = "agencia-ejemplo";
export const OTHER_TENANT = "otra-agencia";
export const PROJECT = "restaurante-ejemplo";
export const OTHER_PROJECT = "despacho-ejemplo";

export const USERS = {
  owner: "titular@ejemplo.test", // owner of agencia-ejemplo and restaurante-ejemplo
  analyst: "analista@ejemplo.test", // analyst in restaurante-ejemplo
  client: "cliente@ejemplo.test", // client-approver in restaurante-ejemplo
  outsider: "otra@ejemplo.test", // owner of otra-agencia and despacho-ejemplo
  newcomer: "sin-proyectos@ejemplo.test", // signed up, no membership
} as const;
export type UserKey = keyof typeof USERS;

export async function signIn(page: Page, user: UserKey) {
  await page.context().clearCookies(); // start from no session
  await page.goto("/acceso");
  await page.getByLabel("Correo").fill(USERS[user]);
  await page.getByLabel("Contraseña").fill(TEST_PASSPHRASE);
  await page.getByRole("button", { name: "Entrar" }).click();
  await expect(page).toHaveURL(/\/panel$/);
}
