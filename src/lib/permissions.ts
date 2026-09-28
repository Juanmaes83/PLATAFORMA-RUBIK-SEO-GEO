// Presentation of the Core's `authorize` decisions. Two different things are shown apart:
//  1. what the ROLE grants (the Core's decision, unchanged), and
//  2. whether the platform FUNCTION exists yet (a CORE-9 stage fact).
// A granted permission for a function that is not built must never look usable.
import type { Decision } from "@rubik/seo-geo-core/platform-contracts";
import { actionLabel, roleLabel } from "@/lib/labels";

export interface PlatformFunction {
  label: string;
  available: boolean;
  stage?: string;
}

/** Which platform function each Core action corresponds to, and whether it exists. */
export const FUNCTION_FOR_ACTION: Readonly<Record<string, PlatformFunction>> = {
  read: { label: "Ver el resumen del proyecto", available: true },
  draft: { label: "Biblioteca de borradores", available: false, stage: "CORE-9.6" },
  "propose-action": { label: "Acciones y campañas", available: false, stage: "CORE-9.6" },
  "review-action": { label: "Bandeja de revisión", available: false, stage: "CORE-9.6" },
  "approve-external-action": { label: "Aprobación de acciones externas", available: false, stage: "CORE-9.6 y 9.8" },
  "execute-approved-action": { label: "Ejecución de acciones aprobadas", available: false, stage: "CORE-9.8" },
  "approve-fact": { label: "Información aprobada del cliente", available: false, stage: "CORE-9.3" },
  "confirm-cost": { label: "Confirmación de coste y presupuesto", available: false, stage: "CORE-9.2" },
  "manage-connectors": { label: "Conectores del proyecto", available: false, stage: "CORE-9.4 y 9.5" },
  "manage-secret-refs": { label: "Referencias de credenciales (sin valores)", available: false, stage: "CORE-9.2" },
  "manage-members": { label: "Miembros y roles", available: false, stage: "CORE-9.1" },
  "export-data": { label: "Exportación de datos", available: false, stage: "CORE-9.2" },
  "delete-data": { label: "Borrado de datos", available: false, stage: "CORE-9.2" },
};

/** Plain-language explanation for each denial code the Core's `authorize` can return. */
export const DENIAL_EXPLANATIONS: Readonly<Record<string, (ctx: { role: string; action: string }) => string>> = {
  ROLE_NOT_ALLOWED: ({ role, action }) =>
    action === "execute-approved-action"
      ? "Ninguna persona ejecuta directamente: la ejecución la hará el sistema, y solo tras una aprobación humana registrada."
      : `El rol ${roleLabel(role)} no incluye esta acción.`,
  HUMAN_APPROVAL_REQUIRED: () => "Hace falta una aprobación humana registrada para esta acción concreta, y todavía no existe ninguna.",
  APPROVER_IDENTITY_REQUIRED: () => "La aprobación no indica quién la dio.",
  APPROVER_ROLE_NOT_ALLOWED: () => "Quien aprobó no tiene un rol autorizado para aprobar acciones externas.",
  APPROVAL_DATE_INVALID: () => "La aprobación no tiene una fecha válida.",
  APPROVAL_SCOPE_MISMATCH: () => "La aprobación pertenece a otro proyecto.",
  NOT_A_MEMBER_OF_SCOPE: () => "No perteneces a este proyecto.",
  SCOPE_REQUIRED: () => "La solicitud no indica a qué proyecto se refiere.",
  UNKNOWN_ROLE: () => "El rol no es uno de los roles definidos en el Core.",
  UNKNOWN_ACTION: () => "La acción no existe en los contratos del Core.",
};

export type PermissionState = "available" | "granted-not-built" | "denied";

export interface PermissionView {
  action: string;
  actionLabel: string;
  state: PermissionState;
  /** What the role grants, per the Core. */
  roleGrant: string;
  /** Whether the platform function exists. */
  functionLabel: string;
  availability: string;
  /** One sentence the user can act on. */
  explanation: string;
  /** Core code, kept only for diagnosis (null when allowed). */
  diagnosticCode: string | null;
}

export function explainDenial(reason: string | null, ctx: { role: string; action: string }): string {
  const explain = reason ? DENIAL_EXPLANATIONS[reason] : undefined;
  return explain ? explain(ctx) : "El Core ha denegado esta acción por un motivo no reconocido por la plataforma.";
}

export function permissionView(action: string, decision: Decision, role: string): PermissionView {
  const fn = FUNCTION_FOR_ACTION[action] ?? { label: actionLabel(action), available: false };
  const availability = fn.available ? "Disponible" : `No disponible todavía${fn.stage ? ` (${fn.stage})` : ""}`;
  const base = { action, actionLabel: actionLabel(action), functionLabel: fn.label, availability };
  if (!decision.allowed) {
    return { ...base, state: "denied", roleGrant: "Tu rol no lo permite", explanation: explainDenial(decision.reason, { role, action }), diagnosticCode: decision.reason };
  }
  if (!fn.available) {
    return {
      ...base,
      state: "granted-not-built",
      roleGrant: "Tu rol lo permite",
      explanation: `Tendrás este permiso cuando exista la función${fn.stage ? ` (${fn.stage})` : ""}. Hoy no se puede usar.`,
      diagnosticCode: null,
    };
  }
  return { ...base, state: "available", roleGrant: "Tu rol lo permite", explanation: "Puedes usarlo ahora.", diagnosticCode: null };
}
