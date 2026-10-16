// Spanish messages for N2-11. Codes come from the URL; the text always comes from these
// fixed tables (pick()), never from the query string.

export const COMPETITOR_ERRORS: Record<string, string> = {
  "no-permitido": "Tu rol en este proyecto no permite esta acción.",
  "firma-no-configurada": "La firma de auditoría no está configurada en el servidor: no se guarda ningún cambio sin su registro.",
  EMPTY: "Escribe el dominio del competidor.",
  TOO_LONG: "La dirección es demasiado larga.",
  INVALID: "No es un dominio válido. Escribe algo como «competidor.es».",
  UNSUPPORTED_SCHEME: "Solo se aceptan dominios o direcciones http/https.",
  CREDENTIALS: "La dirección no puede incluir usuario ni contraseña.",
  IP_ADDRESS: "Escribe un dominio, no una dirección IP.",
  SINGLE_LABEL: "Falta la extensión del dominio (por ejemplo, «.es»).",
  RESERVED: "Ese dominio es local o reservado; no identifica un competidor público.",
  SAME_AS_PROJECT: "Ese dominio es el del propio proyecto.",
  NAME: "El nombre admite como máximo 120 caracteres.",
  NOTES: "Las notas superan la longitud máxima.",
  RELATION: "Elige si es competidor directo o indirecto.",
  METRIC: "Elige una métrica de la lista.",
  METHOD: "Indica si el dato es observado en una herramienta o declarado manualmente.",
  VALUE_REQUIRED: "Escribe el valor, o marca la métrica como «no disponible en la fuente».",
  VALUE_INVALID: "El valor debe ser un número sin separadores de miles (por ejemplo, 1234 o 12,5).",
  VALUE_RANGE: "El valor está fuera de rango (la autoridad va de 0 a 100).",
  VALUE_NOT_INTEGER: "Esta métrica es un recuento: escribe un número entero.",
  SOURCE: "Indica la fuente (máximo 80 caracteres).",
  REFERENCE: "La referencia admite como máximo 500 caracteres.",
  DATE: "La fecha de la observación no es válida.",
  DATE_FUTURE: "La fecha de la observación no puede ser futura.",
  COUNTRY: "El país va en código de dos letras (por ejemplo, ES).",
  LANGUAGE: "El idioma va en código de dos letras (por ejemplo, es).",
  DEVICE: "Elige escritorio o móvil.",
  DUPLICATE_OBSERVATION: "Ya existe esa misma lectura (métrica, fuente, método, fecha y mercado).",
  ARCHIVED: "El competidor está archivado: restáuralo antes de registrar observaciones.",
  NOT_FOUND: "No se ha encontrado ese elemento en este proyecto.",
  WRITE_FAILED: "No se pudo guardar. Inténtalo de nuevo.",
  confirmacion: "Escribe «borrar» para confirmar.",
};

export const COMPETITOR_NOTICES: Record<string, string> = {
  creado: "Competidor añadido.",
  existente: "Ese competidor ya estaba en el proyecto; se muestra el existente.",
  actualizado: "Datos del competidor actualizados.",
  archivado: "Competidor archivado. Sus observaciones se conservan.",
  restaurado: "Competidor restaurado.",
  borrado: "Competidor borrado junto con sus observaciones.",
  observacion: "Observación registrada.",
  verificada: "Observación verificada.",
  "observacion-borrada": "Observación borrada.",
};

/** Shown when a change is stored but its audit receipt could not be signed yet. */
export const AUDIT_PENDING =
  "El cambio se ha guardado y su registro de auditoría queda pendiente de firma; se completará en el siguiente procesado.";
