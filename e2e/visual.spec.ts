import { mkdirSync } from "node:fs";
import { join } from "node:path";
import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";
import { OTHER_PROJECT, OTHER_TENANT, PROJECT, TENANT, signIn, type UserKey } from "./support";

// Every page is checked at 360, 390 and 1280 px: one <h1>, no horizontal overflow, no serious
// or critical axe violations (WCAG 2.1 A/AA, contrast included), comfortable touch targets on
// mobile, no dead controls and no inputs outside the pages that are forms. A full-page
// screenshot is written for review (test-results/visual; docs/visual when UPDATE_VISUAL_EVIDENCE=1).
// Users sign in through the real form against the local Supabase stack.
const P = `/proyectos/${TENANT}/${PROJECT}`;
const PAGES: { name: string; path: string; user?: UserKey; form?: boolean; status?: number }[] = [
  { name: "01-inicio", path: "/" },
  { name: "02-acceso", path: "/acceso", form: true },
  { name: "03-registro", path: "/registro", form: true },
  { name: "03b-recuperar", path: "/recuperar", form: true },
  { name: "04-panel", path: "/panel", user: "owner" },
  { name: "05-proyectos", path: "/proyectos", user: "owner" },
  { name: "06-organizaciones", path: "/organizaciones", user: "owner", form: true },
  { name: "07-proyecto-analista", path: P, user: "analyst" },
  { name: "08-proyecto-cliente", path: P, user: "client" },
  { name: "09-seccion-no-disponible", path: `${P}/mediciones`, user: "analyst" },
  { name: "10-revision-no-disponible", path: "/revision", user: "owner" },
  { name: "11-conectores", path: "/conectores" },
  { name: "12-otro-tenant-404", path: `/proyectos/${OTHER_TENANT}/${OTHER_PROJECT}`, user: "analyst", status: 404 },
  { name: "13-panel-sin-proyectos", path: "/panel", user: "newcomer" },
  { name: "15-importaciones-analista", path: `${P}/importaciones`, user: "analyst", form: true },
  { name: "16-importaciones-cliente", path: `${P}/importaciones`, user: "client" },
  { name: "18-auditoria-tecnica-titular", path: `${P}/auditoria-tecnica`, user: "owner", form: true },
  { name: "19-auditoria-tecnica-analista", path: `${P}/auditoria-tecnica`, user: "analyst" },
  { name: "22-comparar-sin-seleccion", path: `${P}/auditoria-tecnica/comparar`, user: "analyst" },
  { name: "23-comparar-resultado-inexistente", path: `${P}/auditoria-tecnica/comparar?antes=00000000-0000-4000-8000-000000000001&despues=00000000-0000-4000-8000-000000000002`, user: "analyst", status: 404 },
  { name: "24-consumo-titular", path: `${P}/consumo`, user: "owner" },
  { name: "25-consumo-analista", path: `${P}/consumo`, user: "analyst" },
  { name: "26-seo-analista", path: `${P}/seo`, user: "analyst", form: true },
  { name: "27-seo-cliente", path: `${P}/seo`, user: "client", form: true },
  { name: "60-informe-analista", path: `${P}/informe`, user: "analyst" },
  { name: "61-informe-cliente", path: `${P}/informe`, user: "client" },
];

const horizontalOverflow = (page: Page) =>
  page.evaluate(() => ({ scroll: document.documentElement.scrollWidth, width: window.innerWidth }));

async function screenshot(page: Page, project: string, name: string) {
  const dirs = [join("test-results", "visual", project)];
  if (process.env.UPDATE_VISUAL_EVIDENCE === "1") dirs.push(join("docs", "visual", project));
  for (const dir of dirs) {
    mkdirSync(dir, { recursive: true });
    await page.screenshot({ path: join(dir, `${name}.png`), fullPage: true });
  }
}

