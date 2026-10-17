// Spanish messages for N2-13. The URL only carries a code; the text comes from these tables.

export const GEO_ERRORS: Record<string, string> = {
  "module-unavailable": "El módulo no está activado en este despliegue. No se ha guardado nada.",
  "no-permitido": "Tu rol en este proyecto no permite esta acción.",
  "firma-no-configurada": "La firma de auditoría no está configurada en el servidor: no se guarda ningún cambio sin su registro.",
  confirmacion: "Escribe «borrar» para confirmar.",
  ENTITY: "Escribe la marca o entidad observada (máximo 120 caracteres).",
  ENGINE: "Elige el motor declarado.",
  ENGINE_DETAIL: "El modelo o versión admite como máximo 80 caracteres.",
  QUERY: "Escribe la consulta exacta (máximo 500 caracteres).",
  DATE: "La fecha observada no es válida (desde 2023).",
  DATE_FUTURE: "La fecha observada no puede ser futura.",
  LANGUAGE: "El idioma va en código de dos letras (por ejemplo, es).",
  COUNTRY: "El país va en código de dos letras (por ejemplo, ES).",
  METHOD: "Indica cómo se obtuvo la respuesta.",
  PRESENCE: "Indica si la marca aparece, se cita o no aparece.",
  EXCERPT: "El fragmento admite como máximo 4000 caracteres: guarda solo la parte relevante.",
  SOURCES: "Fuentes citadas: una por línea, «https://… | título» (máximo 20, solo http/https).",
  CITED_NEEDS_SOURCE: "Si la marca se cita, añade al menos la URL citada.",
  ENTITIES: "Otras entidades: una por línea (máximo 20, de hasta 120 caracteres).",
  REFERENCE: "La referencia a la evidencia original admite como máximo 500 caracteres.",
  NOTES: "Las notas superan la longitud máxima.",
  NOTE: "La nota de revisión admite como máximo 500 caracteres.",
  NO_OPPORTUNITY: "Esa oportunidad ya no se deduce de las observaciones actuales.",
  DUPLICATE: "Ya existe ese registro (misma observación o misma propuesta abierta).",
  NOT_ALLOWED: "Tu rol en este proyecto no permite esta acción.",
  NOT_FOUND: "No se ha encontrado ese elemento en este proyecto.",
  INVALID: "Algún dato no es válido.",
  LOCKED: "Solo se puede editar una propuesta pendiente de revisión.",
  TRANSITION: "Ese cambio de estado no está permitido.",
  WRITE_FAILED: "No se pudo guardar. Inténtalo de nuevo.",
};

export const GEO_NOTICES: Record<string, string> = {
  "observacion-registrada": "Observación registrada como declarada. Queda pendiente de verificación.",
  "observacion-verificada": "Observación verificada. Queda registrado quién la verificó y cuándo.",
  "observacion-borrada": "Observación borrada.",
  "propuesta-creada": "Propuesta guardada para revisión.",
  "propuesta-aceptada": "Propuesta aceptada.",
  "propuesta-rechazada": "Propuesta rechazada.",
  "propuesta-hecha": "Propuesta marcada como hecha.",
  "propuesta-reabierta": "Propuesta reabierta.",
  "propuesta-borrada": "Propuesta borrada.",
};

export const AUDIT_PENDING =
  "El cambio se ha guardado y su registro de auditoría queda pendiente de firma; se completará en el siguiente procesado.";
