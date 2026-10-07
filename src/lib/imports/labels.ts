// Spanish labels and messages for CORE-9.3 imports. Messages never echo file content.
export const IMPORT_STATUS_LABELS: Record<string, { label: string; tone: "ok" | "warn" | "no" | "neutral"; help: string }> = {
  complete: { label: "Completa", tone: "ok", help: "Todas las filas son válidas." },
  partial: { label: "Parcial", tone: "warn", help: "Algunas filas tienen errores y no se han guardado; los errores se listan abajo." },
  failed: { label: "Sin filas válidas", tone: "no", help: "Ninguna fila es válida. Se conserva el informe de errores." },
  empty: { label: "Sin hallazgos", tone: "neutral", help: "El fichero no declara hallazgos. No equivale a «cero problemas» medidos." },
};

export const SOURCE_KIND_LABELS: Record<string, string> = {
  audit: "Auditoría",
  "crawl-export": "Exportación de rastreo",
  "offpage-inventory": "Inventario off page",
  "manual-review": "Revisión manual",
};

export const SEVERITY_LABELS: Record<string, string> = {
  critical: "Crítica",
  high: "Alta",
  medium: "Media",
  low: "Baja",
  info: "Informativa",
};

export const FINDING_STATUS_LABELS: Record<string, string> = {
  open: "Abierto",
  resolved: "Resuelto",
  "accepted-risk": "Riesgo aceptado",
};

export const ROW_ERROR_LABELS: Record<string, string> = {
  REQUIRED: "Falta el campo",
  INVALID: "Valor no válido",
  TOO_LONG: "Demasiado largo",
  UNKNOWN_FIELD: "Campo no previsto",
  NOT_AN_OBJECT: "La fila no es un objeto",
  DUPLICATE_ROW: "Misma regla y URL repetidas en el fichero",
};

export const IMPORT_ERRORS: Record<string, string> = {
  EMPTY: "El fichero está vacío o no se ha elegido ninguno.",
  TOO_LARGE: "El fichero supera el tamaño máximo (900 000 bytes).",
  NOT_JSON: "El fichero no es JSON válido en UTF-8.",
  NOT_AN_OBJECT: "El fichero debe ser un objeto JSON.",
  UNKNOWN_FORMAT: "El formato no es «rubik-import-v1».",
  UNKNOWN_FIELD: "El fichero contiene campos no previstos en el formato.",
  SCOPE_MISMATCH: "El fichero declara otra organización u otro proyecto. No se ha guardado nada.",
  INVALID_SOURCE: "La fuente no es válida: tipo, etiqueta o URL.",
  INVALID_CAPTURED_AT: "Falta la fecha de captura o no tiene zona horaria explícita.",
  INVALID_PERIOD: "El periodo no es válido o termina después de la fecha de captura.",
  FINDINGS_REQUIRED: "Falta la lista de hallazgos.",
  TOO_MANY_FINDINGS: "El fichero supera el máximo de 5000 hallazgos.",
  DUPLICATE: "Este fichero ya se había importado.",
  NOT_ALLOWED: "Tu rol no permite importar en este proyecto.",
  "no-permitido": "Tu rol no permite esta acción en este proyecto.",
  "firma-no-configurada": "La importación no está disponible: falta configurar la firma de auditoría del servidor (ADR 0004).",
  WRITE_FAILED: "No se ha podido guardar la importación.",
  AUDIT_FAILED: "No se ha podido registrar la auditoría; revisa el registro de la importación.",
  confirmacion: "Para borrar, escribe «borrar» en la casilla de confirmación.",
  "no-borrada": "No se ha borrado: la importación no existe o tu rol no lo permite.",
};

export const IMPORT_NOTICES: Record<string, string> = {
  complete: "Importación guardada: todas las filas son válidas.",
  partial: "Importación guardada como parcial: revisa las filas no válidas.",
  failed: "Se ha guardado el informe, pero ninguna fila es válida.",
  empty: "Importación guardada: el fichero no declara hallazgos.",
  duplicado: "Este fichero ya estaba importado; se muestra la importación existente.",
  borrada: "Importación borrada y registrada en la auditoría.",
};
