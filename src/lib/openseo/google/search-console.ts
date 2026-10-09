import "server-only";
import { mapSearchAnalyticsRows, searchConsolePropertyFor, validateSearchAnalyticsInput } from "@/lib/search-console/transport";
import { isResolvedGoogleSource, type GoogleSource } from "./properties";

// Search Console through OpenSEO (owner decision of 09/10/2026; docs/GSC-GA4-OPENSEO.md). A
// transport for the Core's existing `search-console.searchAnalytics` operation: the Core still
// validates, normalizes and issues the trusted result that the platform signs; only the way the
// rows are fetched changes. Rubik never holds a Google token: OpenSEO keeps the OAuth grant and
// maps ONE property to each OpenSEO project, so the property cannot be chosen through MCP.
//
// Tool (reference code open-seo@0ffff93, src/server/mcp/tools/search-console-tools.ts):
//   get_search_console_performance — read-only, no credits. Input: projectId, dimensions (1–4),
//   startDate/endDate (both or none, Pacific Time), rowLimit 1–1000, startRow, type, dataState.
//   Result: { ok, siteUrl, startDate, endDate, dimensions, rowCount, rows[{keys, clicks,
//   impressions, ctr, position?}], hasMore, nextStartRow } or { ok:false, reason, connectUrl }.
//
// Isolation, fail closed: the OpenSEO project must be this project's ACTIVE connection (resolved
// by the caller), the requested property must belong to the project domain, and the property
// OpenSEO actually answered with must be exactly the expected one. Otherwise no row is returned.

export const SEARCH_CONSOLE_TOOL = "get_search_console_performance";
export const OPENSEO_MAX_ROWS = 1000;

export interface ToolCaller {
  callTool(name: string, args: Record<string, unknown>): Promise<{ structuredContent?: unknown; isError?: boolean; content?: unknown }>;
}

type TransportReply =
  | { rows: Record<string, string | number | null>[]; truncated: boolean; sourceUrl: string }
  | { httpStatus: number; message: string; retryAfter?: number };

/** OpenSEO folds several Google failures into `api_error`; its fixed English text tells them apart. */
export function searchConsoleFailure(reason: unknown, text: string): { httpStatus: number; message: string } {
  if (reason === "not_connected") return { httpStatus: 401, message: "Search Console no está conectado en el proyecto de OpenSEO" };
  if (reason === "gsc_oauth_not_configured") return { httpStatus: 503, message: "La instancia de OpenSEO no tiene OAuth de Google configurado" };
  if (reason === "invalid_request") return { httpStatus: 400, message: "Petición rechazada por OpenSEO" };
  if (/rate limit/i.test(text)) return { httpStatus: 429, message: "Límite de Search Console alcanzado" };
  if (/expired or was revoked/i.test(text)) return { httpStatus: 401, message: "La conexión de Google en OpenSEO ha caducado o se ha revocado" };
  if (/denied access/i.test(text)) return { httpStatus: 403, message: "Search Console deniega el acceso a la propiedad" };
  if (/not found/i.test(text)) return { httpStatus: 404, message: "La propiedad ya no existe en Search Console" };
  return { httpStatus: 502, message: "Error de Search Console a través de OpenSEO" };
}

const textOf = (result: unknown) => {
  const content = (result as { content?: unknown })?.content;
  return Array.isArray(content) ? content.map((c) => (typeof (c as { text?: unknown })?.text === "string" ? (c as { text: string }).text : "")).join(" ") : "";
};

