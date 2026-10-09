import { expect, test } from "@playwright/test";
import { localSupabaseEnv } from "../scripts/supabase-test-env.mjs";
import { PROJECT, TENANT, TEST_PASSPHRASE, signIn } from "./support";

// ADR 0011 against the local stack: an organization owner creates a single-use link for one
// address, the invited person signs up, confirms, signs in through the link and joins with the
// invited role; the link then stops working and another account can never use it.
test.beforeEach(({}, info) => test.skip(info.project.name !== "escritorio-1280", "changes data: runs once"));

const PAGE = `/proyectos/${TENANT}/${PROJECT}/invitaciones`;

async function confirmLink(mailpitUrl: string, address: string) {
  let link: string | undefined;
  await expect.poll(async () => {
    const list = await (await fetch(`${mailpitUrl}/api/v1/search?query=${encodeURIComponent(`to:${address}`)}`)).json();
    if (!list.messages?.length) return false;
    const message = await (await fetch(`${mailpitUrl}/api/v1/message/${list.messages[0].ID}`)).json();
    link = /href="([^"]+\/auth\/confirm\?[^"]+)"/.exec(message.HTML)?.[1]?.replace(/&amp;/g, "&");
    return !!link;
  }).toBe(true);
  return link!;
}

test("owner invites, the invited address joins once with the invited role", async ({ page }) => {
  const { mailpitUrl } = localSupabaseEnv();
  const address = `invitada-${Date.now().toString(36)}@ejemplo.test`;

  await signIn(page, "owner");
  await page.goto(PAGE);
  await page.getByLabel("Correo de la persona invitada").fill(address);
  await page.getByLabel("Rol en este proyecto").selectOption("viewer");
  await page.getByRole("button", { name: "Crear enlace de invitación" }).click();
  const shown = page.getByRole("status").filter({ hasText: "no se volverá a mostrar" });
  await expect(shown).toBeVisible();
  const link = (await shown.locator("code").textContent())!.trim();
  expect(link).toMatch(/\/invitacion\/[0-9a-f]{64}$/);
  const path = new URL(link, "http://local").pathname;
  // A second open invitation for the same address is refused.
  await page.getByLabel("Correo de la persona invitada").fill(address);
  await page.getByRole("button", { name: "Crear enlace de invitación" }).click();
  await expect(page.getByRole("alert")).toContainText("Ya hay una invitación abierta");

  // Another signed-in account cannot use it, and learns nothing about it.
  await signIn(page, "newcomer");
  await page.goto(path);
  await expect(page.locator("main")).not.toContainText(address);
  await page.getByRole("button", { name: "Aceptar invitación" }).click();
  await expect(page.getByRole("alert")).toContainText("no se puede usar");

  // The invited person signs up and confirms, then opens the link signed out.
  await page.getByRole("button", { name: "Salir" }).click();
  await page.goto("/registro");
  await page.getByLabel("Correo").fill(address);
  await page.getByLabel("Contraseña").fill(TEST_PASSPHRASE);
  await page.getByRole("button", { name: "Crear cuenta" }).click();
  await page.goto(await confirmLink(mailpitUrl, address));
  await expect(page).toHaveURL(/\/panel$/);
  await page.getByRole("button", { name: "Salir" }).click();
  await expect(page).toHaveURL(/\/$/);

  await page.goto(path);
  await page.getByRole("link", { name: "Entrar" }).first().click();
  await expect(page).toHaveURL(/\/acceso\?siguiente=/, { timeout: 20_000 });
  await page.getByLabel("Correo").fill(address);
  await page.getByLabel("Contraseña").fill(TEST_PASSPHRASE);
  await page.getByRole("button", { name: "Entrar" }).click();
  await expect(page).toHaveURL(new RegExp(`${path}$`));
  await page.getByRole("button", { name: "Aceptar invitación" }).click();
  await expect(page).toHaveURL(new RegExp(`/proyectos/${TENANT}/${PROJECT}\\?aviso=invitacion$`));
  await expect(page.getByRole("status")).toContainText("Te has unido al proyecto");
  await expect(page.locator("main")).toContainText("Solo lectura");

  // Single use: the same link now refuses (already a member).
  await page.goto(path);
  await page.getByRole("button", { name: "Aceptar invitación" }).click();
  await expect(page.getByRole("alert")).toBeVisible();

  // The owner sees it accepted; the invited viewer cannot manage invitations.
  await page.goto(PAGE);
  await expect(page.getByText("Solo la titularidad de la organización invita")).toBeVisible();
  await signIn(page, "owner");
  await page.goto(PAGE);
  await expect(page.locator("li", { hasText: address })).toContainText("Aceptada");
});

test("an open invitation can be revoked and its link stops working", async ({ page }) => {
  const address = `revocada-${Date.now().toString(36)}@ejemplo.test`;
  await signIn(page, "owner");
  await page.goto(PAGE);
  await page.getByLabel("Correo de la persona invitada").fill(address);
  await page.getByRole("button", { name: "Crear enlace de invitación" }).click();
  await expect(page.getByRole("status").filter({ hasText: "no se volverá a mostrar" })).toBeVisible();
  await page.goto(PAGE);
  await page.locator("li", { hasText: address }).getByRole("button", { name: "Revocar" }).click();
  await expect(page.getByRole("status")).toContainText("Invitación revocada");
  await expect(page.locator("li", { hasText: address })).toContainText("Revocada");
});
