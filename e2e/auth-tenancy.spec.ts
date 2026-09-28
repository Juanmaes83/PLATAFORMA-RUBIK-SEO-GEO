import { expect, test } from "@playwright/test";
import { localSupabaseEnv } from "../scripts/supabase-test-env.mjs";
import { OTHER_PROJECT, OTHER_TENANT, TEST_PASSPHRASE, PROJECT, TENANT, USERS, signIn } from "./support";

// Auth and tenant isolation through the browser, against the local Supabase stack. These
// flows do not depend on the viewport, so they run once (desktop project).
test.beforeEach(({}, info) => test.skip(info.project.name !== "escritorio-1280", "viewport-independent"));

const PROTECTED = ["/panel", "/proyectos", "/organizaciones", `/proyectos/${TENANT}/${PROJECT}`, `/proyectos/${TENANT}/${PROJECT}/mediciones`, "/revision", "/equipo"];

test("sign-up with e-mail confirmation, then sign-out", async ({ page }) => {
  const { mailpitUrl } = localSupabaseEnv();
  const address = `registro-${Date.now().toString(36)}@ejemplo.test`;
  await page.goto("/registro");
  await page.getByLabel("Correo").fill(address);
  await page.getByLabel("Contraseña").fill(TEST_PASSPHRASE);
  await page.getByRole("button", { name: "Crear cuenta" }).click();
  await expect(page).toHaveURL(/\/acceso\?aviso=confirma$/);
  await expect(page.locator("main").getByRole("status").filter({ hasText: "te hemos enviado un enlace" })).toBeVisible();

  // Not confirmed yet: signing in is refused.
  await page.getByLabel("Correo").fill(address);
  await page.getByLabel("Contraseña").fill(TEST_PASSPHRASE);
  await page.getByRole("button", { name: "Entrar" }).click();
  await expect(page.locator("main").getByRole("alert")).toContainText("Confirma tu correo");

  // Open the confirmation link from the local mail catcher.
  let link: string | undefined;
  await expect.poll(async () => {
    const list = await (await fetch(`${mailpitUrl}/api/v1/search?query=${encodeURIComponent(`to:${address}`)}`)).json();
    if (!list.messages?.length) return false;
    const message = await (await fetch(`${mailpitUrl}/api/v1/message/${list.messages[0].ID}`)).json();
    link = /href="([^"]+\/auth\/confirm\?[^"]+)"/.exec(message.HTML)?.[1]?.replace(/&amp;/g, "&");
    return !!link;
  }).toBe(true);
  await page.goto(link!);
  await expect(page).toHaveURL(/\/panel$/);
  await expect(page.getByText("Aún no tienes acceso a ningún proyecto.")).toBeVisible();

  await page.getByRole("button", { name: "Salir" }).click();
  await expect(page).toHaveURL(/\/$/);
  await page.goto("/panel");
  await expect(page).toHaveURL(/\/acceso$/);
});

test("sign-in errors are explained without echoing input", async ({ page }) => {
  await page.goto("/acceso");
  await page.getByLabel("Correo").fill(USERS.owner);
  await page.getByLabel("Contraseña").fill("otra-clave-9999");
  await page.getByRole("button", { name: "Entrar" }).click();
  await expect(page.locator("main").getByRole("alert")).toHaveText("Correo o contraseña incorrectos.");
  await page.goto("/acceso?error=<script>alert(1)</script>");
  await expect(page.locator("main").getByRole("alert")).toHaveCount(0);
  await page.goto("/auth/confirm?token_hash=inventado&type=email");
  await expect(page).toHaveURL(/\/acceso\?error=enlace$/);
});

test("every protected route redirects to /acceso without a session", async ({ page }) => {
  for (const path of PROTECTED) {
    await page.goto(path);
    await expect(page, path).toHaveURL(/\/acceso$/);
  }
});

