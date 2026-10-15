import { mkdirSync } from "node:fs";
import { join } from "node:path";
import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";
import { OTHER_PROJECT, OTHER_TENANT, PROJECT, TENANT, signIn } from "./support";

// N2-11 in the browser as fictitious users of the local stack. The data flow runs once
// (desktop) because it changes data; the pages are checked at 360, 390 and 1280 px.
const P = `/proyectos/${TENANT}/${PROJECT}`;
const C = `${P}/competidores`;

async function healthy(page: Page, mobile: boolean) {
  await page.waitForLoadState("networkidle");
  await expect(page.locator("h1")).toHaveCount(1);
  const axe = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"]).analyze();
  expect(axe.violations.filter((v) => v.impact === "serious" || v.impact === "critical").map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(" ")).join(", ")}`)).toEqual([]);
  const overflow = await page.evaluate(() => ({ scroll: document.documentElement.scrollWidth, width: window.innerWidth }));
  expect(overflow.scroll).toBeLessThanOrEqual(overflow.width);
  if (mobile) {
    const small = await page.$$eval(".btn, button, input:not([type=hidden]), select, .subnav a, summary", (els) =>
      els.filter((el) => (el as HTMLElement).offsetParent !== null)
        .map((el) => ({ text: (el.textContent ?? "").trim().slice(0, 30), h: el.getBoundingClientRect().height }))
        .filter((b) => b.h < 43.5));
    expect(small, "touch targets under 44 px").toEqual([]);
  }
}

async function screenshot(page: Page, project: string, name: string) {
  const dirs = [join("test-results", "visual", project)];
  if (process.env.UPDATE_VISUAL_EVIDENCE === "1") dirs.push(join("docs", "visual", project));
  for (const dir of dirs) {
    mkdirSync(dir, { recursive: true });
    await page.screenshot({ path: join(dir, `${name}.png`), fullPage: true });
  }
}

async function observe(page: Page, form: ReturnType<Page["locator"]>, values: { metric: string; value?: string; source: string; date: string; na?: boolean }) {
  await form.getByLabel("Métrica").selectOption(values.metric);
  if (values.value !== undefined) await form.getByLabel("Valor", { exact: true }).fill(values.value);
  if (values.na) await form.getByLabel(/La fuente no da este dato/).check();
  await form.getByLabel("Fuente", { exact: true }).fill(values.source);
  await form.getByLabel("Fecha de la observación").fill(values.date);
  await form.getByLabel("País (opcional)").fill("ES");
  await form.getByLabel("Idioma (opcional)").fill("es");
  await form.getByRole("button", { name: "Registrar observación" }).click();
}

test.describe("competitor flow", () => {
  test.beforeEach(({}, info) => {
    test.skip(info.project.name !== "escritorio-1280", "changes data: runs once");
  });

  test("add, observe, compare honestly, verify, archive and erase with the right roles", async ({ page }, info) => {
    const today = new Date().toISOString().slice(0, 10);
    await signIn(page, "analyst");
    await page.goto(C);
    await expect(page.getByText("Sin competidores", { exact: true })).toBeVisible();
    await screenshot(page, info.project.name, "30-competidores-vacio");

    // Invalid input is refused with a message, nothing is fetched.
    await page.getByLabel("Dominio o dirección del competidor").fill("http://127.0.0.1/admin");
    await page.getByRole("button", { name: "Añadir competidor" }).click();
    await expect(page.locator(".notice-error")).toHaveText(/no una dirección IP/);

    // A URL is reduced to its domain; Enter submits (keyboard only).
    const domain = page.getByLabel("Dominio o dirección del competidor");
    await domain.fill("https://www.Rival-Uno.es/tienda?utm=e2e");
    await page.getByLabel("Nombre (opcional)").fill("Rival Uno");
    await domain.press("Enter");
    await expect(page.locator(".notice-info").first()).toHaveText("Competidor añadido.");
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("Rival Uno");
    // The trusted writer signed the receipt: no "pending signature" notice.
    await expect(page.getByText(/pendiente de firma/)).toHaveCount(0);
    await expect(page.locator(".facts")).toContainText("rival-uno.es");
    await expect(page.getByText("Sin mediciones", { exact: true })).toBeVisible();
    const detail = page.url().split("?")[0];

    // Idempotent: the same site in another spelling opens the existing competitor.
    await page.goto(C);
    await page.getByLabel("Dominio o dirección del competidor").fill("rival-uno.es");
    await page.getByRole("button", { name: "Añadir competidor" }).click();
    await expect(page.locator(".notice-info").first()).toHaveText(/ya estaba en el proyecto/);
    expect(page.url().split("?")[0]).toBe(detail);

    await observe(page, page.locator("form", { has: page.getByRole("button", { name: "Registrar observación" }) }), { metric: "referring-domains", value: "150", source: "Ahrefs", date: today });
    await expect(page.locator(".notice-info").first()).toHaveText("Observación registrada.");
    await expect(page.getByText("Una sola medición disponible en esta serie: todavía no hay evolución.")).toBeVisible();
    await observe(page, page.locator("form", { has: page.getByRole("button", { name: "Registrar observación" }) }), { metric: "backlinks", source: "Semrush", date: today, na: true });
    await expect(page.locator("table").filter({ hasText: "Semrush" }).getByText("No disponible", { exact: true })).toBeVisible();
    await healthy(page, false);
    await screenshot(page, info.project.name, "31-competidor-detalle");

    // Back navigation by keyboard.
    await page.getByRole("link", { name: "← Volver a competidores" }).focus();
    await page.keyboard.press("Enter");
    await expect(page).toHaveURL(new RegExp(`${C}$`));
    await expect(page.getByText(/Datos parciales/)).toBeVisible();
    await expect(page.getByText("Sin medición").first()).toBeVisible();

    // Own-site reading with the same source and market: the comparison becomes valid.
    await page.getByText("Registrar una medición de tu sitio").click();
    await observe(page, page.locator("details form"), { metric: "referring-domains", value: "90", source: "ahrefs", date: today });
    const row = page.locator("table").filter({ hasText: "Dominios de referencia" }).getByRole("row", { name: /Rival Uno/ });
    await expect(row).toContainText("+60");
    await expect(row).toContainText("Pendiente de verificación");
    // The competitor's "not available" reading is shown as such (never 0), and without a reading
    // of the own site there is no comparison.
    const backlinks = page.locator("table").filter({ hasText: "Backlinks" }).getByRole("row", { name: /Rival Uno/ });
    await expect(backlinks).toContainText("No disponible");
    await expect(backlinks).toContainText("Sin mediciones de tu sitio para esta métrica");
    await expect(backlinks).not.toContainText(/\b0\b/);
    await healthy(page, false);
    await screenshot(page, info.project.name, "32-competidores-comparacion");

    // The analyst cannot archive, verify or erase (Core matrix + RLS).
    await page.goto(detail);
    await expect(page.getByRole("button", { name: "Archivar competidor" })).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Verificar" })).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Borrar competidor" })).toHaveCount(0);

    // The client approver verifies a fact, and can do nothing else.
    await signIn(page, "client");
    await page.goto(detail);
    await expect(page.getByLabel("Dominio o dirección del competidor")).toHaveCount(0);
    await page.getByRole("button", { name: "Verificar" }).first().click();
    await expect(page.locator(".notice-info").first()).toHaveText("Observación verificada.");
    await expect(page.getByRole("button", { name: "Archivar competidor" })).toHaveCount(0);

    // The owner archives (history kept), restores and erases another competitor.
    await signIn(page, "owner");
    await page.goto(detail);
    await page.getByRole("button", { name: "Archivar competidor" }).click();
    await expect(page.locator(".notice-info").first()).toHaveText(/Competidor archivado/);
    await expect(page.getByText(/para registrar observaciones, restáuralo/)).toBeVisible();
    await expect(page.locator("table")).toHaveCount(2);
    await page.getByRole("button", { name: "Restaurar competidor" }).click();
    await expect(page.locator(".notice-info").first()).toHaveText("Competidor restaurado.");

    await page.goto(C);
    await page.getByLabel("Dominio o dirección del competidor").fill("rival-dos.es");
    await page.getByRole("button", { name: "Añadir competidor" }).click();
    await page.getByRole("button", { name: "Borrar competidor" }).click();
    // Without the confirmation word the browser blocks the submission: nothing is erased.
    expect(await page.getByLabel("Escribe «borrar» para confirmar").evaluate((el) => (el as HTMLInputElement).validity.valueMissing)).toBe(true);
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("rival-dos.es");
    await page.getByLabel("Escribe «borrar» para confirmar").fill("borrar");
    await page.getByRole("button", { name: "Borrar competidor" }).click();
    await expect(page.locator(".notice-info").first()).toHaveText(/Competidor borrado/);
    await expect(page.getByRole("link", { name: "rival-dos.es" })).toHaveCount(0);
    await expect(page.getByRole("link", { name: "Rival Uno" })).toBeVisible();
  });
});

test("competidores at every width: analyst form, client read-only, other tenant 404, foreign id 404", async ({ page }, info) => {
  const mobile = info.project.name.startsWith("movil");
  await signIn(page, "analyst");
  expect((await page.goto(C))?.status()).toBe(200);
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Competidores");
  await expect(page.getByRole("link", { name: "Competidores" })).toHaveAttribute("aria-current", "page");
  await expect(page.getByText("Fuente no configurada", { exact: true })).toBeVisible();
  await healthy(page, mobile);
  await screenshot(page, info.project.name, "33-competidores-analista");

  expect((await page.goto(`${C}/00000000-0000-4000-8000-000000000001`))?.status()).toBe(404);
  expect((await page.goto(`${C}/no-es-un-id`))?.status()).toBe(404);
  expect((await page.goto(`/proyectos/${OTHER_TENANT}/${OTHER_PROJECT}/competidores`))?.status()).toBe(404);

  await signIn(page, "client");
  await page.goto(C);
  await expect(page.getByText("Tu rol en este proyecto permite consultar los competidores, no añadirlos.")).toBeVisible();
  await expect(page.locator("main input:not([type=hidden]), main select")).toHaveCount(0);
  await healthy(page, mobile);
  await screenshot(page, info.project.name, "34-competidores-cliente");

  await signIn(page, "outsider");
  expect((await page.goto(C))?.status()).toBe(404);
});
