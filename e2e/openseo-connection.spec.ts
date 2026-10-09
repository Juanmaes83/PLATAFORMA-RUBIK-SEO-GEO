import { mkdirSync } from "node:fs";
import { join } from "node:path";
import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";
import { PROJECT, TENANT, signIn } from "./support";

// ADR 0007, phase 3: the owner connects this project to an OpenSEO project with explicit
// consent and revokes it, against the local stack only. No OpenSEO request is made: the
// panel writes the mapping through the owner-only RPC. Runs once (desktop) because it
// changes data; the page itself is checked at every width by visual.spec.ts.
const PAGE = `/proyectos/${TENANT}/${PROJECT}/auditoria-tecnica`;
const provider = `e2e-${Date.now().toString(36)}`;

async function checked(page: Page, name: string) {
  await page.waitForLoadState("networkidle");
  const axe = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"]).analyze();
  expect(axe.violations.filter((v) => v.impact === "serious" || v.impact === "critical").map((v) => v.id)).toEqual([]);
  const overflow = await page.evaluate(() => ({ scroll: document.documentElement.scrollWidth, width: window.innerWidth }));
  expect(overflow.scroll).toBeLessThanOrEqual(overflow.width);
  for (const dir of [join("test-results", "visual", "escritorio-1280"), ...(process.env.UPDATE_VISUAL_EVIDENCE === "1" ? [join("docs", "visual", "escritorio-1280")] : [])]) {
    mkdirSync(dir, { recursive: true });
    await page.screenshot({ path: join(dir, `${name}.png`), fullPage: true });
  }
}

test("owner connects with consent, sees only the last characters, and revokes", async ({ page }, info) => {
  test.skip(info.project.name !== "escritorio-1280", "changes data: runs once");
  await signIn(page, "owner");
  await page.goto(PAGE);
  const panel = page.getByRole("region", { name: "Conexión de OpenSEO del proyecto" });
  await expect(panel).toContainText("configuración global");
  await expect(panel.getByLabel("restaurante.ejemplo.test", { exact: true })).toBeChecked();
  await expect(panel.getByLabel("www.restaurante.ejemplo.test")).not.toBeChecked();

  await panel.getByLabel("Identificador del proyecto en OpenSEO").fill(provider);
  await panel.getByRole("button", { name: "Conectar OpenSEO" }).click();
  // The consent checkbox is required: the browser blocks the submission without it.
  await expect(panel.getByText("Conexión guardada.")).toHaveCount(0);
  await panel.getByLabel(/autorizo que la plataforma use OpenSEO/).check();
  await panel.getByRole("button", { name: "Conectar OpenSEO" }).click();

  await expect(panel.getByText("Conexión activa")).toBeVisible();
  await expect(panel).toContainText(`Termina en …${provider.slice(-4)}`);
  await expect(panel).toContainText("restaurante.ejemplo.test");
  expect(await page.content()).not.toContain(provider);
  await checked(page, "20-auditoria-tecnica-conexion-activa");

  await panel.getByLabel(/al revocarla/).check();
  await panel.getByRole("button", { name: "Revocar conexión" }).click();
  await expect(panel.getByLabel("Identificador del proyecto en OpenSEO")).toBeVisible();
  await checked(page, "21-auditoria-tecnica-sin-conexion");
});

test("an analyst of the same project never sees the connection panel", async ({ page }, info) => {
  test.skip(info.project.name !== "escritorio-1280", "read-only check, once is enough");
  await signIn(page, "analyst");
  await page.goto(PAGE);
  await expect(page.getByRole("region", { name: "Conexión de OpenSEO del proyecto" })).toHaveCount(0);
  await expect(page.getByLabel("Identificador del proyecto en OpenSEO")).toHaveCount(0);
});
