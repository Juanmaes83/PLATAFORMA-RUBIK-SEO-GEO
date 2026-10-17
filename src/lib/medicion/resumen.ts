export type MeasurementProvider = "search-console" | "google-analytics";
export type MetricFact = { key: string; label: string; value: string | number };
export type MeasurementRow = { label: string; metrics: MetricFact[] };

const METRICS: Record<MeasurementProvider, readonly [string, string][]> = {
  "search-console": [["clicks", "Clics"], ["impressions", "Impresiones"], ["ctr", "CTR"], ["averagePosition", "Posición media"]],
  "google-analytics": [["sessions", "Sesiones orgánicas"], ["activeUsers", "Usuarios activos"], ["engagedSessions", "Sesiones con interacción"], ["engagementRate", "Tasa de interacción"], ["keyEvents", "Eventos clave"], ["sessionKeyEventRate", "Tasa de eventos clave"], ["transactions", "Transacciones"], ["purchaseRevenue", "Ingresos de compra"]],
};

const rowRecord = (value: unknown): Record<string, unknown> | null =>
  value !== null && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : null;

/** Keep the provider's recorded row grain. Never sum averages or infer missing metrics. */
export function measurementRows(provider: MeasurementProvider, request: unknown, data: unknown): MeasurementRow[] {
  const context = rowRecord(request) ?? {};
  const labels = provider === "search-console"
    ? (Array.isArray(context.dimensions) ? context.dimensions.filter((d): d is string => typeof d === "string") : [])
    : ["hostName", "landingPage"];
  if (!Array.isArray(data)) return [];
  return data.flatMap((item) => {
    const row = rowRecord(item);
    if (!row) return [];
    const metrics = METRICS[provider].flatMap(([key, label]) => {
      const value = row[key];
      return typeof value === "number" && Number.isFinite(value) ? [{ key, label, value }] : [];
    });
    return [{ label: labels.map((key) => row[key]).filter((value) => value !== null && value !== undefined && value !== "").map(String).join(" · ") || "Fila de datos", metrics }];
  });
}

/** Explicitly name expected measurements missing from a signed row. */
export function unavailableMetrics(provider: MeasurementProvider, value: unknown): string[] {
  const row = rowRecord(value);
  if (!row) return METRICS[provider].map(([, label]) => label);
  return METRICS[provider].flatMap(([key, label]) => typeof row[key] === "number" && Number.isFinite(row[key]) ? [] : [label]);
}

export function coverageLabel(status: string): string {
  if (status === "PARTIAL") return "Parcial: no representa el total";
  if (status === "EMPTY") return "Consulta verificada, sin filas";
  if (status === "OK") return "Filas devueltas por la consulta";
  return "Cobertura desconocida";
}

export function associationLabel(state: "ACTIVE" | "REVOKED" | "NONE" | "FORBIDDEN" | "ERROR"): string {
  switch (state) {
    case "ACTIVE": return "Propiedad declarada y activa";
    case "REVOKED": return "Propiedad revocada";
    case "NONE": return "Sin propiedad declarada";
    case "FORBIDDEN": return "Estado no visible para este rol";
    default: return "No se pudo consultar el estado";
  }
}
