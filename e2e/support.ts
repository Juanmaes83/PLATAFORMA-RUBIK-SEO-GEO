import { expect, type Page } from "@playwright/test";
import { fixtureScope } from "./fixture-scope";
export { fixtureEmail } from "./fixture-scope";
export { reserveBrowserAccount, claimBrowserAccount, recordBrowserProject } from "./fixtures";

// Fictitious e2e accounts on the LOCAL Supabase stack, created by e2e/global-setup.ts through
// the same RLS-protected Data API the app uses. Reserved `.test` addresses; no real data.
// Fictitious passphrase for local test accounts only (they exist only in the local stack).
export const TEST_PASSPHRASE = process.env.RUBIK_E2E_PASSPHRASE!;
if (!TEST_PASSPHRASE) throw new Error("Missing per-run E2E passphrase");
const scope = fixtureScope();
export const TENANT = scope.tenant;
export const OTHER_TENANT = scope.otherTenant;
export const PROJECT = scope.project;
export const OTHER_PROJECT = scope.otherProject;
export const USERS = scope.users;
export type UserKey = keyof typeof USERS;

export async function signIn(page: Page, user: UserKey) {
  await page.context().clearCookies(); // start from no session
  await page.goto("/acceso");
  await page.getByLabel("Correo").fill(USERS[user]);
  await page.getByLabel("Contraseña").fill(TEST_PASSPHRASE);
  await page.getByRole("button", { name: "Entrar" }).click();
  await expect(page).toHaveURL(/\/panel$/);
}
