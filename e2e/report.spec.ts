import { mkdirSync } from "node:fs";
import { join } from "node:path";
import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";
import { fixtureScope } from "./fixture-scope";
import { fixtureClients, recordFixture } from "./fixtures";
import { consentedMembership } from "../tests/fixtures/consented-membership";
import { OTHER_PROJECT, OTHER_TENANT, PROJECT, TENANT, TEST_PASSPHRASE, USERS, signIn } from "./support";

// N2-14 manual project report on the LOCAL stack with fictitious data. A dedicated account
// ("reporter") owns its own organization with two projects: one with declared data in every N2
// module the environment accredits, one with nothing. "report-guest" is an analyst of the empty
// project only, to prove isolation between projects of the same organization. The shared
// accounts' dashboards stay untouched. Contenidos/GEO are only seeded and expected when this
// stack has their migrations.
const contentGeo = process.env.RUBIK_N2_CONTENT_GEO_SCHEMA_AVAILABLE === "true";
const prefix = fixtureScope().prefix;
const ORG = `${prefix}-informe`;
const WITH_DATA = "bodega-con-datos";
const EMPTY = "bodega-sin-datos";
const path = (slug: string) => `/proyectos/${ORG}/${slug}/informe`;

test.beforeAll(async () => {
  const { client } = fixtureClients();
  const [reporter, guest] = [client(), client()];
  for (const [c, email] of [[reporter, USERS.reporter], [guest, USERS["report-guest"]]] as const) {
    const signedIn = await c.auth.signInWithPassword({ email, password: TEST_PASSPHRASE });
    if (signedIn.error) throw signedIn.error;
  }
  // beforeAll runs once per viewport project; the rows are created once per run.
  if ((await reporter.from("organizations").select("id").eq("slug", ORG).maybeSingle()).data) return;
  const must = async (q: PromiseLike<{ error: unknown }>) => { const r = await q; if (r.error) throw r.error; };
  await must(reporter.from("organizations").insert({ slug: ORG, name: "Bodegas ficticias" }));
  const org = (await reporter.from("organizations").select("id,slug,created_by").eq("slug", ORG).single()).data!;
  recordFixture({ kind: "organization", value: org });
  for (const [slug, name, domain] of [[WITH_DATA, "Bodega ficticia con datos", "bodega-con-datos.ejemplo.test"], [EMPTY, "Bodega ficticia sin datos", "bodega-sin-datos.ejemplo.test"]]) {
    await must(reporter.from("projects").insert({ organization_id: org.id, slug, name, domain }));
    // Created by this run inside its own recorded organization: recorded as such for cleanup.
    const created = (await reporter.from("projects").select("id,slug,organization_id").eq("organization_id", org.id).eq("slug", slug).single()).data!;
    recordFixture({ kind: "project", value: created });
  }
  const projectOf = async (slug: string) => (await reporter.from("projects").select("id, organization_id").eq("organization_id", org.id).eq("slug", slug).single()).data!;
  await consentedMembership(reporter, guest, (await projectOf(EMPTY)).id, "analyst");
  const project = await projectOf(WITH_DATA);
  const s = { project_id: project.id, organization_id: project.organization_id };
  await must(reporter.from("seo_keywords").insert({ ...s, phrase: "vino de la casa", language_code: "es", country_code: "ES", intent: "commercial" }));
  await must(reporter.from("competitors").insert({ ...s, domain: "bodega-rival.ejemplo.test", name: "Bodega rival (ficticia)" }));
  if (!contentGeo) return;
  await must(reporter.from("content_clusters").insert({ ...s, name: "Carta de vinos", main_topic: "vinos" }));
  const cluster = (await reporter.from("content_clusters").select("id").eq("project_id", project.id).single()).data!;
  await must(reporter.from("content_opportunities").insert({ ...s, cluster_id: cluster.id, cluster_role: "pillar", topic: "Maridajes", search_intent: "informational",
    market_language: "es", page_kind: "proposed", opportunity_type: "create", rationale: "No hay página de maridajes.", priority: "medium", priority_reason: "Hipótesis del equipo" }));
  const opportunity = (await reporter.from("content_opportunities").select("id").eq("project_id", project.id).single()).data!;
  await must(reporter.from("content_evidence").insert({ ...s, opportunity_id: opportunity.id, kind: "manual-source", title: "Guía consultada (ficticia)",
    source_url: "https://fuente.ejemplo.test/guia", source_date: "2026-10-01" }));
  await must(reporter.from("geo_observations").insert({ ...s, entity_name: "Bodega ficticia", engine: "perplexity", query_text: "¿Dónde comer con vino de la casa?",
    observed_on: "2026-10-16", method: "manual-copy", presence: "absent" }));
});