export function createOpenSeoSearchConsoleTransport(opts: {
  mcp: ToolCaller;
  /** The OpenSEO project of this Rubik project's ACTIVE connection; never the global one. */
  openseoProjectId: string;
  /** The property confirmed for this project (sc-domain:… or https://…/). */
  expectedSiteUrl: string;
  projectDomain: string | null;
  /** Server-resolved association permits an explicitly consented property on another TLD. */
  resolvedSource?: GoogleSource;
}) {
  return {
    kind: "live" as const,
    async request(operation: string, input: unknown): Promise<TransportReply> {
      if (operation !== "searchAnalytics") return { httpStatus: 400, message: "Operation not allowed by the platform transport" };
      if (!/^[A-Za-z0-9_-]{1,128}$/.test(opts.openseoProjectId)) return { httpStatus: 401, message: "Sin conexión de OpenSEO del proyecto" };
      const authorizedBinding = isResolvedGoogleSource(opts.resolvedSource)
        && opts.resolvedSource.provider === "search-console"
        && opts.resolvedSource.externalPropertyId === opts.expectedSiteUrl
        && opts.resolvedSource.openseoProjectId === opts.openseoProjectId;
      if (!searchConsolePropertyFor(opts.projectDomain, opts.expectedSiteUrl) && !authorizedBinding) {
        return { httpStatus: 403, message: "Property has no authorized project binding" };
      }
      if (!validateSearchAnalyticsInput(input)) return { httpStatus: 400, message: "Invalid Search Analytics request" };
      if (input.siteUrl !== opts.expectedSiteUrl) return { httpStatus: 403, message: "Property does not match the request" };
      if (input.dimensions.length < 1 || input.dimensions.length > 4) return { httpStatus: 400, message: "OpenSEO requires between 1 and 4 dimensions" };
      if (input.rowLimit > OPENSEO_MAX_ROWS) return { httpStatus: 400, message: "OpenSEO returns at most 1000 rows per call" };
      let result: { structuredContent?: unknown; isError?: boolean; content?: unknown };
      try {
        result = await opts.mcp.callTool(SEARCH_CONSOLE_TOOL, {
          projectId: opts.openseoProjectId,
          dimensions: input.dimensions,
          startDate: input.startDate,
          endDate: input.endDate,
          rowLimit: input.rowLimit,
          ...(input.startRow !== undefined ? { startRow: input.startRow } : {}),
          ...(input.type ? { type: input.type } : {}),
          ...(input.dataState ? { dataState: input.dataState } : {}),
        });
      } catch (error) {
        // FORBIDDEN (project not reachable with this key) and transport failures surface as throws.
        const status = (error as { status?: unknown })?.status;
        return /FORBIDDEN/.test(String((error as Error)?.message)) ? { httpStatus: 403, message: "El proyecto de OpenSEO no es accesible con esta clave" }
          : { httpStatus: typeof status === "number" ? status : 502, message: "OpenSEO no respondió" };
      }
      const sc = (result.structuredContent ?? null) as Record<string, unknown> | null;
      if (!sc || typeof sc !== "object") {
        // A thrown AppError reaches MCP clients as isError with its code as text.
        return /FORBIDDEN/.test(textOf(result)) ? { httpStatus: 403, message: "El proyecto de OpenSEO no es accesible con esta clave" }
          : { httpStatus: 502, message: "Respuesta de OpenSEO sin contenido estructurado" };
      }
      if (sc.ok !== true || result.isError) return searchConsoleFailure(sc.reason, textOf(result));
      // OpenSEO picked the property from its own mapping: it must be exactly the expected one.
      if (sc.siteUrl !== opts.expectedSiteUrl) return { httpStatus: 403, message: "OpenSEO respondió con otra propiedad: no se usa ningún dato" };
      if (JSON.stringify(sc.dimensions) !== JSON.stringify(input.dimensions) || sc.startDate !== input.startDate || sc.endDate !== input.endDate) {
        return { httpStatus: 502, message: "La respuesta no corresponde a la petición" };
      }
      // Missing/malformed rows must not be signed as an honest empty report.
      if (!Array.isArray(sc.rows) || sc.rowCount !== sc.rows.length || sc.rows.length > input.rowLimit
        || typeof sc.hasMore !== "boolean" || !sc.rows.every((raw) => {
          if (!raw || typeof raw !== "object") return false;
          const row = raw as Record<string, unknown>;
          return Array.isArray(row.keys) && row.keys.length === input.dimensions.length && row.keys.every((k) => typeof k === "string")
            && ["clicks", "impressions", "ctr"].every((k) => typeof row[k] === "number" && Number.isFinite(row[k]) && (row[k] as number) >= 0)
            && (row.ctr as number) <= 1
            && (row.position === undefined || (typeof row.position === "number" && Number.isFinite(row.position) && row.position >= 1));
        })) return { httpStatus: 502, message: "Malformed Search Analytics rows or pagination" };
      const rows = mapSearchAnalyticsRows(sc, input.dimensions);
      if (rows === null) return { httpStatus: 502, message: "Unexpected Search Analytics response" };
      return { rows, truncated: sc.hasMore === true || rows.length === input.rowLimit, sourceUrl: opts.expectedSiteUrl };
    },
  };
}
