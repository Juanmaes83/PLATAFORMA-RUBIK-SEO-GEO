import { describe, expect, it } from "vitest";
import {
  APPROVED_PREVIEW_SUPABASE_REF,
  PRODUCTION_SUPABASE_REF,
  previewIdentityMatches,
  previewLocked,
} from "@/lib/auth/mode";

const previewRef = "abcdefghijklmnopqrst";
const preview = (url: string) => ({ VERCEL_ENV: "preview", NEXT_PUBLIC_SUPABASE_URL: url });

describe("U02 Preview project identity gate", () => {
  it("remains locked until a reviewed Preview ref is committed", () => {
    expect(APPROVED_PREVIEW_SUPABASE_REF).toBeNull();
    expect(previewLocked(preview(`https://${previewRef}.supabase.co`))).toBe(true);
    expect(previewIdentityMatches(preview(`https://${previewRef}.supabase.co`))).toBe(false);
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
});