const sectionOf = (page: Page, title: string) => page.locator("section.report-section").filter({ has: page.getByRole("heading", { level: 2, name: title }) });

async function screenshot(page: Page, project: string, name: string) {
  for (const dir of [join("test-results", "visual", project), ...(process.env.UPDATE_VISUAL_EVIDENCE === "1" ? [join("docs", "visual", project)] : [])]) {
    mkdirSync(dir, { recursive: true });
    await page.screenshot({ path: join(dir, `${name}.png`), fullPage: true, style: ".user-name { visibility: hidden !important; }" });
  }
}

async function readable(page: Page) {
  const size = await page.evaluate(() => ({ scroll: document.documentElement.scrollWidth, width: window.innerWidth }));
  expect(size.scroll).toBeLessThanOrEqual(size.width);
  const axe = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"]).analyze();
  expect(axe.violations.filter((v) => v.impact === "serious" || v.impact === "critical").map((v) => v.id)).toEqual([]);
}

test("report with declared data: each source with its state and nature, no provider request, printable", async ({ page }, info) => {
  const external: string[] = [];
  page.on("request", (r) => { const host = new URL(r.url()).hostname; if (host !== "localhost" && host !== "127.0.0.1") external.push(host); });
  await signIn(page, "reporter");
  await page.goto(`/proyectos/${ORG}/${WITH_DATA}`);
  await page.getByRole("navigation", { name: "Secciones del proyecto" }).getByRole("link", { name: "Informe del proyecto", exact: true }).click();
  await expect(page).toHaveURL(new RegExp(`${path(WITH_DATA)}$`));
  await expect(page.getByRole("heading", { level: 1, name: "Informe del proyecto" })).toBeVisible();
  await expect(page.getByText("Bodega ficticia con datos").first()).toBeVisible();

  const keywords = sectionOf(page, "Palabras clave");
  await expect(keywords.getByText("Disponible", { exact: true })).toBeVisible();
  await expect(keywords.getByText("Declarado", { exact: true })).toBeVisible();
  await expect(sectionOf(page, "Competidores").getByText("Disponible", { exact: true })).toBeVisible();
  for (const title of ["SEO técnico", "Hallazgos importados", "Medición orgánica"]) {
    await expect(sectionOf(page, title).getByText("Sin datos", { exact: true })).toBeVisible();
    await expect(sectionOf(page, title).getByText(/No equivale a «sin problemas» ni a valores cero/)).toBeVisible();
  }
  if (contentGeo) {
    const content = sectionOf(page, "Contenidos");
    await expect(content.getByText("Disponible", { exact: true })).toBeVisible();
    await expect(content.getByText("Con fuente declarada: 1")).toBeVisible();
    await expect(sectionOf(page, "GEO e IA").getByText("No aparece: 1")).toBeVisible();
    await expect(sectionOf(page, "GEO e IA").getByText("Declarado", { exact: true })).toBeVisible();
  } else {
    for (const title of ["Contenidos", "GEO e IA"]) {
      await expect(sectionOf(page, title).getByText("No disponible", { exact: true })).toBeVisible();
      await expect(sectionOf(page, title).getByText(/no está acreditado en este entorno: no se ha consultado/)).toBeVisible();
    }
    await expect(page.getByText("Este informe no está completo.")).toBeVisible();
  }
  await expect(page.getByText("No es una instantánea transaccional")).toBeVisible();
  const print = page.getByRole("button", { name: "Imprimir o guardar como PDF" });
  await page.evaluate(() => { (window as unknown as { printed: number }).printed = 0; window.print = () => { (window as unknown as { printed: number }).printed++; }; });
  await print.click();
  expect(await page.evaluate(() => (window as unknown as { printed: number }).printed)).toBe(1);
  await expect(page.locator("main form")).toHaveCount(0);
  await readable(page);
  await screenshot(page, info.project.name, `62-informe-con-datos${contentGeo ? "" : "-sin-contenidos-geo"}`);

  await page.emulateMedia({ media: "print" });
  await expect(page.getByRole("navigation", { name: "Secciones del proyecto" })).toBeHidden();
  await expect(page.getByRole("button", { name: "Imprimir o guardar como PDF" })).toBeHidden();
  await expect(page.getByRole("heading", { level: 2, name: "Límites de este informe" })).toBeVisible();
  if (info.project.name === "escritorio-1280") await screenshot(page, info.project.name, "64-informe-impresion");
  await page.emulateMedia({ media: "screen" });
  expect(external).toEqual([]);
});

