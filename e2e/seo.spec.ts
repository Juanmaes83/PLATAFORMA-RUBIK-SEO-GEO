import { expect, test } from "@playwright/test";
import { mkdirSync } from "node:fs";
import { join } from "node:path";
import { OTHER_TENANT, OTHER_PROJECT, PROJECT, TENANT, signIn } from "./support";

const path = `/proyectos/${TENANT}/${PROJECT}/seo`;

test("N2 keyword declaration, edit and removal stay in the authorized project", async ({ page }, info) => {
  test.skip(info.project.name !== "escritorio-1280", "mutation runs once");
  await signIn(page, "analyst");
  await page.goto(path);
  await expect(page.getByRole("heading", { name: "Análisis SEO" })).toBeVisible();
  const phrase = `consulta ficticia ${Date.now()}`;
  await page.getByLabel("Consulta").fill(phrase);
  await page.getByLabel("Tema o grupo").fill("Prueba local");
  await page.getByRole("button", { name: "Guardar keyword declarada" }).click();
  await expect(page).toHaveURL(/aviso=guardada/);
  const card = page.locator("li.card", { has: page.getByRole("heading", { name: phrase }) });
  await expect(card).toContainText("Sin medición disponible");
  if (process.env.UPDATE_VISUAL_EVIDENCE === "1") {
    const dir = join("docs", "visual", "escritorio-1280");
    mkdirSync(dir, { recursive: true });
    await page.screenshot({ path: join(dir, "28-seo-keyword-ficticia.png"), fullPage: true });
  }
  await card.getByLabel("Tema").fill("Tema revisado");
  await card.getByRole("button", { name: "Actualizar" }).click();
  await expect(page).toHaveURL(/aviso=actualizada/);
  await expect(page.locator("li.card", { hasText: phrase })).toContainText("Tema revisado");
  await expect(page.locator("li.card", { hasText: phrase }).getByRole("button", { name: "Eliminar" })).toHaveCount(0);
  await signIn(page, "owner");
  await page.goto(path);
  const ownerCard = page.locator("li.card", { hasText: phrase });
  await ownerCard.getByLabel("Confirmo que quiero eliminar esta keyword.").check();
  await ownerCard.getByRole("button", { name: "Eliminar" }).click();
  await expect(page).toHaveURL(/aviso=borrada/);
  await expect(page.getByRole("heading", { name: phrase })).toHaveCount(0);
});

test("viewer reads without keyword controls; foreign project stays hidden", async ({ page }, info) => {
  test.skip(info.project.name !== "escritorio-1280", "role flow runs once");
  await signIn(page, "client");
  await page.goto(path);
  await expect(page.getByRole("heading", { name: "Palabras clave y oportunidades" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Guardar keyword declarada" })).toHaveCount(0);
  await signIn(page, "analyst");
  expect((await page.goto(`/proyectos/${OTHER_TENANT}/${OTHER_PROJECT}/seo`))?.status()).toBe(404);
});
