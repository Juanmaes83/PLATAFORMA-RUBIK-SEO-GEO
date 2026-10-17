import { mkdirSync } from "node:fs";
import { join } from "node:path";
import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Locator, type Page } from "@playwright/test";
import { OTHER_PROJECT, OTHER_TENANT, PROJECT, TENANT, signIn } from "./support";

// N2-12 in the browser as fictitious users of the local stack. Every width runs a tour that
// creates its own data (distinct topic per width) so the screenshots show real states; the full
// review cycle (analyst → client → owner) runs once on desktop. Fixture project domain:
// restaurante.ejemplo.test (e2e/global-setup.ts).
const P = `/proyectos/${TENANT}/${PROJECT}`;
const C = `${P}/contenidos`;
const TOPIC: Record<string, string> = { "movil-360": "Menú del día en Madrid", "movil-390": "Terraza con calefacción", "escritorio-1280": "Cenas de empresa" };

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

async function newOpportunity(page: Page, o: { topic: string; type?: string; intent?: string; pageKind?: string; pageUrl?: string; priority?: string; reason?: string; cluster?: string; role?: string; rationale?: string }) {
  await page.goto(C);
  const form = page.locator("form", { has: page.getByRole("button", { name: "Crear oportunidad" }) });
  await form.getByLabel("Tema").fill(o.topic);
  await form.getByLabel("Tipo de oportunidad").selectOption(o.type ?? "create");
  await form.getByLabel("Intención de búsqueda (declarada)").selectOption(o.intent ?? "local");
  await form.getByLabel("País (opcional)").fill("ES");
  await form.getByLabel("Página", { exact: true }).selectOption(o.pageKind ?? "proposed");
  if (o.pageUrl) await form.getByLabel(/Dirección de la página/).fill(o.pageUrl);
  await form.getByLabel("Justificación").fill(o.rationale ?? "El cliente recibe consultas sobre este tema y no hay página que las responda.");
  if (o.priority) {
    await form.getByLabel("Prioridad propuesta").selectOption(o.priority);
    await form.getByLabel("Motivo de la prioridad").fill(o.reason ?? "Propuesta del analista");
  }
  if (o.cluster) await form.getByLabel("Clúster (opcional)").selectOption({ label: o.cluster });
  if (o.role) await form.getByLabel("Papel en el clúster").selectOption(o.role);
  await form.getByRole("button", { name: "Crear oportunidad" }).click();
  await expect(notice(page)).toHaveText("Oportunidad creada.");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(o.topic);
  return page.url().split("?")[0];
}

async function fillBrief(form: Locator, topic: string) {
  await form.getByLabel("Objetivo", { exact: true }).fill(`Captar reservas para «${topic}»`);
  await form.getByLabel("Audiencia", { exact: true }).fill("Clientes de la zona que buscan opciones para hoy");
  await form.getByLabel("Estructura (H1/H2/H3)", { exact: true }).fill(`# ${topic}\n## Qué incluye\n### Precio y horario\n## Cómo reservar`);
  await form.getByLabel("Preguntas que debe responder", { exact: true }).fill("¿Cuánto cuesta?\n¿Hay opciones sin gluten?");
  await form.getByLabel("Enlaces internos candidatos", { exact: true }).fill("/carta | Carta de temporada");
  await form.getByLabel("Riesgos y afirmaciones por verificar", { exact: true }).fill("Confirmar precios con el cliente antes de redactar.");
  await form.getByLabel("Responsable", { exact: true }).fill("Redacción");
}

