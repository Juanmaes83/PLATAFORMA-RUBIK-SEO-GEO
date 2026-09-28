// Authentication mode for CORE-9.0. Only the local mock is implemented, and ONLY for
// development/demo: it can never be enabled when NODE_ENV=production. Supabase Auth is
// approved (D-26) and is implemented in CORE-9.1; until then selecting it never "works".
export type AuthMode = "mock" | "supabase-not-implemented" | "disabled";

export interface AuthModeInfo {
  mode: AuthMode;
  canSignIn: boolean;
  notice: string;
}

type Env = Record<string, string | undefined>;

export const MOCK_FORBIDDEN_IN_PRODUCTION =
  "AUTH_MODE=mock está prohibido en producción: la autenticación de demostración solo existe para desarrollo local.";

const requested = (env: Env) => (env.AUTH_MODE ?? "").trim().toLowerCase();

export function resolveAuthMode(env: Env): AuthModeInfo {
  const mode = requested(env);
  if (mode === "supabase") {
    return { mode: "supabase-not-implemented", canSignIn: false, notice: "Supabase Auth aún no está implementado (CORE-9.1). No hay inicio de sesión." };
  }
  if (env.NODE_ENV === "production") {
    // Never mock in production, whatever AUTH_MODE says (startup also refuses it).
    return {
      mode: "disabled",
      canSignIn: false,
      notice: mode === "mock" ? MOCK_FORBIDDEN_IN_PRODUCTION : "Sin inicio de sesión en producción: Supabase Auth llega en CORE-9.1.",
    };
  }
  if (mode === "mock" || mode === "") {
    return { mode: "mock", canSignIn: true, notice: "Modo demostración local (solo desarrollo): usuarios ficticios, sin autenticación real ni seguridad." };
  }
  return { mode: "disabled", canSignIn: false, notice: `AUTH_MODE="${mode}" no es válido. Usa mock (solo desarrollo) o déjalo vacío.` };
}

/** Throws when the configuration would try to enable the mock in production. */
export function assertProductionAuthConfig(env: Env): void {
  if (env.NODE_ENV === "production" && requested(env) === "mock") {
    throw new Error(MOCK_FORBIDDEN_IN_PRODUCTION);
  }
}
