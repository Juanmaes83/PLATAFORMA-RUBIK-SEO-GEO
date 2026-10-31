// Panel latency check for the F1 demo (npm run demo:f1 on :3231): signs in as the demo agency
// (4 projects, 2 organizations) and measures cold-ish navigations to /panel and to a project
// summary. Server Components render on each request in dev, so numbers are a smoke signal,
// not a production benchmark. Passphrase comes from RUBIK_DEMO_PASSPHRASE, never from disk.
import { chromium } from "@playwright/test";

const BASE = process.env.RUBIK_DEMO_URL ?? "http://localhost:3231";
const PASS = process.env.RUBIK_DEMO_PASSPHRASE;
if (!PASS) throw new Error("Define RUBIK_DEMO_PASSPHRASE (la imprime npm run demo:f1).");

const browser = await chromium.launch();
const page = await (await browser.newContext()).newPage();
await page.goto(`${BASE}/acceso`);
await page.getByLabel("Correo").fill("demo-agencia@rubik-demo.test");
await page.getByLabel("Contraseña").fill(PASS);
await page.getByRole("button", { name: "Entrar" }).click();
await page.waitForURL(/\/panel$/);

async function measure(path, label, times = 3) {
  const samples = [];
  for (let i = 0; i < times; i++) {
    const t0 = Date.now();
    await page.goto(`${BASE}${path}`, { waitUntil: "networkidle" });
    samples.push(Date.now() - t0);
  }
  console.log(`${label}: ${samples.map((s) => `${s} ms`).join(" · ")} (peor ${Math.max(...samples)} ms)`);
}

await measure("/panel", "panel (4 proyectos)");
const projectPath = await page.locator(".project-card", { hasText: "Hotel Playa Azul" })
  .getByRole("link", { name: "Abrir proyecto" }).getAttribute("href");
await measure(projectPath, "resumen de proyecto");
await browser.close();
