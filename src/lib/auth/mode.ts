// Authentication mode for CORE-9.0. Only the local mock is implemented. Supabase Auth is
// approved (D-26) but is implemented in CORE-9.1; until then selecting it never "works".
export type AuthMode = "mock" | "supabase-not-implemented" | "disabled";

export interface AuthModeInfo {
  mode: AuthMode;
  canSignIn: boolean;
  notice: string;
}

type Env = Record<string, string | undefined>;

export function resolveAuthMode(env: Env): AuthModeInfo {
  const requested = (env.AUTH_MODE ?? "").trim().toLowerCase();
  if (requested === "supabase") {
    return { mode: "supabase-not-implemented", canSignIn: false, notice: "Supabase Auth aún no está implementado (CORE-9.1). No hay inicio de sesión." };
  }
  if (requested === "mock" || (requested === "" && env.NODE_ENV !== "production")) {
    return { mode: "mock", canSignIn: true, notice: "Modo demostración local: usuarios ficticios, sin autenticación real ni seguridad." };
  }
  return { mode: "disabled", canSignIn: false, notice: "Autenticación desactivada: define AUTH_MODE=mock para la demostración local." };
}
