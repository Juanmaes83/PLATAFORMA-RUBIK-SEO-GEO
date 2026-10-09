import { mkdirSync } from "node:fs";
import { join } from "node:path";
import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";
import { localSupabaseEnv } from "../scripts/supabase-test-env.mjs";
import { PROJECT, TENANT, TEST_PASSPHRASE, signIn, type UserKey } from "./support";

// ADR 0020 against the local stack only. Organization owners create single-use links bound to one
// address and one non-owner role; the platform sends no email. Self-contained on purpose: it does
// not extend the shared visual spec, and every account it invites is created by the test itself,
// so the fixture users keep their memberships for the other specs.
const PAGE = `/proyectos/${TENANT}/${PROJECT}/invitaciones`;
const unique = (prefix: string) => `${prefix}-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}@ejemplo.test`;

async function checked(page: Page, name: string, project: string) {
  await page.waitForLoadState("networkidle");
  await expect(page.locator("h1")).toHaveCount(1);
  const overflow = await page.evaluate(() => ({ scroll: document.documentElement.scrollWidth, width: window.innerWidth }));
  expect(overflow.scroll, `horizontal overflow at ${project}`).toBeLessThanOrEqual(overflow.width);
  const axe = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"]).analyze();
  expect(axe.violations.filter((v) => v.impact === "serious" || v.impact === "critical").map((v) => v.id)).toEqual([]);
  const dirs = [join("test-results", "visual", project), ...(process.env.UPDATE_VISUAL_EVIDENCE === "1" ? [join("docs", "visual", project)] : [])];
  for (const dir of dirs) {
    mkdirSync(dir, { recursive: true });
    await page.screenshot({ path: join(dir, `${name}.png`), fullPage: true });
  }
}

async function confirmLink(mailpitUrl: string, address: string) {
  let link: string | undefined;
  await expect.poll(async () => {
    const list = await (await fetch(`${mailpitUrl}/api/v1/search?query=${encodeURIComponent(`to:${address}`)}`)).json();
    if (!list.messages?.length) return false;
    const message = await (await fetch(`${mailpitUrl}/api/v1/message/${list.messages[0].ID}`)).json();
    link = /href="([^"]+\/auth\/confirm\?[^"]+)"/.exec(message.HTML)?.[1]?.replace(/&amp;/g, "&");
    return !!link;
  }).toBe(true);
  return link!;
}

/** Registers and confirms a brand-new account through the UI, then signs out. */
async function newConfirmedAccount(page: Page, address: string) {
  const { mailpitUrl } = localSupabaseEnv();
  await page.context().clearCookies();
  await page.goto("/registro");
  await page.getByLabel("Correo").fill(address);
  await page.getByLabel("Contraseña").fill(TEST_PASSPHRASE);
  await page.getByRole("button", { name: "Crear cuenta" }).click();
  await page.goto(await confirmLink(mailpitUrl, address));
  await expect(page).toHaveURL(/\/panel$/);
  await page.getByRole("button", { name: "Salir" }).click();
  await expect(page).toHaveURL(/\/$/);
}

async function createLink(page: Page, address: string, role: string) {
  await page.goto(PAGE);
  await page.getByLabel("Correo de la persona invitada").fill(address);
  await page.getByLabel("Rol en este proyecto").selectOption(role);
  await page.getByRole("button", { name: "Crear enlace de invitación" }).click();
  const shown = page.locator("main").getByRole("status").filter({ hasText: "no se volverá a mostrar" });
  await expect(shown).toBeVisible();
  const link = (await shown.locator("code").textContent())!.trim();
  expect(link).toMatch(/\/invitacion\/[0-9a-f]{64}$/);
  return new URL(link, "http://local").pathname;
}

async function signInAs(page: Page, address: string) {
  await page.context().clearCookies();
  await page.goto("/acceso");
  await page.getByLabel("Correo").fill(address);
  await page.getByLabel("Contraseña").fill(TEST_PASSPHRASE);
  await page.getByRole("button", { name: "Entrar" }).click();
  await expect(page).toHaveURL(/\/panel$/);
}

