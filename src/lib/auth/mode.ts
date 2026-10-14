// Authentication configuration (CORE-9.1). Sign-in exists only through Supabase Auth, and only
// when NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY are set. The demo
// login of CORE-9.0 (AUTH_MODE=mock) was removed; the startup barriers that refuse it in
// production stay, so an old configuration can never reach a production server.
export type AuthMode = "supabase" | "not-configured" | "preview-locked";

export interface AuthModeInfo {
  mode: AuthMode;
  canSignIn: boolean;
  notice: string;
}

export interface SupabasePublicConfig {
  url: string;
  publishableKey: string;
}

type Env = Record<string, string | undefined>;

export const MOCK_FORBIDDEN_IN_PRODUCTION =
  "AUTH_MODE=mock está prohibido en producción: la demostración de CORE-9.0 ya no existe y el acceso es solo con Supabase Auth.";

export const PUBLIC_KEY_IS_SECRET =
  "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY contiene una clave secreta o service_role. Solo se admite la clave publicable (sb_publishable_…).";

/** Legacy JWT keys carry their role in the payload; a service_role key must never be public. */
function jwtRole(key: string): string | null {
  const parts = key.split(".");
  if (parts.length !== 3) return null;
  try {
    const base64 = parts[1].replace(/-/g, "+").replace(/_/g, "/");
    return JSON.parse(atob(base64.padEnd(Math.ceil(base64.length / 4) * 4, "=")))?.role ?? null;
  } catch {
    return null;
  }
}

export function isSecretKey(key: string): boolean {
  return key.startsWith("sb_secret_") || jwtRole(key) === "service_role";
}

export const PREVIEW_LOCKED_NOTICE =
  "Preview de Vercel sin base de datos propia: el acceso está desactivado para no leer ni escribir datos reales desde código sin revisar.";

/**
 * Vercel Previews share the production Supabase project until an isolated one exists
 * (docs/DECISIONES-ADR0010-Y-PREVIEW.md §2). There, no session is ever created: without a user
 * JWT, RLS gives the publishable key nothing to read or write. Setting
 * PREVIEW_SUPABASE_ISOLATED=true (only together with Preview-scoped Supabase variables of a
 * separate project) lifts the lock. Production and local development are not affected.
 */
export function previewLocked(env: Env): boolean {
  return (env.VERCEL_ENV ?? "").trim() === "preview" && (env.PREVIEW_SUPABASE_ISOLATED ?? "").trim() !== "true";
}

/** The public Supabase settings, or null when they are missing, unusable or locked in a Preview. */
export function supabasePublicConfig(env: Env): SupabasePublicConfig | null {
  if (previewLocked(env)) return null;
  const url = (env.NEXT_PUBLIC_SUPABASE_URL ?? "").trim();
  const publishableKey = (env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? "").trim();
  if (!url || !publishableKey || isSecretKey(publishableKey)) return null;
  try {
    const parsed = new URL(url);
    const local = parsed.protocol === "http:" && ["127.0.0.1", "localhost"].includes(parsed.hostname);
    if (parsed.protocol !== "https:" && !local) return null;
  } catch {
    return null;
  }
  return { url, publishableKey };
}

export function resolveAuthMode(env: Env): AuthModeInfo {
  if (previewLocked(env)) return { mode: "preview-locked", canSignIn: false, notice: PREVIEW_LOCKED_NOTICE };
  if (supabasePublicConfig(env)) {
    return { mode: "supabase", canSignIn: true, notice: "Acceso con Supabase Auth (correo y contraseña)." };
  }
  return {
    mode: "not-configured",
    canSignIn: false,
    notice: "Supabase Auth no está configurado en este entorno: no hay inicio de sesión.",
  };
}

/** Throws on configurations that must never start a server. */
export function assertProductionAuthConfig(env: Env): void {
  const key = (env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? "").trim();
  if (key && isSecretKey(key)) throw new Error(PUBLIC_KEY_IS_SECRET);
  if (env.NODE_ENV === "production" && (env.AUTH_MODE ?? "").trim().toLowerCase() === "mock") {
    throw new Error(MOCK_FORBIDDEN_IN_PRODUCTION);
  }
}
