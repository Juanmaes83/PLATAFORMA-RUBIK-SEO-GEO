import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ProjectDashboard } from "@/components/ProjectDashboard";
import type { ProjectModules, ModuleSignal } from "@/lib/signals";
import type { ImportRow } from "@/lib/imports/repository";
const signal = (state: ModuleSignal["state"]): ModuleSignal => ({state, lines:[], note:null, at:null});
const modules = (): ProjectModules => ({measurement:signal("pending"),technical:signal("no_data"),imports:signal("no_data"),competitors:signal("unavailable"),content:signal("unavailable"),geo:signal("unavailable"),audit:signal("no_data")});
afterEach(()=>vi.unstubAllEnvs());
describe("project intelligence evidence boundaries",()=>{
 it("keeps a failed evidence read distinct from empty or zero findings",()=>{
  const html=renderToStaticMarkup(<ProjectDashboard modules={modules()} imports={null} base="/project"/>);
  expect(html).toContain("No se pudo leer la evidencia");
  expect(html).not.toContain("Sin hallazgos abiertos en esta muestra");
  expect(html).not.toContain("0 hallazgos abiertos");
 });
 it("names the sample, affected URL and declaration without claiming uniqueness",()=>{
  const row={id:"import-1",source_label:"Revisión declarada",captured_at:"2026-10-20T08:00:00Z",status:"partial",findings:[{url:"https://ejemplo.test/pagina",title:"Título",observation:"Observación",severity:"high",status:"open"}]} as ImportRow;
  const html=renderToStaticMarkup(<ProjectDashboard modules={modules()} imports={[row]} base="/project"/>);
  expect(html).toContain("1 hallazgos abiertos en la muestra");
  expect(html).toContain("https://ejemplo.test/pagina");
  expect(html).toContain("Importación parcial");
  expect(html).toContain("Un hallazgo puede repetirse");
  expect(html).toContain('href="/project/importaciones/import-1"');
 });
 it("orders existing recorded sources first and hides unavailable N2 actions",()=>{
  vi.stubEnv("RUBIK_N2_SCHEMA_AVAILABLE","false");vi.stubEnv("RUBIK_N2_CONTENT_GEO_SCHEMA_AVAILABLE","false");
  const m=modules();m.technical=signal("data");m.geo=signal("data");
  const html=renderToStaticMarkup(<ProjectDashboard modules={m} imports={[]} base="/project"/>);
  const actions=html.slice(html.indexOf('id="next-title"'));
  expect(actions.indexOf("Consultar el análisis SEO")).toBeLessThan(actions.indexOf("Preparar la medición"));
  expect(actions).not.toContain('href="/project/geo"');
  expect(actions).not.toContain('href="/project/contenidos"');
  expect(actions).not.toContain('href="/project/competidores"');
 });
});