test("contenidos at every width: empty state, cluster → opportunity → evidence → brief, read-only client, 404s", async ({ page }, info) => {
  const mobile = info.project.name.startsWith("movil");
  const topic = TOPIC[info.project.name];
  const cluster = `Clúster ${topic}`;

  // Honest empty state (the outsider's own project never has content).
  await signIn(page, "outsider");
  await page.goto(`/proyectos/${OTHER_TENANT}/${OTHER_PROJECT}/contenidos`);
  await expect(page.getByText("Sin oportunidades", { exact: true })).toBeVisible();
  await expect(page.getByText("Sin clústeres", { exact: true })).toBeVisible();
  await expect(page.getByText("Perfil de empresa, reseñas y directorios: no conectados")).toBeVisible();
  await healthy(page, mobile);
  await screenshot(page, info.project.name, "40-contenidos-vacio");
  expect((await page.goto(C))?.status()).toBe(404);

  await signIn(page, "analyst");
  await page.goto(C);
  await expect(page.getByRole("link", { name: "Contenidos" })).toHaveAttribute("aria-current", "page");
  await page.locator("summary", { hasText: "Crear un clúster" }).click();
  await page.getByLabel("Nombre del clúster").fill(cluster);
  await page.getByLabel("Tema principal").fill(topic.toLowerCase());
  await page.getByRole("button", { name: "Crear clúster" }).click();
  await expect(notice(page)).toHaveText("Clúster creado.");
  const clusterUrl = page.url().split("?")[0];

  const opportunity = await newOpportunity(page, { topic, priority: "high", reason: "El cliente lo pide a menudo", cluster, role: "pillar" });
  await expect(page.locator(".page-head")).toContainText("basada en hipótesis");
  await expect(page.getByText("Volumen, dificultad, posiciones y CTR: no disponibles")).toBeVisible();
  await page.locator("summary", { hasText: "Añadir evidencia" }).click();
  await page.getByLabel("Tipo de evidencia").selectOption("manual-source");
  await page.getByLabel("Título (fuente consultada o propuesta)").fill("Revisión manual de resultados de búsqueda");
  await page.getByLabel("Detalle").fill("Los tres primeros resultados son directorios, sin carta ni precios.");
  await page.getByLabel("Fecha de consulta (fuente consultada)").fill(new Date().toISOString().slice(0, 10));
  await page.getByRole("button", { name: "Añadir evidencia" }).click();
  await expect(notice(page)).toHaveText("Evidencia añadida.");
  await expect(page.locator(".page-head")).toContainText("con fuente declarada");
  await expect(page.getByText("Fuente no verificada por la plataforma")).toBeVisible();
  await expect(page.getByText(/pendiente de firma/)).toHaveCount(0);

  await page.getByRole("button", { name: "Preparar brief" }).click();
  await expect(notice(page)).toHaveText("Brief creado en borrador.");
  await expect(page.getByText("Falta para enviarlo a revisión")).toBeVisible();
  await fillBrief(page.locator("form", { has: page.getByRole("button", { name: "Guardar brief" }) }), topic);
  await page.getByRole("button", { name: "Guardar brief" }).click();
  await expect(notice(page)).toHaveText("Brief guardado.");
  await expect(page.getByText("Un brief es una propuesta editorial")).toBeVisible();
  await expect(page.getByRole("button", { name: "Enviar a revisión" })).toBeVisible();
  await healthy(page, mobile);
  await screenshot(page, info.project.name, "43-brief-borrador");

  await page.goto(opportunity);
  await healthy(page, mobile);
  await screenshot(page, info.project.name, "42-oportunidad");
  await page.goto(clusterUrl);
  await expect(page.getByText("Posibles páginas pilar")).toBeVisible();
  await expect(page.getByRole("link", { name: topic, exact: true })).toBeVisible();
  await healthy(page, mobile);
  await screenshot(page, info.project.name, "44-cluster");
  await page.goto(C);
  await expect(page.getByRole("link", { name: topic, exact: true })).toBeVisible();
  await healthy(page, mobile);
  await screenshot(page, info.project.name, "41-contenidos-analista");

  expect((await page.goto(`${C}/oportunidades/00000000-0000-4000-8000-000000000001`))?.status()).toBe(404);
  expect((await page.goto(`${C}/oportunidades/no-es-un-id/brief`))?.status()).toBe(404);
  expect((await page.goto(`${C}/clusteres/00000000-0000-4000-8000-000000000001`))?.status()).toBe(404);
  expect((await page.goto(`/proyectos/${OTHER_TENANT}/${OTHER_PROJECT}/contenidos`))?.status()).toBe(404);

  await signIn(page, "client");
  await page.goto(`${opportunity}/brief`);
  await expect(page.getByRole("button", { name: /Aprobar|Enviar a revisión|Guardar brief/ })).toHaveCount(0);
  await expect(page.locator("main input:not([type=hidden]), main select, main textarea")).toHaveCount(0);
  await page.goto(C);
  await expect(page.getByText("Tu rol en este proyecto permite consultar las oportunidades, no proponerlas.")).toBeVisible();
  await healthy(page, mobile);
  await screenshot(page, info.project.name, "45-contenidos-cliente");
});