test("report of a project without data shows every read source as empty, never as zero", async ({ page }, info) => {
  await signIn(page, "reporter");
  await page.goto(path(EMPTY));
  for (const title of ["SEO técnico", "Hallazgos importados", "Palabras clave", "Medición orgánica", "Competidores", ...(contentGeo ? ["Contenidos", "GEO e IA"] : [])]) {
    const section = sectionOf(page, title);
    await expect(section.getByText("Sin datos", { exact: true })).toBeVisible();
    await expect(section.locator("dl.facts")).toHaveCount(0);
  }
  await readable(page);
  await screenshot(page, info.project.name, `63-informe-sin-datos${contentGeo ? "" : "-sin-contenidos-geo"}`);
});

test("only members see a report: other organizations, other projects and non-members get 404 with nothing of the project", async ({ page }, info) => {
  test.skip(info.project.name !== "escritorio-1280", "HTTP status is viewport-independent");
  await signIn(page, "reporter");
  expect((await page.goto(`/proyectos/${OTHER_TENANT}/${OTHER_PROJECT}/informe`))?.status()).toBe(404);
  expect((await page.goto(`/proyectos/${TENANT}/${PROJECT}/informe`))?.status()).toBe(404);
  for (const user of ["owner", "outsider"] as const) {
    await signIn(page, user);
    expect((await page.goto(path(WITH_DATA)))?.status()).toBe(404);
    await expect(page.getByText("Bodega ficticia con datos")).toHaveCount(0);
  }
  // Same organization, another project: the guest is an analyst of the empty project only.
  await signIn(page, "report-guest");
  expect((await page.goto(path(WITH_DATA)))?.status()).toBe(404);
  await expect(page.getByText("vino de la casa")).toHaveCount(0);
  expect((await page.goto(path(EMPTY)))?.status()).toBe(200);
  await expect(page.getByRole("heading", { level: 1, name: "Informe del proyecto" })).toBeVisible();
  await signIn(page, "newcomer");
  expect((await page.goto(`/proyectos/${TENANT}/${PROJECT}/informe`))?.status()).toBe(404);
});

test("a client-approver reads the report without any write control", async ({ page }, info) => {
  test.skip(info.project.name !== "escritorio-1280", "role check is viewport-independent");
  await signIn(page, "client");
  await page.goto(`/proyectos/${TENANT}/${PROJECT}/informe`);
  await expect(page.getByRole("heading", { level: 1, name: "Informe del proyecto" })).toBeVisible();
  await expect(page.locator("main").locator("form, input, textarea, select")).toHaveCount(0);
  await expect(page.locator("main").getByRole("button")).toHaveText(["Imprimir o guardar como PDF"]);
});
