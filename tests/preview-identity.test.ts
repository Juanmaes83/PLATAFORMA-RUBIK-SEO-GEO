import { describe, expect, it } from "vitest";
import {
  APPROVED_PREVIEW_SUPABASE_REF,
  PRODUCTION_SUPABASE_REF,
  previewDatabaseIdentityMatches,
  previewIdentityMatches,
  previewJwtIssuerMatches,
  previewLocked,
} from "@/lib/auth/mode";

const previewRef = "rhnnplewqsekrnaousyl";
const previewKey = ["sb", "publishable", "test"].join("_");
const preview = (url: string) => ({ VERCEL_ENV: "preview", NEXT_PUBLIC_SUPABASE_URL: url, NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: previewKey });

describe("U02 Preview project identity gate", () => {
  it("approves only the reviewed Preview ref while keeping Production excluded", () => {
    expect(APPROVED_PREVIEW_SUPABASE_REF).toBe(previewRef);
    expect(previewLocked(preview(`https://${previewRef}.supabase.co`))).toBe(false);
    expect(previewIdentityMatches(preview(`https://${previewRef}.supabase.co`))).toBe(true);
    expect(previewLocked(preview(`https://${PRODUCTION_SUPABASE_REF}.supabase.co`))).toBe(true);
  });

  it("rejects Production even when a caller supplies it as the approved ref", () => {
    expect(previewIdentityMatches(preview(`https://${PRODUCTION_SUPABASE_REF}.supabase.co`), PRODUCTION_SUPABASE_REF)).toBe(false);
    expect(previewIdentityMatches(preview(`https://${PRODUCTION_SUPABASE_REF}.supabase.co`), previewRef)).toBe(false);
  });

  it("accepts only an exact isolated Supabase origin after ref approval", () => {
    expect(previewIdentityMatches(preview(`https://${previewRef}.supabase.co`), previewRef)).toBe(true);
    for (const url of [
      `http://${previewRef}.supabase.co`,
      `https://${previewRef}.supabase.co.evil.test`,
      `https://${previewRef}.supabase.co:8443`,
      `https://${previewRef}.supabase.co/auth/v1`,
      `https://${previewRef}.supabase.co?ref=${PRODUCTION_SUPABASE_REF}`,
      `https://user@${previewRef}.supabase.co`,
    ]) expect(previewIdentityMatches(preview(url), previewRef), url).toBe(false);
    expect(previewIdentityMatches({ VERCEL_ENV: "production", NEXT_PUBLIC_SUPABASE_URL: `https://${previewRef}.supabase.co` }, previewRef)).toBe(false);
    expect(previewIdentityMatches({ VERCEL_ENV: " preview ", NEXT_PUBLIC_SUPABASE_URL: `https://${previewRef}.supabase.co` }, previewRef)).toBe(false);
  });

  it("requires a verified Preview JWT issuer from the same approved project", () => {
    const env = preview(`https://${previewRef}.supabase.co`);
    expect(previewJwtIssuerMatches(`https://${previewRef}.supabase.co/auth/v1`, env, previewRef)).toBe(true);
    for (const issuer of [
      `https://${PRODUCTION_SUPABASE_REF}.supabase.co/auth/v1`,
      `https://${previewRef}.supabase.co/auth/v1/`,
      `http://${previewRef}.supabase.co/auth/v1`,
      null,
      undefined,
    ]) expect(previewJwtIssuerMatches(issuer, env, previewRef), String(issuer)).toBe(false);
    expect(previewJwtIssuerMatches(`https://${previewRef}.supabase.co/auth/v1`, env)).toBe(true);
    expect(previewJwtIssuerMatches(`https://${previewRef}.supabase.co/auth/v1`, preview(`https://${PRODUCTION_SUPABASE_REF}.supabase.co`), previewRef)).toBe(false);
  });

  it("requires an exact row read from the approved Preview database before sessions", async () => {
    const env = preview(`https://${previewRef}.supabase.co`);
    const reply = (rows: unknown, status = 200) => (async () => new Response(JSON.stringify(rows), { status })) as typeof fetch;
    expect(await previewDatabaseIdentityMatches(env, reply([{ environment: "preview", project_ref: previewRef }]))).toBe(true);
    for (const rows of [[], [{ environment: "production", project_ref: previewRef }],
      [{ environment: "preview", project_ref: PRODUCTION_SUPABASE_REF }],
      [{ environment: "preview", project_ref: previewRef }, { environment: "preview", project_ref: previewRef }]])
      expect(await previewDatabaseIdentityMatches(env, reply(rows))).toBe(false);
    expect(await previewDatabaseIdentityMatches(env, reply([], 401))).toBe(false);
    expect(await previewDatabaseIdentityMatches(env, (async () => { throw new Error("offline"); }) as typeof fetch)).toBe(false);
    expect(await previewDatabaseIdentityMatches(preview(`https://${PRODUCTION_SUPABASE_REF}.supabase.co`), reply([{ environment: "preview", project_ref: previewRef }]))).toBe(false);
    expect(await previewDatabaseIdentityMatches({ ...env, NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "" }, reply([{ environment: "preview", project_ref: previewRef }]))).toBe(false);
  });
});
