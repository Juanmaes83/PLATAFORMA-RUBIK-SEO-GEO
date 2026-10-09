import { beforeEach, describe, expect, it, vi } from "vitest";

// Password recovery server actions: the same answer whether or not an account exists, a session
// from the recovery link is required to change the password, and every session closes after.
const m = vi.hoisted(() => ({ createClient: vi.fn(), reset: vi.fn(), getUser: vi.fn(), update: vi.fn(), signOut: vi.fn(), origin: "https://rubik.example" as string | null }));
vi.mock("@/lib/supabase/server", () => ({ createClient: m.createClient }));
vi.mock("next/headers", () => ({ headers: async () => new Headers(m.origin ? { origin: m.origin } : {}) }));
vi.mock("next/navigation", () => ({ redirect: (path: string) => { throw new Error(`redirect:${path}`); } }));
import { requestPasswordReset, updatePassword } from "@/lib/auth/actions";

const form = (fields: Record<string, string>) => { const f = new FormData(); for (const [k, v] of Object.entries(fields)) f.set(k, v); return f; };
const good = "nueva-clave-2026";

beforeEach(() => {
  vi.clearAllMocks();
  m.origin = "https://rubik.example";
  m.createClient.mockResolvedValue({ auth: { resetPasswordForEmail: m.reset, getUser: m.getUser, updateUser: m.update, signOut: m.signOut } });
  m.reset.mockResolvedValue({ error: null });
  m.getUser.mockResolvedValue({ data: { user: { id: "u1" } } });
  m.update.mockResolvedValue({ error: null });
  m.signOut.mockResolvedValue({ error: null });
});

describe("request a recovery e-mail", () => {
  it("sends the link back to the exact allowed confirm URL", async () => {
    await expect(requestPasswordReset(form({ email: "persona@ejemplo.test" }))).rejects.toThrow("redirect:/recuperar?aviso=enviado");
    expect(m.reset).toHaveBeenCalledWith("persona@ejemplo.test", { redirectTo: "https://rubik.example/auth/confirm" });
  });
  it("answers the same when Supabase fails or rejects, so existence is never revealed", async () => {
    m.reset.mockResolvedValue({ error: { code: "user_not_found" } });
    await expect(requestPasswordReset(form({ email: "nadie@ejemplo.test" }))).rejects.toThrow("redirect:/recuperar?aviso=enviado");
    m.reset.mockRejectedValue(new Error("network"));
    await expect(requestPasswordReset(form({ email: "nadie@ejemplo.test" }))).rejects.toThrow("redirect:/recuperar?aviso=enviado");
  });
  it("rejects an invalid address without calling Supabase", async () => {
    await expect(requestPasswordReset(form({ email: "no-es-correo" }))).rejects.toThrow("redirect:/recuperar?error=correo");
    expect(m.reset).not.toHaveBeenCalled();
  });
});

describe("set the new password", () => {
  it("requires the session created by the recovery link", async () => {
    m.getUser.mockResolvedValue({ data: { user: null } });
    await expect(updatePassword(form({ password: good, confirm: good }))).rejects.toThrow("redirect:/recuperar?error=enlace");
    expect(m.update).not.toHaveBeenCalled();
  });
  it("validates strength and confirmation before calling Supabase", async () => {
    await expect(updatePassword(form({ password: "corta1", confirm: "corta1" }))).rejects.toThrow("redirect:/restablecer?error=clave");
    await expect(updatePassword(form({ password: good, confirm: `${good}x` }))).rejects.toThrow("redirect:/restablecer?error=distintas");
    expect(m.update).not.toHaveBeenCalled();
  });
  it("changes the password, closes every session and asks to sign in again", async () => {
    await expect(updatePassword(form({ password: good, confirm: good }))).rejects.toThrow("redirect:/acceso?aviso=clave");
    expect(m.update).toHaveBeenCalledWith({ password: good });
    expect(m.signOut).toHaveBeenCalledWith({ scope: "global" });
  });
  it("maps refusals without echoing them", async () => {
    m.update.mockResolvedValue({ error: { code: "same_password" } });
    await expect(updatePassword(form({ password: good, confirm: good }))).rejects.toThrow("redirect:/restablecer?error=clave");
    m.update.mockResolvedValue({ error: { code: "unexpected_failure" } });
    await expect(updatePassword(form({ password: good, confirm: good }))).rejects.toThrow("redirect:/restablecer?error=fallo");
    expect(m.signOut).not.toHaveBeenCalled();
  });
});
