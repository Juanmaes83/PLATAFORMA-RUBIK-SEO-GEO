import { mkdirSync } from "node:fs";
import { join } from "node:path";
import AxeBuilder from "@axe-core/playwright";
import { createClient } from "@supabase/supabase-js";
import { expect, test, type Page } from "@playwright/test";
import { localSupabaseEnv } from "../scripts/supabase-test-env.mjs";
import { PROJECT, TENANT, TEST_PASSPHRASE, USERS, signIn } from "./support";

// ADR 0008: an uncertain STARTING reservation is reconciled by its owner, against the local
// stack only. The reservation is created through the owner's own session (as a lost launch
// response would leave it); OpenSEO is not configured and is never contacted.
const PAGE = `/proyectos/${TENANT}/${PROJECT}/auditoria-tecnica`;
const RUN = Date.now().toString(36);

async function ownerClient() {
  const env = localSupabaseEnv();
  const client = createClient(env.apiUrl, env.publishableKey, { auth: { persistSession: false, autoRefreshToken: false } });
  const { error } = await client.auth.signInWithPassword({ email: USERS.owner, password: TEST_PASSPHRASE });
  if (error) throw error;
  const project = await client.from("projects").select("id, organizations!inner(slug)").eq("slug", PROJECT).eq("organizations.slug", TENANT).single();
  if (project.error) throw project.error;
  return { client, projectId: project.data.id as string };
}

async function reserve() {
  const { client, projectId } = await ownerClient();
  const { error } = await client.rpc("openseo_job", { p_project_id: projectId, p_command: "acquire" });
  if (error) throw error;
  return { client, projectId };
}

async function checked(page: Page, name: string) {
  await page.waitForLoadState("networkidle");
  const axe = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"]).analyze();
  expect(axe.violations.filter((v) => v.impact === "serious" || v.impact === "critical").map((v) => v.id)).toEqual([]);
  const overflow = await page.evaluate(() => ({ scroll: document.documentElement.scrollWidth, width: window.innerWidth }));
  expect(overflow.scroll).toBeLessThanOrEqual(overflow.width);
  for (const dir of [join("test-results", "visual", "escritorio-1280"), ...(process.env.UPDATE_VISUAL_EVIDENCE === "1" ? [join("docs", "visual", "escritorio-1280")] : [])]) {
    mkdirSync(dir, { recursive: true });
    await page.screenshot({ path: join(dir, `${name}.png`), fullPage: true });
  }
}

test("owner releases an uncertain reservation after checking OpenSEO", async ({ page }, info) => {
  test.skip(info.project.name !== "escritorio-1280", "changes data: runs once");
  await reserve();
  await signIn(page, "owner");
  await page.goto(PAGE);
  const panel = page.getByRole("region", { name: "Lanzamiento pendiente de confirmar" });
  await expect(panel).toContainText("No sabemos si el rastreo se creó");
  await checked(page, "22-auditoria-tecnica-lanzamiento-pendiente");
  await panel.getByLabel(/no se creó ningún rastreo/).check();
  await panel.getByRole("button", { name: "Liberar la reserva" }).click();
  await expect(page.getByRole("region", { name: "Lanzamiento pendiente de confirmar" })).toHaveCount(0);
});

test("owner binds the audit id shown in OpenSEO, which leaves no uncertain reservation", async ({ page }, info) => {
  test.skip(info.project.name !== "escritorio-1280", "changes data: runs once");
  const { client, projectId } = await reserve();
  await signIn(page, "owner");
  await page.goto(PAGE);
  const panel = page.getByRole("region", { name: "Lanzamiento pendiente de confirmar" });
  await panel.getByLabel("Identificador de la auditoría en OpenSEO").fill(`e2e-aud-${RUN}`);
  await panel.getByLabel(/este rastreo es de este proyecto/).check();
  await panel.getByRole("button", { name: "Vincular auditoría" }).click();
  await expect(page.getByRole("region", { name: "Lanzamiento pendiente de confirmar" })).toHaveCount(0);
  const active = await client.rpc("openseo_active_job", { p_project_id: projectId });
  expect(active.data).toMatchObject({ state: "SYNCING", auditId: `e2e-aud-${RUN}` });
  // Leave the project without an active job for the specs that follow.
  const jobId = (active.data as { jobId: string }).jobId;
  expect((await client.rpc("openseo_job", { p_project_id: projectId, p_command: "fail", p_job_id: jobId })).error).toBeNull();
});

test("an analyst never sees the reconciliation panel", async ({ page }, info) => {
  test.skip(info.project.name !== "escritorio-1280", "read-only check, once is enough");
  const { client, projectId } = await reserve();
  await signIn(page, "analyst");
  await page.goto(PAGE);
  await expect(page.getByRole("region", { name: "Lanzamiento pendiente de confirmar" })).toHaveCount(0);
  const active = await client.rpc("openseo_active_job", { p_project_id: projectId });
  const jobId = (active.data as { jobId: string }).jobId;
  expect((await client.rpc("openseo_release_starting_job", { p_project_id: projectId, p_job_id: jobId })).error).toBeNull();
});
