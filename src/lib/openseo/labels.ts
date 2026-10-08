// Spanish copy for the OpenSEO bridge states and codes. Codes stay visible only as a small
// diagnostic detail (.diag), never as the main text.
export const CONNECTION_LABELS: Readonly<Record<string, { label: string; tone: "neutral" | "warn" | "ok" | "no"; text: string }>> = {
  NOT_CONFIGURED: { label: "No configurado", tone: "neutral", text: "El servidor no tiene configurada ninguna instancia de OpenSEO." },
  NOT_CONNECTED: { label: "No conectado", tone: "warn", text: "La instancia responde, pero la autorización no está confirmada." },
  CONNECTED: { label: "Conectado", tone: "ok", text: "La instancia está sana y la autenticación se ha verificado ahora mismo." },
  ERROR: { label: "Error", tone: "no", text: "La prueba de conexión ha fallado." },
};

export const REASON_TEXT: Readonly<Record<string, string>> = {
  WHOAMI_UNVERIFIED: "Falta configurar en el servidor el campo de whoami que confirma la autenticación. Abajo se listan los nombres de campo observados (sin valores) para elegirlo.",
  MOCK_CLIENT: "La respuesta procede de un cliente simulado: no cuenta como conexión.",
  CONFIG_INVALID: "La configuración del servidor no es válida. Revísala según docs/ENVIRONMENT.md.",
  NOT_CONFIGURED: "Configura OpenSEO en el servidor según docs/ENVIRONMENT.md.",
};

export const ERROR_TEXT: Readonly<Record<string, string>> = {
  AUTH: "OpenSEO ha rechazado la clave.",
  FORBIDDEN: "OpenSEO ha denegado el acceso.",
  RATE_LIMITED: "OpenSEO ha limitado las peticiones. Prueba más tarde.",
  USAGE_EXCEEDED: "Se ha superado el uso permitido de OpenSEO.",
  TIMEOUT: "OpenSEO no ha respondido a tiempo.",
  TRANSPORT_ERROR: "No se ha podido hablar con OpenSEO.",
  MCP_ERROR: "OpenSEO ha devuelto un error de protocolo.",
  TOOL_ERROR: "La herramienta de OpenSEO ha devuelto un error.",
  NO_STRUCTURED_CONTENT: "La respuesta de OpenSEO no tiene datos estructurados.",
  INVALID_RESPONSE: "La respuesta de OpenSEO no tiene la forma esperada.",
  WHOAMI_NOT_AUTHENTICATED: "whoami no confirma la autenticación.",
  AUDIT_CAPACITY_REACHED: "OpenSEO no admite más auditorías ahora mismo.",
  AUDIT_ALREADY_RUNNING: "Ya hay una auditoría en curso para este proyecto de OpenSEO.",
  AUDIT_REFUSED: "OpenSEO no ha iniciado la auditoría.",
  AUDIT_FAILED: "OpenSEO informa de que la auditoría ha fallado.",
  UNCLASSIFIED_STATUS: "El estado devuelto no está en el vocabulario configurado: la auditoría sigue en curso hasta que se clasifique.",
  NOT_CONFIGURED: "OpenSEO no está configurado en el servidor.",
  CONFIG_INVALID: "La configuración de OpenSEO del servidor no es válida.",
  INVALID_URL: "La URL no es válida.",
  NOT_HTTPS: "Solo se auditan URL https.",
  HOST_NOT_AUDITABLE: "Ese host no se puede auditar (IP, localhost o una preview).",
  HOST_NOT_ALLOWED: "Ese host no está autorizado para auditorías en este servidor.",
  NOT_PROJECT_DOMAIN: "Solo se audita el dominio de este proyecto.",
  MAX_PAGES_NOT_ALLOWED: "El límite de páginas está fuera del máximo permitido.",
  CONFIRMATION_REQUIRED: "Marca la confirmación para lanzar la auditoría.",
  INVALID_AUDIT_ID: "El identificador de auditoría no es válido.",
  HEALTH: "La comprobación de salud de OpenSEO ha fallado.",
};

export const AUDIT_STATE_LABELS: Readonly<Record<string, { label: string; tone: "neutral" | "warn" | "ok" | "no" }>> = {
  SYNCING: { label: "En curso", tone: "warn" },
  UNCLASSIFIED: { label: "En curso (estado sin clasificar)", tone: "warn" },
  COMPLETED: { label: "Terminada", tone: "ok" },
  FAILED: { label: "Fallida", tone: "no" },
};

export const SEVERITY_LABELS: Readonly<Record<string, string>> = {
  ERROR: "Crítica",
  WARNING: "Aviso",
  OPPORTUNITY: "Oportunidad",
};

export const errorText = (code: string | null | undefined) => (code ? ERROR_TEXT[code] ?? "Error de OpenSEO." : "");
