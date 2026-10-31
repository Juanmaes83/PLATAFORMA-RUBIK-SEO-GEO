import "server-only";

import { AsyncLocalStorage } from "node:async_hooks";
import { createHmac, timingSafeEqual } from "node:crypto";

export type PreviewWriterCapability = { runId: string; tenantId: string; projectId: string; expiresAt: number };
const scope = new AsyncLocalStorage<PreviewWriterCapability>();
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const SHA = /^[0-9a-f]{40}$/;
const DEPLOYMENT = /^dpl_[A-Za-z0-9]+$/;
const MAX_WINDOW_MS = 30 * 60_000;
const H1A_BRANCH = "codex/h1a-integral-20261022";
const PREVIEW_REF = "rhnnplewqsekrnaousyl";

export function currentPreviewWriterCapability(now = Date.now()): PreviewWriterCapability | null {
  const value = scope.getStore();
  return value && value.expiresAt > now ? value : null;
}

export function previewWindowMac(secret: string, value: Omit<PreviewWriterCapability, "tenantId" | "projectId"> & {
  deploymentId: string; host: string; sha: string; branch: string;
}): string {
  return createHmac("sha256", secret).update([
    "rubik-h1a-window-v1", value.runId, value.deploymentId.toLowerCase(), value.host.toLowerCase(), value.sha.toLowerCase(), value.branch, String(value.expiresAt),
  ].join("\n"), "utf8").digest("hex");
}

/** Closed diagnostic shared with the authorization gate; never returns request data. */
export function previewWriterCapabilityRejection(request: Request, tenantId: string, projectId: string,
  env: Record<string, string | undefined> = process.env, now = Date.now()): string | null {
  const runId = request.headers.get("x-rubik-u03-run-id") ?? "";
  const expiresText = request.headers.get("x-rubik-u03-expires") ?? "";
  const suppliedMac = request.headers.get("x-rubik-u03-capability") ?? "";
  const expiresAt = Number(expiresText);
  const deploymentId = env.VERCEL_DEPLOYMENT_ID ?? "";
  const host = env.VERCEL_URL ?? "";
  const requestHost = new URL(request.url).host;
  const sha = env.VERCEL_GIT_COMMIT_SHA ?? "";
  const secret = env.U03_PREVIEW_WRITER_WINDOW_SECRET ?? "";
  if (env.VERCEL_ENV !== "preview" || env.U03_PREVIEW_WRITER_WINDOW_REF !== PREVIEW_REF ||
      env.VERCEL_GIT_COMMIT_REF !== H1A_BRANCH ||
      !SHA.test(sha) || sha !== env.U03_PREVIEW_WRITER_WINDOW_SHA || !DEPLOYMENT.test(deploymentId) ||
      env.U03_PREVIEW_WRITER_WINDOW !== "armed-run-capability" || !secret)
    return "WINDOW_IDENTITY_REJECTED";
  if (!host || host.toLowerCase() !== requestHost.toLowerCase()) return "WINDOW_HOST_REJECTED";
  if (!UUID.test(runId) || runId !== env.U03_PREVIEW_WRITER_WINDOW_RUN_ID) return "WINDOW_RUN_REJECTED";
  if (!Number.isSafeInteger(expiresAt) || expiresAt <= now || expiresAt > now + MAX_WINDOW_MS)
    return "WINDOW_TTL_REJECTED";
  if (suppliedMac.length !== 64 || !/^[a-f0-9]{64}$/.test(suppliedMac)) return "WINDOW_MAC_REJECTED";
  const expected = previewWindowMac(secret, { runId, expiresAt, deploymentId, host, sha, branch: H1A_BRANCH });
  if (!timingSafeEqual(Buffer.from(expected, "hex"), Buffer.from(suppliedMac, "hex"))) return "WINDOW_MAC_REJECTED";
  const namespace = `u03-${runId.replaceAll("-", "").slice(0, 12)}`;
  const validScope = tenantId === `${namespace}-a` ? ["a1", "a2"].includes(projectId)
    : tenantId === `${namespace}-b` && projectId === "b1";
  return validScope ? null : "WINDOW_SCOPE_REJECTED";
}

/** Bind each request capability to this exact protected deployment, host, commit and run. */
export async function withPreviewWriterCapability<T>(request: Request, tenantId: string, projectId: string,
  action: () => Promise<T>, env: Record<string, string | undefined> = process.env, now = Date.now()): Promise<T | null> {
  const runId = request.headers.get("x-rubik-u03-run-id") ?? "";
  const expiresText = request.headers.get("x-rubik-u03-expires") ?? "";
  const expiresAt = Number(expiresText);
  if (previewWriterCapabilityRejection(request, tenantId, projectId, env, now)) return null;
  return scope.run({ runId, tenantId, projectId, expiresAt }, action);
}