test("forged or stale cookies never create a session", async ({ page, context, baseURL }) => {
  const ref = new URL(localSupabaseEnv().apiUrl).hostname.split(".")[0];
  await context.addCookies([
    { name: "rubik_demo_session", value: "demo-owner", url: baseURL! },
    { name: `sb-${ref}-auth-token`, value: "base64-eyJhY2Nlc3NfdG9rZW4iOiJmYWxzbyJ9", url: baseURL! },
  ]);
  for (const path of PROTECTED) {
    await page.goto(path);
    await expect(page, path).toHaveURL(/\/acceso$/);
  }
  await expect(page.getByRole("link", { name: "Acceso" })).toBeVisible();
});

test("another tenant's project is indistinguishable from a missing one", async ({ page }) => {
  await signIn(page, "analyst");
  const other = await page.goto(`/proyectos/${OTHER_TENANT}/${OTHER_PROJECT}`);
  const otherText = await page.locator("main").innerText();
  const missing = await page.goto(`/proyectos/${TENANT}/no-existe`);
  const missingText = await page.locator("main").innerText();
  expect(other?.status()).toBe(404);
  expect(missing?.status()).toBe(404);
  expect(otherText).toBe(missingText);
  // Tenant/project mismatch and malformed ids too.
  for (const path of [`/proyectos/${OTHER_TENANT}/${PROJECT}`, `/proyectos/${TENANT}/${OTHER_PROJECT}`, `/proyectos/${TENANT.toUpperCase()}/${PROJECT}`, `/proyectos/${OTHER_TENANT}/${OTHER_PROJECT}/mediciones`]) {
    expect((await page.goto(path))?.status(), path).toBe(404);
  }
  await page.goto("/proyectos");
  await expect(page.getByText("Despacho de ejemplo")).toHaveCount(0);
});

test("an account without membership sees no project and no organization", async ({ page }) => {
  await signIn(page, "newcomer");
  await expect(page.getByText("Aún no tienes acceso a ningún proyecto.")).toBeVisible();
  await page.goto("/organizaciones");
  await expect(page.getByText("Todavía no perteneces a ninguna organización.")).toBeVisible();
  expect((await page.goto(`/proyectos/${TENANT}/${PROJECT}`))?.status()).toBe(404);
});

test("an owner creates a project; a manipulated organization field is rejected by RLS", async ({ page }) => {
  await signIn(page, "outsider");
  await page.goto("/organizaciones");
  const slug = `nuevo-${Date.now().toString(36)}`;
  const form = page.locator("form", { has: page.getByRole("button", { name: "Crear proyecto" }) });
  await form.getByLabel("Nombre").fill("Proyecto creado en e2e");
  await form.getByLabel("Identificador").fill(slug);
  await form.getByRole("button", { name: "Crear proyecto" }).click();
  await expect(page).toHaveURL(new RegExp(`/proyectos/${OTHER_TENANT}/${slug}$`));
  await expect(page.getByText("tu rol: Titular")).toBeVisible();

  // Point the hidden field at another tenant (browser dev tools): the insert must fail.
  await page.goto("/organizaciones");
  await form.locator('input[name="organization"]').evaluate((el, t) => ((el as HTMLInputElement).value = t), TENANT);
  await form.getByLabel("Nombre").fill("Intruso");
  await form.getByLabel("Identificador").fill(`intruso-${Date.now().toString(36)}`);
  await form.getByRole("button", { name: "Crear proyecto" }).click();
  await expect(page.locator("main").getByRole("alert")).toHaveText("No tienes permiso para hacer eso en esa organización.");

  await signIn(page, "owner");
  await page.goto("/proyectos");
  await expect(page.getByText("Intruso")).toHaveCount(0);
});

test("a member who is not an owner gets no creation form and cannot create projects", async ({ page }) => {
  await signIn(page, "analyst");
  await page.goto("/organizaciones");
  await expect(page.getByText("Agencia de ejemplo")).toBeVisible();
  await expect(page.getByRole("button", { name: "Crear proyecto" })).toHaveCount(0);
});
