import { mkdirSync } from "node:fs";
import { join } from "node:path";
import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";

// Every page is checked at 360, 390 and 1280 px: one <h1>, no horizontal overflow, no serious
// or critical axe violations (WCAG 2.1 A/AA, contrast included), comfortable touch targets on
// mobile, and demo data labelled as such. A full-page screenshot is written for review
// (test-results/visual; docs/visual when UPDATE_VISUAL_EVIDENCE=1).
const PAGES = [
  { name: "01-inicio", path: "/" },
  { name: "02-acceso", path: "/acceso", demo: true },
  { name: "03-panel", path: "/panel", user: "demo-owner", demo: true },
  { name: "04-proyectos", path: "/proyectos", user: "demo-owner", demo: true },
  { name: "05-proyecto-analista", path: "/proyectos/agencia-demo/restaurante-demo", user: "demo-analyst", demo: true },
  { name: "06-proyecto-cliente", path: "/proyectos/agencia-demo/inmobiliaria-demo", user: "demo-client", demo: true },
  { name: "07-seccion-no-disponible", path: "/proyectos/agencia-demo/restaurante-demo/mediciones", user: "demo-analyst" },
  { name: "08-revision-no-disponible", path: "/revision", user: "demo-owner" },
  { name: "09-conectores", path: "/conectores" },
  { name: "10-otro-tenant-404", path: "/proyectos/otra-agencia/despacho-demo", user: "demo-analyst" },
] as const;

const horizontalOverflow = (page: Page) =>
  page.evaluate(() => ({ scroll: document.documentElement.scrollWidth, width: window.innerWidth }));

async function signInWithCookie(page: Page, userId: string, baseURL: string) {
  await page.context().addCookies([{ name: "rubik_demo_session", value: userId, url: baseURL }]);
}

async function screenshot(page: Page, project: string, name: string) {
  const dirs = [join("test-results", "visual", project)];
  if (process.env.UPDATE_VISUAL_EVIDENCE === "1") dirs.push(join("docs", "visual", project));
  for (const dir of dirs) {
    mkdirSync(dir, { recursive: true });
    await page.screenshot({ path: join(dir, `${name}.png`), fullPage: true });
  }
}

for (const p of PAGES) {
  test(`${p.name} ${p.path}`, async ({ page, baseURL }, info) => {
    if ("user" in p && p.user) await signInWithCookie(page, p.user, baseURL!);
    const response = await page.goto(p.path);
    expect(response?.status()).toBe(p.name.endsWith("404") ? 404 : 200);
    await page.waitForLoadState("networkidle");

    await expect(page.locator("h1")).toHaveCount(1);
    await expect(page.locator("main#contenido")).toBeVisible();

    const overflow = await horizontalOverflow(page);
    expect(overflow.scroll, `horizontal overflow at ${info.project.name}`).toBeLessThanOrEqual(overflow.width);

    if ("demo" in p && p.demo) await expect(page.getByText("Demo · ficticio").first()).toBeVisible();

    const axe = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"]).analyze();
    const serious = axe.violations.filter((v) => v.impact === "serious" || v.impact === "critical");
    expect(serious.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(" ")).join(", ")}`)).toEqual([]);

    if (info.project.name.startsWith("movil")) {
      const small = await page.$$eval(".btn, button, .nav-link, .mobile-nav > summary, .subnav a, .legend > summary", (els) =>
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
  await page.goto("/");
  const mobile = info.project.name.startsWith("movil");
  await expect(page.locator(".side-nav")).toBeVisible({ visible: !mobile });
  await expect(page.locator(".mobile-nav > summary")).toBeVisible({ visible: mobile });
  if (mobile) {
    await page.locator(".mobile-nav > summary").focus();
    await page.keyboard.press("Enter");
    await expect(page.getByRole("navigation", { name: "Principal (móvil)" }).getByRole("link", { name: /Revisión y aprobaciones/ })).toBeVisible();
    await screenshot(page, info.project.name, "11-menu-movil-abierto");
  }
});

test("demo sign-in through the form, then sign-out", async ({ page }) => {
  await page.goto("/acceso");
  await page.getByRole("button", { name: "Entrar como Analista de demostración" }).click();
  await expect(page).toHaveURL(/\/panel$/);
  await expect(page.getByRole("heading", { level: 1, name: "Panel" })).toBeVisible();
  await expect(page.getByText("Sin observaciones registradas").first()).toBeVisible();
  await page.getByRole("button", { name: "Salir" }).click();
  await expect(page).toHaveURL(/\/$/);
});

test("honest empty states: no invented numbers on the dashboard", async ({ page, baseURL }) => {
  await signInWithCookie(page, "demo-owner", baseURL!);
  await page.goto("/panel");
  const main = (await page.locator("main").innerText()).replace(/\s+/g, " ");
  // The only digits allowed are the project count sentence and stage names (CORE-9.x).
  const digits = main.replace(/CORE-9\.\d+( y \d+(\.\d+)?)?/g, "").replace(/acceso a \d proyectos?/, "").match(/\d/g);
  expect(digits).toBeNull();
});

test("the overflow check detects a too-wide element (self-test)", async ({ page }) => {
  await page.goto("/");
  await page.evaluate(() => {
    const wide = document.createElement("div");
    wide.style.width = "2000px";
    wide.style.height = "1px";
    document.querySelector("main")?.append(wide);
  });
  const overflow = await horizontalOverflow(page);
  expect(overflow.scroll).toBeGreaterThan(overflow.width);
});