for (const p of PAGES) {
  test(`${p.name} ${p.path}`, async ({ page }, info) => {
    if (p.user) await signIn(page, p.user);
    const response = await page.goto(p.path);
    expect(response?.status()).toBe(p.status ?? 200);
    await page.waitForLoadState("networkidle");

    await expect(page.locator("h1")).toHaveCount(1);
    await expect(page.locator("main#contenido")).toBeVisible();

    const overflow = await horizontalOverflow(page);
    expect(overflow.scroll, `horizontal overflow at ${info.project.name}`).toBeLessThanOrEqual(overflow.width);

    // No dead controls: every button submits a form with a server action (or declares a client
    // action that its own spec exercises, e.g. the report's print button) and every link-button
    // has a destination. Only form pages have visible inputs. Scoped to the app shell (header,
    // navigation, main): excludes the Next.js dev overlay.
    const dead = await page.$$eval(".topbar button, .topbar a.btn, nav button, main button, main a.btn", (els) =>
      els
        .filter((el) => (el.tagName === "BUTTON" ? !el.closest("form[action]") && !el.hasAttribute("data-client-action") : !(el as HTMLAnchorElement).getAttribute("href")))
        .map((el) => (el.textContent ?? "").trim()),
    );
    expect(dead, "controls without a working action").toEqual([]);
    const inputs = page.locator("main input:not([type=hidden]), main textarea, main select");
    if (p.form) await expect(inputs.first()).toBeVisible();
    else await expect(inputs).toHaveCount(0);

    // Core codes such as ROLE_NOT_ALLOWED may only appear as a small diagnostic detail.
    const rawCodes = await page.$$eval("main *", (els) =>
      els
        .filter((el) => el.children.length === 0 && /\b[A-Z]{2,}_[A-Z_]{2,}\b/.test(el.textContent ?? "") && !el.closest(".diag"))
        .map((el) => (el.textContent ?? "").trim()),
    );
    expect(rawCodes, "technical codes outside diagnostic details").toEqual([]);

    const axe = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"]).analyze();
    const serious = axe.violations.filter((v) => v.impact === "serious" || v.impact === "critical");
    expect(serious.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(" ")).join(", ")}`)).toEqual([]);

    if (info.project.name.startsWith("movil")) {
      const small = await page.$$eval(".btn, button, input:not([type=hidden]), .nav-link, .mobile-nav > summary, .subnav a, .legend > summary, .tech > summary", (els) =>
        els
          .filter((el) => (el as HTMLElement).offsetParent !== null)
          .map((el) => ({ text: (el.textContent ?? "").trim().slice(0, 30), h: el.getBoundingClientRect().height }))
          .filter((b) => b.h < 43.5),
      );
      expect(small, "touch targets under 44 px").toEqual([]);
    }

    await screenshot(page, info.project.name, p.name);
  });
}

test("navigation: mobile menu disclosure vs desktop sidebar", async ({ page }, info) => {
  // Visitors get the public shell without workspace navigation.
  await page.goto("/");
  await expect(page.locator(".side-nav, .mobile-nav")).toHaveCount(0);
  // Signed in, the shell shows the sidebar on desktop and the disclosure on mobile.
  await signIn(page, "owner");
  await page.goto("/panel");
  const mobile = info.project.name.startsWith("movil");
  await expect(page.locator(".side-nav")).toBeVisible({ visible: !mobile });
  await expect(page.locator(".mobile-nav > summary")).toBeVisible({ visible: mobile });
  if (mobile) {
    await page.locator(".mobile-nav > summary").focus();
    await page.keyboard.press("Enter");
    await expect(page.getByRole("navigation", { name: "Principal (móvil)" }).getByRole("link", { name: "Proyectos" })).toBeVisible();
    await screenshot(page, info.project.name, "14-menu-movil-abierto");
  }
});

test("the overflow check detects a too-wide element (self-test)", async ({ page }) => {
  await page.goto("/");
  // Inject after hydration and outside React's tree, so a re-render cannot remove the probe
  // before it is measured (a race seen once at 360 px).
  await page.waitForLoadState("networkidle");
  await page.evaluate(() => {
    const wide = document.createElement("div");
    wide.style.width = "2000px";
    wide.style.height = "1px";
    document.body.append(wide);
  });
  await expect.poll(async () => { const o = await horizontalOverflow(page); return o.scroll > o.width; }).toBe(true);
});

test("honest empty states: no invented numbers on the dashboard", async ({ page }) => {
  await signIn(page, "owner");
  await page.goto("/panel");
  const main = (await page.locator("main").innerText()).replace(/\s+/g, " ");
  // The only digits allowed are the real portfolio counts («Cartera de 1 proyecto…», the
  // «1 proyecto» / «2 de 4 proyectos» filter count) and stage names (CORE-9.x).
  const digits = main
    .replace(/CORE-9\.\d+( y \d+(\.\d+)?)?/g, "")
    .replace(/Cartera de \d+ proyectos?/g, "")
    .replace(/\b\d+ de \d+ proyectos\b/g, "")
    .replace(/\b\d+ proyectos?\b/g, "")
    .match(/\d/g);
  expect(digits).toBeNull();
});

test("permissions come from the stored role: granted but unbuilt functions never look usable", async ({ page }) => {
  await signIn(page, "analyst");
  await page.goto(P);
  const row = (name: string) => page.locator("tr", { has: page.getByRole("rowheader", { name, exact: true }) });
  // The contextual bar names the stored role; the permission matrix lives in a collapsed
  // technical disclosure that the test opens explicitly.
  await expect(page.locator(".context-role")).toContainText("Tu rol:");
  await expect(page.locator(".context-role")).toContainText("Analista");
  await page.getByText("Tus permisos en este proyecto").click();
  await expect(row("Leer")).toHaveAttribute("data-state", "available");
  await expect(row("Redactar borradores")).toHaveAttribute("data-state", "granted-not-built");
  await expect(row("Redactar borradores")).toContainText("Hoy no se puede usar");
  await expect(row("Aprobar acciones externas")).toHaveAttribute("data-state", "denied");
  await expect(row("Aprobar acciones externas")).toContainText("El rol Analista no incluye esta acción.");
  await expect(row("Aprobar acciones externas").locator(".diag")).toContainText("ROLE_NOT_ALLOWED");

  await signIn(page, "client");
  await page.goto(P);
  await expect(page.locator(".context-role")).toContainText("Cliente (aprobación)");
  await page.getByText("Tus permisos en este proyecto").click();
  await expect(row("Aprobar acciones externas")).not.toHaveAttribute("data-state", "denied");
  await expect(row("Redactar borradores")).toHaveAttribute("data-state", "denied");
});

test("connectors: Spanish names, all not connected, no credential fields", async ({ page }) => {
  await page.goto("/conectores");
  await expect(page.getByRole("rowheader", { name: /Google Search Console/ })).toBeVisible();
  await expect(page.locator("tbody tr")).toHaveCount(7);
  await expect(page.locator("tbody tr .pill-warn", { hasText: "No conectado" })).toHaveCount(7);
  await expect(page.locator("main form, main input, main textarea")).toHaveCount(0);
});

test("unavailable areas explain what they will need and the next step", async ({ page }) => {
  await signIn(page, "owner");
  for (const path of ["/revision", "/borradores", "/equipo", "/configuracion", `${P}/mediciones`]) {
    await page.goto(path);
    await expect(page.getByText("Qué necesitará"), path).toBeVisible();
    await expect(page.getByText("Cuando esté disponible"), path).toBeVisible();
  }
});

test("projects page: the Core denial code is only secondary technical information", async ({ page }) => {
  await signIn(page, "owner");
  await page.goto("/proyectos");
  const code = page.getByText("NOT_A_MEMBER_OF_SCOPE");
  await expect(code).toHaveCount(1);
  await expect(code).toBeHidden();
  await page.getByText("Información técnica").click();
  await expect(code).toBeVisible();
});

// The configured projects cover 360, 390 and 1280 px; the brief also asks for 768 and 1600.
// One pass per extra width, on the desktop project, with the same overflow and axe checks.
for (const width of [768, 1600]) {
  test(`portada y panel a ${width} px`, async ({ page }, info) => {
    test.skip(info.project.name !== "escritorio-1280", "una sola pasada por ancho extra");
    await page.setViewportSize({ width, height: 900 });

    await page.goto("/");
    await page.waitForLoadState("networkidle");
    await expect(page.locator("h1")).toHaveCount(1);
    let overflow = await horizontalOverflow(page);
    expect(overflow.scroll, `portada a ${width}px`).toBeLessThanOrEqual(overflow.width);
    let axe = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"]).analyze();
    expect(axe.violations.filter((v) => v.impact === "serious" || v.impact === "critical").map((v) => v.id)).toEqual([]);
    await screenshot(page, info.project.name, `70-inicio-${width}`);

    await signIn(page, "owner");
    await page.goto("/panel");
    await page.waitForLoadState("networkidle");
    overflow = await horizontalOverflow(page);
    expect(overflow.scroll, `panel a ${width}px`).toBeLessThanOrEqual(overflow.width);
    axe = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"]).analyze();
    expect(axe.violations.filter((v) => v.impact === "serious" || v.impact === "critical").map((v) => v.id)).toEqual([]);
    await screenshot(page, info.project.name, `71-panel-${width}`);
  });
}

test("project summary links to measurement without duplicating its empty state", async ({ page }) => {
  await signIn(page, "owner");
  await page.goto(P);
  const section = page.locator("section[aria-labelledby=s-modulos]");
  const tile = section.getByRole("link", { name: /Medición orgánica/ });
  await expect(tile).toHaveAttribute("href", `${P}/medicion`);
  await expect(tile).toContainText("Capturas firmadas de Search Console y GA4");
  // The fixture project has no Google property: for the owner, whose role may read the stored
  // association, the tile names the pending configuration and the next step once.
  await expect(tile).toContainText("Configuración pendiente");
  await expect(tile).toContainText("Sin propiedad de Google asociada");
  await tile.click();
  await expect(page).toHaveURL(`${P}/medicion`);
  await expect(page.getByRole("heading", { level: 1, name: "Medición orgánica" })).toBeVisible();

  // The analyst's role cannot read the association, so their tile stays an honest «Sin datos»:
  // «Configuración pendiente» never stands in for a forbidden or failed read.
  await signIn(page, "analyst");
  await page.goto(P);
  const analystTile = page.locator("section[aria-labelledby=s-modulos]").getByRole("link", { name: /Medición orgánica/ });
  await expect(analystTile).toContainText("Sin datos");
  await expect(analystTile).not.toContainText("Configuración pendiente");
});
