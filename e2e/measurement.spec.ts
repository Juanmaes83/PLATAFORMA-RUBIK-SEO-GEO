import { mkdirSync } from "node:fs";
import { join } from "node:path";
import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";
import { PROJECT, TENANT, signIn } from "./support";

const PAGE = `/proyectos/${TENANT}/${PROJECT}`;

test("project measurement center is navigable, honest and responsive without provider calls", async ({ page }, info) => {
  await signIn(page, "owner");
  const providerRequests: string[] = [];
  page.on("request", (request) => {
    const url = new URL(request.url());
    if (/googleapis\.com$|bing\.com$|openseo/i.test(url.hostname)) providerRequests.push(url.hostname);
  });
  await page.goto(PAGE);
  await page.getByRole("link", { name: "Abrir centro de medición" }).click();
  await expect(page).toHaveURL(new RegExp(`${PAGE}/medicion$`));
  await expect(page.getByRole("heading", { name: "Medición orgánica" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Google Search Console" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Google Analytics 4" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Bing Webmaster Tools" })).toBeVisible();
  await expect(page.getByText("Sin credencial autorizada; no se ha consultado Bing")).toBeVisible();
  await expect(page.getByRole("link", { name: "Comparar capturas de Google" })).toBeVisible();
  expect(providerRequests).toEqual([]);

  const dimensions = await page.evaluate(() => ({ scroll: document.documentElement.scrollWidth, width: window.innerWidth }));
  expect(dimensions.scroll).toBeLessThanOrEqual(dimensions.width);
  const axe = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"]).analyze();
  expect(axe.violations.filter((violation) => violation.impact === "serious" || violation.impact === "critical").map((v) => v.id)).toEqual([]);

  const filename = "30-centro-medicion.png";
  for (const dir of [join("test-results", "visual", info.project.name), ...(process.env.UPDATE_VISUAL_EVIDENCE === "1" ? [join("docs", "visual", info.project.name)] : [])]) {
    mkdirSync(dir, { recursive: true });
    await page.screenshot({ path: join(dir, filename), fullPage: true, style: ".user-name { visibility: hidden !important; }" });
  }
});

test("viewer can inspect the center but receives no connection or capture controls", async ({ page }, info) => {
  test.skip(info.project.name !== "escritorio-1280", "role check is viewport-independent");
  await signIn(page, "client");
  await page.goto(`${PAGE}/medicion`);
  await expect(page.getByRole("heading", { name: "Medición orgánica" })).toBeVisible();
  await expect(page.getByRole("button", { name: /capturar|conectar|revocar/i })).toHaveCount(0);
  await expect(page.getByRole("link", { name: "Abrir capturas e historial de Google" }).first()).toBeVisible();
});