test.describe("pages at every width (read-only)", () => {
  const pages: { name: string; user?: UserKey; path: string; text: string }[] = [
    { name: "26-invitaciones-titular", user: "owner", path: PAGE, text: "Crear enlace de invitación" },
    { name: "27-invitaciones-analista", user: "analyst", path: PAGE, text: "Solo la titularidad de la organización invita" },
    { name: "28-invitacion-no-valida", path: "/invitacion/no-valida", text: "Esta invitación no se puede usar" },
  ];
  for (const p of pages) {
    test(p.name, async ({ page }, info) => {
      if (p.user) await signIn(page, p.user);
      await page.goto(p.path);
      await expect(page.locator("main")).toContainText(p.text);
      await checked(page, p.name, info.project.name);
    });
  }

  test("organizations page links an owner to each project's invitations, never a member", async ({ page }) => {
    await signIn(page, "owner");
    await page.goto("/organizaciones");
    await expect(page.locator(`a[href="${PAGE}"]`)).toBeVisible();
    await signIn(page, "analyst");
    await page.goto("/organizaciones");
    await expect(page.locator(`a[href="${PAGE}"]`)).toHaveCount(0);
  });
});

test.describe("flows (change data: desktop only)", () => {
  test.beforeEach(({}, info) => test.skip(info.project.name !== "escritorio-1280", "changes data: runs once"));

  test("new account: invited before signing up, joins once with the invited role", async ({ page }) => {
    const address = unique("nueva");
    await signIn(page, "owner");
    const path = await createLink(page, address, "viewer");
    // A second open invitation for the same address is refused.
    await page.getByLabel("Correo de la persona invitada").fill(address);
    await page.getByRole("button", { name: "Crear enlace de invitación" }).click();
    await expect(page.locator("main").getByRole("alert")).toContainText("Ya hay una invitación abierta");

    // Another signed-in account cannot use it, and the page reveals nothing about it.
    await signIn(page, "newcomer");
    await page.goto(path);
    await expect(page.locator("main")).not.toContainText(address);
    await expect(page.locator("main")).not.toContainText(PROJECT);
    await page.getByRole("button", { name: "Aceptar invitación" }).click();
    await expect(page.locator("main").getByRole("alert")).toContainText("no se puede usar");

    // The invited person creates the account, then follows the link signed out.
    await newConfirmedAccount(page, address);
    await page.goto(path);
    await page.getByRole("link", { name: "Entrar" }).first().click();
    await expect(page).toHaveURL(/\/acceso\?siguiente=/, { timeout: 20_000 });
    await page.getByLabel("Correo").fill(address);
    await page.getByLabel("Contraseña").fill(TEST_PASSPHRASE);
    await page.getByRole("button", { name: "Entrar" }).click();
    await expect(page).toHaveURL(new RegExp(`${path}$`));
    await page.getByRole("button", { name: "Aceptar invitación" }).click();
    await expect(page).toHaveURL(new RegExp(`/proyectos/${TENANT}/${PROJECT}$`));
    await expect(page.locator("main")).toContainText("tu rol: Solo lectura");

    // Single use: the same link now answers "already a member" and changes nothing.
    await page.goto(path);
    await page.getByRole("button", { name: "Aceptar invitación" }).click();
    await expect(page.locator("main").getByRole("alert")).toContainText("Ya perteneces a este proyecto");

    // The viewer cannot manage invitations; the owner sees it accepted.
    await page.goto(PAGE);
    await expect(page.locator("main")).toContainText("Solo la titularidad de la organización invita");
    await signIn(page, "owner");
    await page.goto(PAGE);
    await expect(page.locator("li", { hasText: address })).toContainText("Aceptada");
  });

  test("existing account: signs in and accepts with the invited role", async ({ page }) => {
    const address = unique("existente");
    await newConfirmedAccount(page, address);
    await signIn(page, "owner");
    const path = await createLink(page, address, "analyst");
    await signInAs(page, address);
    await page.goto(path);
    await expect(page.locator("main")).toContainText(address.toLowerCase());
    await page.getByRole("button", { name: "Aceptar invitación" }).click();
    await expect(page).toHaveURL(new RegExp(`/proyectos/${TENANT}/${PROJECT}$`));
    await expect(page.locator("main")).toContainText("tu rol: Analista");
  });

  test("a revoked link stops working", async ({ page }) => {
    const address = unique("revocada");
    await newConfirmedAccount(page, address);
    await signIn(page, "owner");
    const path = await createLink(page, address, "viewer");
    await page.goto(PAGE);
    await page.locator("li", { hasText: address }).getByRole("button", { name: "Revocar" }).click();
    await expect(page.locator("main").getByRole("status")).toContainText("Invitación revocada");
    await expect(page.locator("li", { hasText: address })).toContainText("Revocada");
    await signInAs(page, address);
    await page.goto(path);
    await page.getByRole("button", { name: "Aceptar invitación" }).click();
    await expect(page.locator("main").getByRole("alert")).toContainText("no se puede usar");
  });
});
