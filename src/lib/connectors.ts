// User-facing presentation of the Core's connector catalogue. The catalogue itself (ids,
// consent purpose, data class, paid, status) comes from the Core; this file only names and
// explains it in Spanish. Nothing here connects anything or asks for credentials.
import type { Connector } from "@rubik/seo-geo-core/platform-contracts";

interface ConnectorCopy {
  name: string;
  provides: string;
  stage: string;
}

const COPY: Readonly<Record<string, ConnectorCopy>> = {
  "search-console": { name: "Google Search Console", provides: "Clics, impresiones y estado de indexación de las páginas del cliente, solo lectura.", stage: "CORE-9.4" },
  "bing-webmaster": { name: "Bing Webmaster Tools", provides: "Estado de las URL en Bing, solo lectura.", stage: "CORE-9.5" },
  indexnow: { name: "IndexNow", provides: "Aviso a buscadores de URL nuevas o cambiadas. Cada envío requiere aprobación humana, y enviar no significa quedar indexado.", stage: "CORE-9.8" },
  dataforseo: { name: "DataForSEO", provides: "Palabras clave, resultados de búsqueda y enlaces de un proveedor externo. Son estimaciones de terceros, no mediciones propias.", stage: "Sin etapa asignada" },
  "openseo-mcp": { name: "OpenSEO (auditoría técnica)", provides: "Auditorías técnicas del sitio lanzadas manualmente desde la sección «Auditoría técnica» de cada proyecto, sin Lighthouse ni funciones de pago. Puente de servidor listo; sin credenciales configuradas ni conexión verificada.", stage: "Puente de servidor (ADR 0006)" },
  "ga4-referrals": { name: "Google Analytics 4 · tráfico de referencia", provides: "Visitas que llegan desde otros sitios y asistentes de IA. Todavía sin diseñar.", stage: "Sin etapa asignada" },
  "ai-model": { name: "Modelo de IA", provides: "Borradores y análisis a partir de evidencia aprobada y minimizada, siempre con revisión humana. El propietario elegirá proveedor y modelo.", stage: "CORE-9.7" },
};

const CONSENT: Readonly<Record<string, string>> = {
  "provider-connection": "Autorización del cliente para conectar su cuenta del proveedor",
  "data-import": "Autorización para importar datos de terceros al proyecto",
  "content-publication": "Autorización para publicar o avisar en nombre del cliente",
  "ai-processing": "Autorización para tratar evidencia del proyecto con IA",
};

const DEVELOPMENT: Readonly<Record<string, string>> = {
  NOT_IMPLEMENTED: "Diseñado, sin implementar",
  NOT_DESIGNED: "Pendiente de diseño",
};

export interface ConnectorView {
  id: string;
  name: string;
  provides: string;
  connection: "No conectado";
  development: string;
  stage: string;
  cost: string;
  consent: string;
}

export function connectorView(c: Connector): ConnectorView {
  const copy = COPY[c.id] ?? { name: c.id, provides: "Sin descripción.", stage: "Sin etapa asignada" };
  return {
    id: c.id,
    name: copy.name,
    provides: copy.provides,
    // CORE-9.0 has no connections at all, whatever the catalogue says.
    connection: "No conectado",
    development: DEVELOPMENT[c.status] ?? "Estado desconocido",
    stage: copy.stage,
    cost: c.paid ? "De pago: requerirá un presupuesto aprobado" : "Sin coste directo (con cuotas del proveedor)",
    consent: CONSENT[c.consent] ?? c.consent,
  };
}

export const hasCopy = (id: string) => id in COPY;
export const hasConsentCopy = (purpose: string) => purpose in CONSENT;
