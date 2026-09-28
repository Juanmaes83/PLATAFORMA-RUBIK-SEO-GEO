// Spanish UI labels. Presentation only: the meaning of roles and actions is the Core's.
export const ROLE_LABELS: Record<string, string> = {
  owner: "Titular",
  "account-manager": "Gestión de cuenta",
  analyst: "Analista",
  "client-approver": "Cliente (aprobación)",
  viewer: "Solo lectura",
  system: "Sistema",
  ai: "Asistente IA",
};

export const ACTION_LABELS: Record<string, string> = {
  read: "Leer",
  draft: "Redactar borradores",
  "propose-action": "Proponer acciones",
  "review-action": "Revisar acciones",
  "approve-external-action": "Aprobar acciones externas",
  "execute-approved-action": "Ejecutar acciones aprobadas",
  "approve-fact": "Aprobar información",
  "confirm-cost": "Confirmar coste",
  "manage-connectors": "Gestionar conectores",
  "manage-secret-refs": "Gestionar referencias de secretos",
  "manage-members": "Gestionar miembros",
  "export-data": "Exportar datos",
  "delete-data": "Borrar datos",
};

export const CONNECTOR_STATUS_LABELS: Record<string, string> = {
  NOT_IMPLEMENTED: "No implementado",
  NOT_DESIGNED: "Sin diseñar",
};

/** D-27: how the UI names the state of any measurement once measurements exist. */
export const MEASUREMENT_STATES = [
  { id: "observed", label: "Observado", description: "Medido por una fuente identificada, con fecha." },
  { id: "estimated", label: "Estimado", description: "Cifra de un tercero o calculada; no es una medición propia." },
  { id: "unverified", label: "No verificado", description: "Declarado o importado sin verificación de la fuente." },
  { id: "unknown", label: "Desconocido", description: "No hay dato. Nunca se muestra como cero." },
] as const;

export const roleLabel = (role: string) => ROLE_LABELS[role] ?? role;
export const actionLabel = (action: string) => ACTION_LABELS[action] ?? action;
