import { mkdirSync } from "node:fs";
import { join } from "node:path";
import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";
import { OTHER_PROJECT, OTHER_TENANT, PROJECT, TENANT, signIn } from "./support";

// F1 dashboard in the browser as fictitious users of the local stack: the agency portfolio,
// the project summary with its module tiles and the honest empty states. Read-only: creates
// no data, so it runs at 360, 390 and 1280 px.
const P = `/proyectos/${TENANT}/${PROJECT}`;

async function healthy(page: Page, mobile: boolean) {
  await page.waitForLoadState("networkidle");
  await expect(page.locator("h1")).toHaveCount(1);
  const axe = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"]).analyze();
  expect(axe.violations.filter((v) => v.impact === "serious" || v.impact === "critical").map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(" ")).join(", ")}`)).toEqual([]);
  const overflow = await page.evaluate(() => ({ scroll: document.documentElement.scrollWidth, width: window.innerWidth }));
  expect(overflow.scroll).toBeLessThanOrEqual(overflow.width);
  if (mobile) {
    const small = await page.$$eval(".btn, button, input:not([type=hidden]), select, .subnav a, .module-tile-link, .nav-link, summary", (els) =>
      els.filter((el) => (el as HTMLElement).offsetParent !== null)
        .map((el) => ({ text: (el.textContent ?? "").trim().slice(0, 30), h: el.getBoundingClientRect().height }))
        .filter((b) => b.h < 43.5));
    expect(small, "touch targets under 44 px").toEqual([]);
  }
}

async function screenshot(page: Page, name: string) {
  const dir = join("test-results", "visual", "f1-dashboard");
  mkdirSync(dir, { recursive: true });
  await page.screenshot({ path: join(dir, `${name}.png`), fullPage: true });
}

test.describe("f1 agency dashboard", () => {
  test("panel shows the authorized portfolio with real identity and module states", async ({ page }, info) => {
    await signIn(page, "owner");
    await page.goto("/panel");
    const card = page.locator(".project-card", { hasText: "Restaurante de ejemplo" });
    await expect(card).toBeVisible();
    await expect(card).toContainText("Agencia de ejemplo");
    await expect(card).toContainText("restaurante.ejemplo.test");
    await expect(card).toContainText("Titular");
    await expect(card.getByRole("link", { name: "Abrir proyecto" })).toHaveAttribute("href", P);
    // Six module chips, each labelled with one of the four honest states; no invented numbers.
    await expect(card.locator(".chip")).toHaveCount(6);
    for (const chip of await card.locator(".chip").all()) {
      await expect(chip).toContainText(/Con datos|Sin datos|Configuración pendiente|No disponible/);
    }
    // The activity line is an honest reading either way: a stack whose audit pipeline exists
    // records the fixture setup itself («Último evento · …»); one without it shows no activity.
    await expect(card.locator(".project-card-activity")).toContainText(/Sin actividad registrada todavía|Último evento ·/);
    await expect(page.getByText("Sin bandeja de aprobaciones todavía")).toHaveCount(0);
    await expect(page.getByText(/Próximamente/)).toHaveCount(0);
    await healthy(page, info.project.name !== "escritorio-1280");
    await screenshot(page, `panel-${info.project.name}`);
  });

  test("client role sees only its own projects", async ({ page }) => {
    await signIn(page, "client");
    await page.goto("/panel");
    await expect(page.locator(".project-card")).toHaveCount(1);
    await expect(page.locator(".project-card")).toContainText("Cliente (aprobación)");
    // The other agency's project never appears, and its URL answers exactly like a missing one.
    await page.goto(`/proyectos/${OTHER_TENANT}/${OTHER_PROJECT}`);
    await expect(page.getByText("La página no existe o no tienes acceso")).toBeVisible();
    await page.goto("/proyectos");
    await expect(page.locator(".cards .card")).toHaveCount(1);
    await expect(page.locator(".cards")).toContainText("Restaurante de ejemplo");
    await expect(page.locator(".cards")).not.toContainText("Despacho de ejemplo");
  });

  test("project summary shows context bar, module tiles and honest empty states", async ({ page }, info) => {
    await signIn(page, "owner");
    await page.goto(P);
    await expect(page.getByRole("navigation", { name: "Migas de pan" })).toContainText("Restaurante de ejemplo");
    await expect(page.locator(".context-meta")).toContainText("Agencia de ejemplo");
    await expect(page.locator(".context-meta")).toContainText("restaurante.ejemplo.test");
    await expect(page.locator(".context-meta")).toContainText("Titular");
    for (const title of ["Análisis SEO", "Medición orgánica", "Competidores", "Contenidos", "GEO e IA", "Informe del proyecto"]) {
      await expect(page.locator(".module-tile", { hasText: title })).toBeVisible();
    }
    // Every signal tile carries one of the four honest states, never a fabricated zero. The
    // content/GEO schema may be installed in this stack or not («Sin datos» vs «No disponible»),
    // and a fresh stack may already hold rows from other specs («Con datos»): all are honest.
    for (const title of ["Análisis SEO", "Medición orgánica", "Competidores", "Contenidos", "GEO e IA"]) {
      await expect(page.locator(".module-tile", { hasText: title })).toContainText(/Con datos|Sin datos|Configuración pendiente|No disponible/);
    }
    // Deterministic for the owner role: the fixture project has no Google property stored, so
    // the measurement tile asks for the association instead of pretending to measure.
    const measurementTile = page.locator(".module-tile", { hasText: "Medición orgánica" });
    await expect(measurementTile).toContainText("Configuración pendiente");
    await expect(measurementTile).toContainText("Sin propiedad de Google asociada");
    await expect(page.getByText(/score|Score/)).toHaveCount(0);
    await healthy(page, info.project.name !== "escritorio-1280");
    await screenshot(page, `resumen-${info.project.name}`);
  });

  test("module tiles and breadcrumbs navigate to real routes and back", async ({ page }) => {
    await signIn(page, "owner");
    await page.goto(P);
    const tiles: [string, string][] = [
      ["Análisis SEO", `${P}/seo`],
      ["Medición orgánica", `${P}/medicion`],
      ["Competidores", `${P}/competidores`],
      ["Informe del proyecto", `${P}/informe`],
    ];
    for (const [name, path] of tiles) {
      await page.locator(".module-tile", { hasText: name }).getByRole("link").first().click();
      await expect(page).toHaveURL(path);
      await page.goBack();
      await expect(page).toHaveURL(P);
    }
    // The breadcrumb reaches the portfolio and returns.
    await page.getByRole("navigation", { name: "Migas de pan" }).getByRole("link", { name: "Panel" }).click();
    await expect(page).toHaveURL(/\/panel$/);
  });

  test("public home leads with the product, not the internals", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByRole("heading", { name: "Tus proyectos SEO/GEO, medidos con fuente y fecha" })).toBeVisible();
    await expect(page.getByText("Qué puedes hacer hoy")).toBeVisible();
    // The internal version status is demoted to a collapsed details.
    await expect(page.locator("details.tech")).not.toHaveAttribute("open", /.*/);
    await expect(page.locator("details.tech .checklist")).toBeHidden();
    await expect(page.getByText("Próximamente")).toHaveCount(0);
    // Visitors never see the workspace navigation, only the public entry.
    await expect(page.getByRole("navigation", { name: "Principal" })).toHaveCount(0);
    await expect(page.getByRole("link", { name: "Acceso" })).toBeVisible();
  });
});
