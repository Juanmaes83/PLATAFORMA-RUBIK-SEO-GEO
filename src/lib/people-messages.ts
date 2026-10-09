// Spanish copy for project people and the data inventory (decision D3). Codes stay internal.
export const PEOPLE_ERRORS: Record<string, string> = {
  PEOPLE_FORBIDDEN: "Solo la titularidad de la organización gestiona las personas de este proyecto.",
  PEOPLE_INVALID: "La persona indicada no es válida.",
  PEOPLE_NOT_MEMBER: "Esa persona ya no pertenece al proyecto.",
  PEOPLE_OWNER: "No se puede retirar a una persona titular desde aquí.",
  PEOPLE_UNAVAILABLE: "Esta función no está disponible ahora mismo. No se ha cambiado nada.",
  PEOPLE_INVALID_RESPONSE: "La respuesta del servidor no tiene la forma esperada.",
};

export const PEOPLE_NOTICES: Record<string, string> = {
  retirada: "Acceso retirado y registrado en la auditoría firmada. La cuenta de la persona se conserva.",
  "retirada-sin-auditoria": "Acceso retirado. No se pudo registrar en la auditoría firmada (firma no configurada o no disponible). La cuenta de la persona se conserva.",
};

export const PEOPLE_PAGE_ERRORS: Record<string, string> = {
  confirmacion: "Marca la casilla de confirmación para retirar el acceso.",
  ...Object.fromEntries(Object.entries(PEOPLE_ERRORS).map(([k, v]) => [k.toLowerCase(), v])),
};
