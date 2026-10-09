import "server-only";
import type { ToolCaller } from "./search-console";

// GA4 first report via OpenSEO. The caller must resolve an ACTIVE connection and a confirmed
// property from authorized server state. No action/UI is wired: deployment cannot execute it.
// Other envelopes (overview, health and combined opportunities) require their own mapping;
// never flatten those into rows or silently discard their context.
export const ANALYTICS_LANDING_PAGES_TOOL = "get_google_analytics_organic_landing_pages";
const object = (v: unknown): Record<string, unknown> | null => v && typeof v === "object" && !Array.isArray(v) ? v as Record<string, unknown> : null;
const date = (v: unknown): v is string => typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v)
  && !Number.isNaN(Date.parse(`${v}T00:00:00Z`)) && new Date(`${v}T00:00:00Z`).toISOString().slice(0, 10) === v;
const failure = (httpStatus: number, message: string, retryAfter?: number) => ({ httpStatus, message, ...(retryAfter === undefined ? {} : { retryAfter }) });

export function analyticsFailure(error: unknown) {
  const e = object(error);
  const code = typeof e?.code === "string" ? e.code : "unknown";
  const httpStatus = ({ ga4_not_connected: 401, ga4_reconnect_required: 401, ga4_property_inaccessible: 403,
    ga4_report_incompatible: 400, validation_error: 400, ga4_quota_exhausted: 429,
    ga4_upstream_unavailable: 503, ga4_malformed_response: 502 } as Record<string, number>)[code] ?? 502;
  // Never copy provider messages, action URLs or account metadata into errors.
  const retry = e?.retryAfterSeconds;
  return failure(httpStatus, `GA4: ${code in { ga4_not_connected: 1, ga4_reconnect_required: 1, ga4_property_inaccessible: 1, ga4_report_incompatible: 1, validation_error: 1, ga4_quota_exhausted: 1, ga4_upstream_unavailable: 1, ga4_malformed_response: 1 } ? code : "invalid_response"}`,
    httpStatus === 429 && typeof retry === "number" && Number.isFinite(retry) && retry >= 0 ? retry : undefined);
}

export function createOpenSeoAnalyticsTransport(opts: {
  mcp: ToolCaller;
  openseoProjectId: string;
  expectedPropertyId: string;
}) {
  return {
    kind: "live" as const,
    async request(operation: string, input: unknown) {
      if (!/^[A-Za-z0-9_-]{1,128}$/.test(opts.openseoProjectId)) return failure(401, "Sin conexión OpenSEO del proyecto");
      if (!/^properties\/[0-9]{1,20}$/.test(opts.expectedPropertyId)) return failure(403, "Propiedad GA4 no confirmada");
      const i = object(input);
      if (operation !== "report" || i?.report !== "organic_landing_pages") return failure(400, "Informe GA4 no implementado");
      if (i.propertyId !== opts.expectedPropertyId) return failure(403, "La propiedad no coincide con el proyecto");
      const fields = ["report", "propertyId", "startDate", "endDate", "limit", "offset"];
      if (Object.keys(i).some((k) => !fields.includes(k)) || !date(i.startDate) || !date(i.endDate) || i.startDate > i.endDate
        || !Number.isInteger(i.limit) || (i.limit as number) < 1 || (i.limit as number) > 1000
        || !Number.isSafeInteger(i.offset) || (i.offset as number) < 0) return failure(400, "Petición GA4 inválida");
      let reply;
      try {
        reply = await opts.mcp.callTool(ANALYTICS_LANDING_PAGES_TOOL, { projectId: opts.openseoProjectId,
          startDate: i.startDate, endDate: i.endDate, limit: i.limit, offset: i.offset });
      } catch (error) {
        const e = error as { status?: number; code?: string };
        return failure(e.status === 401 ? 401 : e.status === 429 ? 429 : e.status === 403 || e.code === "FORBIDDEN" ? 403 : 502, "OpenSEO no respondió a GA4");
      }
      const sc = object(reply.structuredContent);
      if (!sc || reply.isError) return failure(502, "Respuesta GA4 inválida");
      if (sc.status === "error") return analyticsFailure(sc.error);
      if (sc.status !== "ok") return failure(502, "Estado GA4 inválido");
      const source = object(sc.source), request = object(sc.request), range = object(request?.resolvedDateRange), page = object(sc.pageInfo), meta = object(sc.reportMetadata);
      if (source?.provider !== "google_analytics" || source.propertyId !== opts.expectedPropertyId) return failure(403, "OpenSEO respondió con otra propiedad GA4");
      if (!page || request?.reportKind !== "landing_pages" || request.channel !== "organic_search" || range?.startDate !== i.startDate || range.endDate !== i.endDate
        || request.limit !== i.limit || request.offset !== i.offset || page?.limit !== i.limit || page.offset !== i.offset) return failure(502, "GA4 no corresponde a la consulta");
      const rowEnd = (i.offset as number) + (Array.isArray(sc.rows) ? sc.rows.length : 0);
      const hasMore = rowEnd < (sc.totalRowCount as number);
      if (!Array.isArray(sc.rows) || sc.rows.length > (i.limit as number) || sc.rowCount !== sc.rows.length
        || !Number.isSafeInteger(sc.totalRowCount) || (sc.totalRowCount as number) < 0
        || !Number.isSafeInteger(rowEnd) || (sc.rows.length === 0 && (i.offset as number) < (sc.totalRowCount as number))
        || (sc.rows.length > 0 && rowEnd > (sc.totalRowCount as number))
        || typeof page.hasMore !== "boolean" || page.hasMore !== hasMore
        || page.nextOffset !== (hasMore ? rowEnd : null) || !meta || typeof meta.hasLimitedData !== "boolean"
        || typeof meta.subjectToThresholding !== "boolean" || typeof meta.dataLossFromOtherRow !== "boolean"
        || !Array.isArray(meta.sampling) || !Array.isArray(meta.restrictedMetrics)
        || !meta.restrictedMetrics.every((metric) => typeof metric === "string")
        || !Array.isArray(sc.warnings) || !sc.warnings.every((w) => typeof w === "string")
        || !sc.rows.every((r) => object(r) !== null)) return failure(502, "Filas o cobertura GA4 inválidas");
      // Quota/threshold/sampling warnings must survive as PARTIAL, never a complete report.
      const limited = meta.hasLimitedData === true || meta.subjectToThresholding === true || meta.dataLossFromOtherRow === true || meta.sampling.length > 0 || meta.restrictedMetrics.length > 0 || sc.warnings.length > 0;
      return { rows: sc.rows, sourceUrl: opts.expectedPropertyId, restrictedMetrics: meta.restrictedMetrics, truncated: hasMore || limited,
        ...(limited ? { errors: [{ code: "GA4_LIMITED_DATA", message: "GA4 informa de cobertura limitada o advertencias; no es un informe completo", retryable: false }] } : {}) };
    },
  };
}
