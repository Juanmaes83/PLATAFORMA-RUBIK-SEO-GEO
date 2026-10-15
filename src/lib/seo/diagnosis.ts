/** Presentation diagnosis over already verified, project-scoped results. No acquisition here. */
import { auditSide } from "@/lib/openseo/compare";

export type SeoIssue = {
  url: string; category: string; severity: "ERROR" | "WARNING" | "OPPORTUNITY" | "UNKNOWN";
  group: string; explanation: string; recommendation: string; priority: string; status: "OPEN" | "UNKNOWN";
};

const RULES: { match: RegExp; group: string; explanation: string; recommendation: string }[] = [
  { match: /noindex|indexab|blocked|robots|crawl/i, group: "Indexabilidad", explanation: "La auditoría señala una restricción de acceso o indexación.", recommendation: "Comprobar si la exclusión es intencionada y revisar la directiva en la página o robots.txt." },
  { match: /canonical|duplicate/i, group: "Canonical", explanation: "La auditoría señala una posible discrepancia de URL canónica o duplicación.", recommendation: "Revisar la canonical declarada y elegir la URL preferida antes de corregirla." },
  { match: /hreflang|language/i, group: "Hreflang", explanation: "La auditoría señala una relación de idioma o región.", recommendation: "Revisar destinos y reciprocidad de las anotaciones hreflang." },
  { match: /sitemap/i, group: "Sitemap", explanation: "La auditoría señala el sitemap.", recommendation: "Revisar el sitemap publicado y la inclusión de las páginas previstas." },
  { match: /redirect|status|404|5[0-9][0-9]|broken/i, group: "HTTP y enlaces", explanation: "La auditoría señala una respuesta o un enlace que requiere revisión.", recommendation: "Comprobar la URL de origen y destino y corregir enlaces o redirecciones según corresponda." },
  { match: /title|description|meta|h1|heading|alt/i, group: "On-Page", explanation: "La auditoría señala un elemento de la página.", recommendation: "Abrir la página y verificar el elemento señalado antes de editarlo." },
];

export function diagnoseAudit(result: unknown): SeoIssue[] {
  const side = auditSide(result);
  if (!side) return [];
  const raw = (result as { data: unknown[] }).data;
  return side.issues.map((issue) => {
    const rule = RULES.find((r) => r.match.test(issue.category));
    const source = raw.find((row) => {
      if (!row || typeof row !== "object") return false;
      const value = row as { url?: unknown; category?: unknown };
      if (typeof value.url !== "string" || value.category !== issue.category) return false;
      try { return new URL(value.url).toString() === issue.url; } catch { return false; }
    }) as { status?: unknown } | undefined;
    return {
      ...issue,
      group: rule?.group ?? "Otros hallazgos",
      explanation: rule?.explanation ?? `OpenSEO clasificó este hallazgo como «${issue.category}». No hay detalle adicional en el contrato guardado.`,
      recommendation: rule?.recommendation ?? "Revisar el resultado original y la página antes de decidir una corrección.",
      priority: issue.severity === "ERROR" ? "Revisión alta" : issue.severity === "WARNING" ? "Revisión media" : "Por valorar",
      status: source?.status === "OPEN" ? "OPEN" : "UNKNOWN",
    };
  });
}

export function urlPath(raw: string): string {
  try { const url = new URL(raw); return `${url.pathname}${url.search}`; } catch { return raw; }
}

export const ONPAGE_FIELDS = [
  { label: "Title", need: "HTML o una importación que observe el título" },
  { label: "Meta description", need: "HTML o una importación que observe la descripción" },
  { label: "H1 y encabezados", need: "HTML o una importación de estructura de encabezados" },
  { label: "Canonical", need: "HTML o una importación que observe la canonical" },
  { label: "Imágenes y alt", need: "Inventario de imágenes y atributos alt" },
  { label: "Enlaces internos", need: "Grafo de enlaces de la página" },
  { label: "Contenido", need: "Contenido autorizado de la página" },
] as const;