test.describe("editorial review", () => {
  test.beforeEach(({}, info) => {
    test.skip(info.project.name !== "escritorio-1280", "changes data: runs once");
  });

  test("analyst submits, client cannot act, owner approves (attributed), archives and restores; overlaps and erase", async ({ page }, info) => {
    await signIn(page, "analyst");
    const existing = await newOpportunity(page, { topic: "Carta de temporada", type: "improve", intent: "informational", pageKind: "existing",
      pageUrl: "https://restaurante.ejemplo.test/carta" });
    // A page outside the project's domain is refused.
    await page.goto(C);
    const form = page.locator("form", { has: page.getByRole("button", { name: "Crear oportunidad" }) });
    await form.getByLabel("Tema").fill("Página ajena");
    await form.getByLabel("Tipo de oportunidad").selectOption("update");
    await form.getByLabel("Página", { exact: true }).selectOption("existing");
    await form.getByLabel(/Dirección de la página/).fill("https://otro-sitio.es/carta");
    await form.getByLabel("Justificación").fill("x");
    await form.getByRole("button", { name: "Crear oportunidad" }).click();
    await expect(page.locator(".notice-error")).toHaveText("La página debe pertenecer al dominio del proyecto.");
    // A very similar topic in the same market is flagged as a POSSIBLE overlap only.
    const twin = await newOpportunity(page, { topic: "La carta de temporada", type: "research", intent: "informational" });
    await page.goto(C);
    await expect(page.getByText("Posible solapamiento: temas muy parecidos")).toBeVisible();
    await expect(page.getByText(/No es una canibalización confirmada/)).toBeVisible();

    await page.goto(existing);
    await page.getByRole("button", { name: "Preparar brief" }).click();
    await fillBrief(page.locator("form", { has: page.getByRole("button", { name: "Guardar brief" }) }), "Carta de temporada");
    await page.getByRole("button", { name: "Guardar brief" }).click();
    await page.getByRole("button", { name: "Enviar a revisión" }).click();
    await expect(notice(page)).toHaveText("Brief enviado a revisión.");
    await expect(page.getByRole("button", { name: "Aprobar brief" })).toHaveCount(0);
    await expect(page.getByText(/lo aprueba o lo devuelve una persona con permiso de revisión/)).toBeVisible();
    await expect(page.getByRole("button", { name: "Guardar brief" })).toHaveCount(0);
    const brief = page.url().split("?")[0];

    await signIn(page, "client");
    await page.goto(brief);
    await expect(page.getByRole("button", { name: /Aprobar brief|Devolver a borrador|Archivar/ })).toHaveCount(0);

    await signIn(page, "owner");
    await page.goto(brief);
    await page.getByLabel("Nota para devolverlo a borrador").fill("Añadir el horario de la carta");
    await page.getByRole("button", { name: "Devolver a borrador" }).click();
    await expect(notice(page)).toHaveText("Brief devuelto a borrador con una nota de revisión.");
    await expect(page.locator(".facts").first()).toContainText("Añadir el horario de la carta");
    await page.getByRole("button", { name: "Enviar a revisión" }).click();
    await page.getByRole("button", { name: "Aprobar brief" }).click();
    await expect(notice(page)).toHaveText(/Brief aprobado/);
    await expect(page.locator(".facts").first()).toContainText(/Aprobado\s*tú ·/);
    await expect(page.getByRole("button", { name: "Guardar brief" })).toHaveCount(0);
    await healthy(page, false);
    await screenshot(page, info.project.name, "46-brief-aprobado");
    await page.getByRole("button", { name: "Archivar" }).click();
    await expect(notice(page)).toHaveText("Brief archivado.");
    await expect(page.locator(".facts").first()).toContainText("Aprobado");
    await page.getByRole("button", { name: "Restaurar a borrador" }).click();
    await expect(notice(page)).toHaveText("Brief restaurado a borrador.");

    await page.goto(twin);
    await page.getByLabel("Escribe «borrar» para confirmar").fill("borrar");
    await page.getByRole("button", { name: "Borrar oportunidad" }).click();
    await expect(notice(page)).toHaveText(/Oportunidad borrada/);
    await expect(page.getByText("Posible solapamiento: temas muy parecidos")).toHaveCount(0);
  });
});
