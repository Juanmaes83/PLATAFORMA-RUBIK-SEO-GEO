// Spanish copy for invitations (ADR 0020). Codes stay internal; people read only these texts.
export const INVITATION_ERRORS: Record<string, string> = {
  INVITATION_FORBIDDEN: "Solo la titularidad de la organización puede invitar a este proyecto.",
  INVITATION_INVALID: "Revisa el correo y el rol.",
  INVITATION_DUPLICATE: "Ya hay una invitación abierta para ese correo en este proyecto. Revócala antes de crear otra.",
  INVITATION_LIMIT: "Este proyecto ya tiene 50 invitaciones abiertas.",
  INVITATION_UNAVAILABLE: "Las invitaciones no están disponibles ahora mismo. No se ha creado nada.",
  INVITATION_INVALID_RESPONSE: "La respuesta del servidor no tiene la forma esperada. No se muestra ningún enlace.",
};

export const INVITATION_NOTICES: Record<string, string> = {
  revocada: "Invitación revocada. El enlace ya no funciona.",
};
export const INVITATION_PAGE_ERRORS: Record<string, string> = {
  revocar: "No se pudo revocar: la invitación ya no estaba abierta.",
};

export const ACCEPT_ERRORS: Record<string, string> = {
  "no-valida": "Esta invitación no se puede usar: puede haber caducado, haberse revocado o usado ya, o ser para otra cuenta.",
  miembro: "Ya perteneces a este proyecto. La invitación no cambia tu rol.",
  fallo: "No se pudo aceptar la invitación ahora mismo. Inténtalo más tarde.",
};

export const STATE_LABELS: Record<string, string> = { OPEN: "Abierta", ACCEPTED: "Aceptada", REVOKED: "Revocada", EXPIRED: "Caducada" };
