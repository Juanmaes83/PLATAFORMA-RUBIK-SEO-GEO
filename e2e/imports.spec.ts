import { mkdirSync } from "node:fs";
import { join } from "node:path";
import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";
import { OTHER_PROJECT, OTHER_TENANT, PROJECT, TENANT, signIn } from "./support";

// CORE-9.3 in the browser (ADR 0005): import → store → open → export → erase, as fictitious
// users of the local stack. The flow runs once (desktop project) because it changes data; the
// list page is also checked at every width by visual.spec.ts.
const P = `/proyectos/${TENANT}/${PROJECT}`;
const file = (label: string, scope = { tenantId: TENANT, projectId: PROJECT }) => ({
  name: "auditoria.json",
  mimeType: "application/json",
  buffer: Buffer.from(JSON.stringify({
    format: "rubik-import-v1",
    scope,
    source: { kind: "audit", label, tool: "revisión manual" },
    capturedAt: "2026-10-07T09:00:00+02:00",
    findings: [
      { url: "https://restaurante.ejemplo.test/carta", ruleId: "title-duplicate-brand", severity: "low", title: "Marca duplicada en el título", observation: "El título repite la marca.", proposal: "Quitar la marca del título." },
      { url: "https://restaurante.ejemplo.test/", ruleId: "meta-noindex", severity: "high", title: "Página en noindex", observation: "La portada declara noindex." },
      { url: "no-es-una-url", ruleId: "x", severity: "low", title: "Fila no válida", observation: "URL incorrecta." },
    ],
  })),
});

async function upload(page: Page, payload: ReturnType<typeof file>) {
  await page.goto(`${P}/importaciones`);
  await page.getByLabel(/Fichero JSON/).setInputFiles(payload);
  await page.getByRole("button", { name: "Importar" }).click();
}

async function accessible(page: Page) {
  // Same settling as visual.spec.ts: after a Server Action redirect the head may still stream.
  await page.waitForLoadState("networkidle");
  await expect(page).toHaveTitle("Plataforma Rubik SEO/GEO");
  const axe = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"]).analyze();
  expect(axe.violations.filter((v) => v.impact === "serious" || v.impact === "critical").map((v) => v.id)).toEqual([]);
  const overflow = await page.evaluate(() => ({ scroll: document.documentElement.scrollWidth, width: window.innerWidth }));
  expect(overflow.scroll).toBeLessThanOrEqual(overflow.width);
}

// Same convention as visual.spec.ts: test-results/visual always, docs/visual on request.
async function screenshot(page: Page, project: string, name: string) {
  const dirs = [join("test-results", "visual", project)];
  if (process.env.UPDATE_VISUAL_EVIDENCE === "1") dirs.push(join("docs", "visual", project));
  for (const dir of dirs) {
    mkdirSync(dir, { recursive: true });
    await page.screenshot({ path: join(dir, `${name}.png`), fullPage: true });
  }
}

test.describe("manual import flow", () => {
  test.beforeEach(({}, info) => {
    test.skip(info.project.name !== "escritorio-1280", "changes data: runs once");
  });

  test("an analyst imports a partial file, opens it, and a duplicate or foreign file is not stored twice", async ({ page }, info) => {
    await signIn(page, "analyst");
    const label = `Auditoría e2e ${Date.now()}`;
    await upload(page, file(label));
    await expect(page).toHaveURL(new RegExp(`${P}/importaciones/[0-9a-f-]{36}\\?importada=partial$`));
    await expect(page.getByRole("heading", { level: 1 })).toHaveText(label);
    await expect(page.locator("main").getByRole("status")).toHaveText("Importación guardada como parcial: revisa las filas no válidas.");
    await expect(page.getByRole("heading", { name: "Hallazgos (2)" })).toBeVisible();
    await expect(page.getByText("Marca duplicada en el título")).toBeVisible();
    await expect(page.getByText("Fila 2 · url · Valor no válido")).toBeVisible();
    await expect(page.getByText("no-es-una-url")).toHaveCount(0); // a rejected value is never shown
    await expect(page.getByText(/Datos declarados por importación manual/)).toBeVisible();
    await expect(page.getByRole("heading", { name: "Borrar esta importación" })).toHaveCount(0); // analyst: no delete-data
    await accessible(page);
    await screenshot(page, info.project.name, "17-importacion-detalle");
    const detail = page.url().split("?")[0];

    await upload(page, file(label));
    await expect(page).toHaveURL(`${detail}?aviso=duplicado`);
    await expect(page.locator("main").getByRole("status")).toHaveText("Este fichero ya estaba importado; se muestra la importación existente.");

    await upload(page, file("Otra", { tenantId: OTHER_TENANT, projectId: OTHER_PROJECT }));
    await expect(page.locator("main").getByRole("alert")).toHaveText("El fichero declara otra organización u otro proyecto. No se ha guardado nada.");
    await expect(page.locator("main .card h3", { hasText: label })).toHaveCount(1);
  });

  test("the client approver reads imports but has no import form; another tenant gets 404", async ({ page }) => {
    await signIn(page, "client");
    await page.goto(`${P}/importaciones`);
    await expect(page.getByText("Tu rol en este proyecto permite consultar las importaciones, no crearlas.")).toBeVisible();
    await expect(page.locator("main input[type=file]")).toHaveCount(0);

    await signIn(page, "outsider");
    expect((await page.goto(`${P}/importaciones`))?.status()).toBe(404);
    expect((await page.request.get(`${P}/exportar`)).status()).toBe(404);
  });

  test("the owner exports the project and erases an import; the analyst cannot export", async ({ page }) => {
    await signIn(page, "analyst");
    expect((await page.request.get(`${P}/exportar`)).status()).toBe(404);

    await signIn(page, "owner");
    const response = await page.request.get(`${P}/exportar`);
    expect(response.status()).toBe(200);
    expect(response.headers()["content-disposition"]).toMatch(/^attachment; filename="agencia-ejemplo-restaurante-ejemplo-\d{4}-\d{2}-\d{2}\.json"$/);
    const exported = await response.json();
    expect(exported.format).toBe("rubik-project-export-v1");
    expect(exported.imports.length).toBeGreaterThan(0);
    expect(exported.audit.verification.valid).toBe(true);
    expect(exported.audit.rows.map((r: { action: string }) => r.action)).toContain("import.file");

    await page.goto(`${P}/importaciones`);
    await page.locator("main .card h3 a").first().click();
    await page.getByLabel("Escribe «borrar» para confirmar").fill("no");
    await page.getByRole("button", { name: "Borrar importación" }).click();
    await expect(page.locator("main").getByRole("alert")).toHaveText("Para borrar, escribe «borrar» en la casilla de confirmación.");
    await page.getByLabel("Escribe «borrar» para confirmar").fill("borrar");
    await page.getByRole("button", { name: "Borrar importación" }).click();
    await expect(page).toHaveURL(`${P}/importaciones?borrada=1`);
    await expect(page.locator("main").getByRole("status")).toHaveText("Importación borrada y registrada en la auditoría.");
  });
});
