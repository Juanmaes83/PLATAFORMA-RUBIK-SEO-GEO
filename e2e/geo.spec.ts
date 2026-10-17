import { mkdirSync } from "node:fs";
import { join } from "node:path";
import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";
import { OTHER_PROJECT, OTHER_TENANT, PROJECT, TENANT, signIn } from "./support";

// N2-13 in the browser as fictitious users of the local stack. Every width records its own
// observations (distinct question per width) so screenshots show real states; the review cycle
// (client verifies, owner reviews) runs once on desktop. Fixture project domain:
// restaurante.ejemplo.test (e2e/global-setup.ts). No engine is queried at any point.
const P = `/proyectos/${TENANT}/${PROJECT}`;
const G = `${P}/geo`;
const QUESTION: Record<string, string> = {
  "movil-360": "¿Dónde comer un menú del día en Madrid?",
  "movil-390": "¿Qué restaurante tiene terraza con calefacción en Madrid?",
  "escritorio-1280": "¿Dónde celebrar una cena de empresa en Madrid?",
};
const HOSTILE = "<img src=x onerror=\"document.title='pwned'\"> Recomiendo Bar Luna y Casa Pepe.";

async function healthy(page: Page, mobile: boolean) {
  await page.waitForLoadState("networkidle");
  await expect(page.locator("h1")).toHaveCount(1);
  const axe = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"]).analyze();
  expect(axe.violations.filter((v) => v.impact === "serious" || v.impact === "critical").map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(" ")).join(", ")}`)).toEqual([]);
  const overflow = await page.evaluate(() => ({ scroll: document.documentElement.scrollWidth, width: window.innerWidth }));
  expect(overflow.scroll).toBeLessThanOrEqual(overflow.width);
  if (mobile) {
    const small = await page.$$eval(".btn, button, input:not([type=hidden]), select, textarea, .subnav a, summary", (els) =>
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
const notice = (page: Page) => page.locator(".notice-info").first();

async function observe(page: Page, o: { query: string; engine: string; presence: string; excerpt?: string; sources?: string; entities?: string }) {
  await page.goto(G);
  const form = page.locator("form", { has: page.getByRole("button", { name: "Registrar observación" }) });
  await form.getByLabel("Marca o entidad observada").fill("Restaurante de ejemplo");
  await form.getByLabel("Motor (declarado)").selectOption(o.engine);
  await form.getByLabel("Consulta exacta").fill(o.query);
  await form.getByLabel("Fecha observada").fill(new Date().toISOString().slice(0, 10));
  await form.getByLabel("Idioma (si se conoce)").fill("es");
  await form.getByLabel("País (si se conoce)").fill("ES");
  await form.getByLabel("Presencia de la marca en la respuesta").selectOption(o.presence);
  if (o.excerpt) await form.getByLabel("Fragmento relevante de la respuesta (opcional)").fill(o.excerpt);
  if (o.sources) await form.getByLabel("URLs citadas (opcional)").fill(o.sources);
  if (o.entities) await form.getByLabel("Otras marcas o entidades mencionadas (opcional)").fill(o.entities);
  await form.getByRole("button", { name: "Registrar observación" }).click();
  await expect(notice(page)).toHaveText(/Observación registrada como declarada/);
  return page.url().split("?")[0];
}

test("GEO at every width: empty state, declared observations, escaped text, opportunities, proposal, read-only client, 404s", async ({ page }, info) => {
  const mobile = info.project.name.startsWith("movil");
  const question = QUESTION[info.project.name];

  await signIn(page, "outsider");
  await page.goto(`/proyectos/${OTHER_TENANT}/${OTHER_PROJECT}/geo`);
  await expect(page.getByText("Sin observaciones", { exact: true })).toBeVisible();
  await expect(page.getByText("Consultas automáticas a motores")).toBeVisible();
  await healthy(page, mobile);
  await screenshot(page, info.project.name, "50-geo-vacio");
  expect((await page.goto(G))?.status()).toBe(404);

  await signIn(page, "analyst");
  const first = await observe(page, { query: question, engine: "chatgpt", presence: "absent", excerpt: HOSTILE, entities: "Bar Luna\nCasa Pepe" });
  // Hostile text is shown as text: no element is created and nothing runs.
  await expect(page.locator("blockquote")).toContainText("<img src=x onerror=");
  await expect(page.locator("blockquote img")).toHaveCount(0);
  expect(await page.title()).not.toBe("pwned");
  await expect(page.getByText("Declarada, sin verificar")).toBeVisible();
  await expect(page.getByText(/Mencionada: no · Citada: no/)).toBeVisible();
  await expect(page.getByRole("button", { name: "Marcar como verificada" })).toHaveCount(0);
  await healthy(page, mobile);
  await screenshot(page, info.project.name, "52-geo-observacion");

  await observe(page, { query: question, engine: "perplexity", presence: "mentioned", sources: "https://guia-gastronomica.ejemplo.test/madrid | Guía\nhttps://169.254.169.254/latest | no se visita" });
  await expect(page.getByText("https://169.254.169.254/latest")).toBeVisible();
  await expect(page.getByRole("link", { name: /169\.254/ })).toHaveCount(0);

  await page.goto(G);
  await expect(page.getByRole("heading", { name: `Revisar las fuentes que se citan para «${question}»` })).toBeVisible();
  await expect(page.getByRole("heading", { name: `Hacer citable la información propia sobre «${question}»` })).toBeVisible();
  await expect(page.getByText("Prioridad alta")).toHaveCount(0);
  await expect(page.locator("caption", { hasText: question })).toBeVisible();
  await page.getByRole("navigation", { name: "Filtrar por motor" }).getByRole("link", { name: "Perplexity" }).click();
  await expect(page).toHaveURL(/motor=perplexity/);
  const cards = page.getByRole("region", { name: "Observaciones" }).locator("li.card");
  await expect(cards.first()).toBeVisible();
  for (const text of await cards.allInnerTexts()) expect(text).toContain("Perplexity");
  await page.goto(G);
  await healthy(page, mobile);
  await screenshot(page, info.project.name, "51-geo-panel");

  const card = page.locator("li.card", { has: page.getByRole("heading", { name: `Revisar las fuentes que se citan para «${question}»` }) });
  await card.getByRole("button", { name: "Guardar como propuesta" }).click();
  await expect(notice(page)).toHaveText("Propuesta guardada para revisión.");
  await expect(page.getByText("Hipótesis (no comprobada)")).toBeVisible();
  await expect(page.getByText(/No garantiza aparecer ni ser citado/)).toBeVisible();
  await expect(page.getByRole("button", { name: "Aceptar propuesta" })).toHaveCount(0);
  await healthy(page, mobile);
  await screenshot(page, info.project.name, "53-geo-propuesta");

  expect((await page.goto(`${G}/observaciones/00000000-0000-4000-8000-000000000001`))?.status()).toBe(404);
  expect((await page.goto(`${G}/propuestas/no-es-un-id`))?.status()).toBe(404);
  expect((await page.goto(`/proyectos/${OTHER_TENANT}/${OTHER_PROJECT}/geo`))?.status()).toBe(404);

  await signIn(page, "client");
  await page.goto(G);
  await expect(page.getByText("Tu rol en este proyecto permite consultar las observaciones, no registrarlas.")).toBeVisible();
  await expect(page.getByRole("button", { name: "Guardar como propuesta" })).toHaveCount(0);
  await page.goto(first);
  await expect(page.getByRole("button", { name: "Marcar como verificada" })).toBeVisible();
  await healthy(page, mobile);
  await screenshot(page, info.project.name, "54-geo-cliente");
});

test.describe("GEO review", () => {
  test.beforeEach(({}, info) => {
    test.skip(info.project.name !== "escritorio-1280", "changes data: runs once");
  });

  test("client verifies (attributed), owner accepts and closes a proposal; a correction supersedes", async ({ page }, info) => {
    const question = "¿Cuál es el mejor arroz del barrio?";
    await signIn(page, "analyst");
    const obsUrl = await observe(page, { query: question, engine: "gemini", presence: "absent" });
    await page.locator("summary", { hasText: "Registrar una corrección" }).click();
    const fix = page.locator("form", { has: page.getByRole("button", { name: "Registrar corrección" }) });
    await fix.getByLabel("Fecha observada").fill(new Date().toISOString().slice(0, 10));
    await fix.getByLabel("Método de obtención").selectOption("screenshot");
    await fix.getByLabel("Presencia de la marca en la respuesta").selectOption("cited");
    await fix.getByLabel("URLs citadas (opcional)").fill("https://restaurante.ejemplo.test/arroces | Arroces");
    await fix.getByRole("button", { name: "Registrar corrección" }).click();
    await expect(notice(page)).toHaveText(/Observación registrada/);
    await expect(page.getByText("Dominio del proyecto")).toBeVisible();
    const corrected = page.url().split("?")[0];
    await page.goto(obsUrl);
    await expect(page.getByText(/fue corregida por/)).toBeVisible();
    await page.goto(G);
    await expect(page.getByRole("heading", { name: `Mantener la página citada para «${question}»` })).toBeVisible();
    await page.locator("li.card", { has: page.getByRole("heading", { name: `Mantener la página citada para «${question}»` }) })
      .getByRole("button", { name: "Guardar como propuesta" }).click();
    await expect(notice(page)).toHaveText("Propuesta guardada para revisión.");
    await expect(page).toHaveURL(/\/geo\/propuestas\//);
    const proposal = page.url().split("?")[0];

    await signIn(page, "client");
    await page.goto(corrected);
    await page.getByRole("button", { name: "Marcar como verificada" }).click();
    await expect(notice(page)).toHaveText(/Observación verificada/);
    await expect(page.locator(".facts")).toContainText(/Verificada · tú ·/);
    await page.goto(proposal);
    await expect(page.getByRole("button", { name: "Aceptar propuesta" })).toHaveCount(0);

    await signIn(page, "owner");
    await page.goto(proposal);
    await page.getByRole("button", { name: "Aceptar propuesta" }).click();
    await expect(notice(page)).toHaveText("Propuesta aceptada.");
    await expect(page.locator(".facts")).toContainText(/Aceptada · tú ·/);
    await page.getByRole("button", { name: "Marcar como hecha" }).click();
    await expect(notice(page)).toHaveText("Propuesta marcada como hecha.");
    await expect(page.getByText(/Crear una oportunidad o un brief desde aquí queda pendiente/)).toBeVisible();
    await healthy(page, false);
    await screenshot(page, info.project.name, "55-geo-propuesta-revisada");
  });
});
