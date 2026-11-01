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

/** Exercise the approved disclosure, active route and real keyboard navigation. */
export async function expectActiveProjectTool(page: Page, label: string, href: string, summaryHref: string) {
  const navigation = page.getByRole("navigation", { name: "Secciones del proyecto" });
  const disclosure = navigation.locator(".project-nav-disclosure details");
  const toggle = disclosure.locator("summary");
  const open = async () => {
    if (!(await disclosure.evaluate((el) => (el as HTMLDetailsElement).open))) {
      await toggle.focus();
      await page.keyboard.press("Enter");
    }
    await expect(disclosure).toHaveAttribute("open", "");
  };
  const active = async () => {
    const link = disclosure.getByRole("link", { name: label, exact: true });
    await expect(link).toBeVisible();
    await expect(link).toHaveAttribute("href", href);
    await expect(link).toHaveAttribute("aria-current", "page");
    await expect(navigation.locator('a[aria-current="page"]')).toHaveCount(1);
  };
  await open();
  await active();
  // Leave and return through the menu, so checking an attribute cannot hide a dead route.
  await navigation.getByRole("link", { name: "Resumen", exact: true }).focus();
  await page.keyboard.press("Enter");
  await expect(page).toHaveURL(summaryHref);
  await expect(navigation.getByRole("link", { name: "Resumen", exact: true })).toHaveAttribute("aria-current", "page");
  await open();
  await disclosure.getByRole("link", { name: label, exact: true }).focus();
  await page.keyboard.press("Enter");
  await expect(page).toHaveURL(href);
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(label);
  await open();
  await active();
  await toggle.focus();
  await page.keyboard.press("Enter");
  await expect(disclosure).not.toHaveAttribute("open", "");
  await expect(disclosure.getByRole("link", { name: label, exact: true })).toBeHidden();
}
