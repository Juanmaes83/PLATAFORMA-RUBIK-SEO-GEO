// Ad-hoc verification of the F1 demo running on http://localhost:3231 (npm run demo:f1).
// Logs in as the three demo users, exercises the main flows and saves screenshots to
// test-results/visual/f1-a1/ (git-ignored). The demo passphrase is read from
// RUBIK_DEMO_PASSPHRASE and never written to disk.
import { mkdirSync } from "node:fs";
import { chromium } from "@playwright/test";

const BASE = process.env.RUBIK_DEMO_URL ?? "http://localhost:3231";
const PASS = process.env.RUBIK_DEMO_PASSPHRASE;
if (!PASS) throw new Error("Define RUBIK_DEMO_PASSPHRASE (la imprime npm run demo:f1).");

const OUT = "test-results/visual/f1-a1";
mkdirSync(OUT, { recursive: true });

const WIDTHS = [360, 390, 768, 1280, 1600];
const failures = [];
const check = (name, ok, detail = "") => {
  if (!ok) failures.push(`${name}: ${detail}`);
  console.log(`${ok ? "PASS" : "FAIL"} ${name}${detail ? ` — ${detail}` : ""}`);
};

async function shot(page, name) {
  await page.waitForLoadState("networkidle");
  await page.screenshot({ path: `${OUT}/${name}.png`, fullPage: true });
}

async function noHorizontalOverflow(page, name) {
  const { scroll, width } = await page.evaluate(() => ({
    scroll: document.documentElement.scrollWidth, width: window.innerWidth,
  }));
  check(`overflow ${name}`, scroll <= width, `scrollWidth=${scroll} > ${width}`);
}

async function signIn(page, email) {
  await page.context().clearCookies();
  await page.goto(`${BASE}/acceso`);
  await page.getByLabel("Correo").fill(email);
  await page.getByLabel("Contraseña").fill(PASS);
  await page.getByRole("button", { name: "Entrar" }).click();
  await page.waitForURL(/\/panel$/, { timeout: 15000 });
}

const browser = await chromium.launch();
const page = await (await browser.newContext({ viewport: { width: 1280, height: 800 } })).newPage();

// 1. Public cover at every width.
for (const w of WIDTHS) {
  await page.setViewportSize({ width: w, height: 800 });
  await page.context().clearCookies();
  await page.goto(BASE);
  await shot(page, `portada-${w}`);
  await noHorizontalOverflow(page, `portada-${w}`);
}

// 2. Agency portfolio.
await signIn(page, "demo-agencia@rubik-demo.test");
for (const w of [390, 1280, 1600]) {
  await page.setViewportSize({ width: w, height: 800 });
  await page.goto(`${BASE}/panel`);
  await shot(page, `panel-agencia-${w}`);
  await noHorizontalOverflow(page, `panel-agencia-${w}`);
}
await page.setViewportSize({ width: 1280, height: 800 });
await page.goto(`${BASE}/panel`);
const cards = await page.locator(".project-card").count();
check("cartera agencia muestra 4 proyectos", cards === 4, `cards=${cards}`);

// 2b. Portfolio search filters client-side.
const search = page.getByLabel("Buscar", { exact: true });
if (await search.count()) {
  await search.fill("hotel");
  const filtered = await page.locator(".project-card").count();
  check("búsqueda «hotel» deja 1 proyecto", filtered === 1, `cards=${filtered}`);
  await search.fill("");
} else {
  check("búsqueda de cartera presente", false, "no se encontró el campo");
}

// 3. Project with data (hotel) → signals + switcher.
const openProject = (name) =>
  page.locator(".project-card", { hasText: name }).getByRole("link", { name: "Abrir proyecto" });
await openProject("Hotel Playa Azul").click();
await page.waitForURL(/\/proyectos\//);
const hotelUrl = page.url();
await shot(page, "proyecto-hotel-1280");
await noHorizontalOverflow(page, "proyecto-hotel");
const switcher = page.locator("select.switcher, .switcher select").first();
check("selector de proyecto visible (agencia, 4 proyectos)", await switcher.count() === 1);

// 3a. The seeded imports render through RLS on the imports page.
await page.goto(`${hotelUrl}/importaciones`);
await page.waitForLoadState("networkidle");
const importRows = await page.getByText(/\(demo\)/).count();
check("importaciones sembradas visibles en el módulo", importRows >= 3, `matches=${importRows}`);
await shot(page, "proyecto-hotel-importaciones-1280");
await page.goto(hotelUrl);

// 3b. Switch to a project without data via the switcher.
if (await switcher.count()) {
  const tallerValue = await page.locator(".switcher option", { hasText: "Taller Rueda Libre" }).first().getAttribute("value")
    ?? await page.locator("select.switcher option", { hasText: "Taller Rueda Libre" }).first().getAttribute("value");
  check("opción «Taller Rueda Libre» en el selector", Boolean(tallerValue));
  await switcher.selectOption(tallerValue);
  await page.waitForLoadState("networkidle");
  check("cambio de proyecto conserva sección compatible (resumen)", /\/proyectos\/[^/]+\/[^/]+\/?$/.test(page.url()), page.url());
  await shot(page, "proyecto-taller-sin-datos-1280");
  const noData = await page.getByText(/Sin datos|sin datos/).count();
  check("proyecto sin datos muestra estados «sin datos»", noData > 0, `matches=${noData}`);
}

// 3c. Browser Back returns to the hotel project.
await page.goBack();
await page.waitForLoadState("networkidle");
check("botón Atrás vuelve al proyecto anterior", page.url() === hotelUrl, page.url());

// 3d. Breadcrumbs back to the portfolio.
await page.goto(hotelUrl);
await page.getByRole("link", { name: "Panel" }).first().click();
await page.waitForURL(/\/panel$/);
check("migas vuelven al panel", true);

// 4. Analyst: limited portfolio, no admin surfaces.
await signIn(page, "demo-analista@rubik-demo.test");
const analystCards = await page.locator(".project-card").count();
check("cartera analista muestra 2 proyectos", analystCards === 2, `cards=${analystCards}`);
await shot(page, "panel-analista-1280");

// 5. Client: one project, approver role.
await signIn(page, "demo-cliente@rubik-demo.test");
const clientCards = await page.locator(".project-card").count();
check("cartera cliente muestra 1 proyecto", clientCards === 1, `cards=${clientCards}`);
await page.locator(".project-card", { hasText: "Hotel Playa Azul" }).getByRole("link", { name: "Abrir proyecto" }).click();
await page.waitForURL(/\/proyectos\//);
await shot(page, "proyecto-hotel-cliente-1280");
check("cliente sin selector de proyecto (1 solo accesible)", (await page.locator("select.switcher, .switcher select").count()) === 0);

// 6. Mobile shell: menu opens and navigates.
await page.setViewportSize({ width: 390, height: 844 });
await page.goto(`${BASE}/panel`);
const menuButton = page.locator("summary", { hasText: "Menú" });
if (await menuButton.count()) {
  await menuButton.click();
  const navLink = page.locator(".mobile-nav nav a").first();
  check("menú móvil abre y muestra navegación", await navLink.isVisible());
  await shot(page, "panel-movil-menu-390");
} else {
  await shot(page, "panel-movil-390");
  check("menú móvil abre y muestra navegación", false, "no se encontró el botón de menú");
}

await browser.close();
console.log(failures.length ? `\n${failures.length} fallos:\n- ${failures.join("\n- ")}` : "\nTodo verificado.");
process.exit(failures.length ? 1 : 0);
