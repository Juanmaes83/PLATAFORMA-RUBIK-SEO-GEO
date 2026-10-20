import "server-only";

import { AsyncLocalStorage } from "node:async_hooks";
import { createHmac, timingSafeEqual } from "node:crypto";

export type PreviewWriterCapability = { runId: string; tenantId: string; projectId: string; expiresAt: number };
const scope = new AsyncLocalStorage<PreviewWriterCapability>();
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const SHA = /^[0-9a-f]{40}$/;
const DEPLOYMENT = /^dpl_[A-Za-z0-9]+$/;
const MAX_WINDOW_MS = 30 * 60_000;

export function currentPreviewWriterCapability(now = Date.now()): PreviewWriterCapability | null {
  const value = scope.getStore();
  return value && value.expiresAt > now ? value : null;
}

export function previewWindowMac(secret: string, value: Omit<PreviewWriterCapability, "tenantId" | "projectId"> & {
  deploymentId: string; host: string; sha: string;
}): string {
  return createHmac("sha256", secret).update([
    "rubik-u03-window-v1", value.runId, value.deploymentId.toLowerCase(), value.host.toLowerCase(), value.sha.toLowerCase(), String(value.expiresAt),
  ].join("\n"), "utf8").digest("hex");
}

/** Bind each request capability to this exact protected deployment, host, commit and run. */
export async function withPreviewWriterCapability<T>(request: Request, tenantId: string, projectId: string,
  action: () => Promise<T>, env: Record<string, string | undefined> = process.env, now = Date.now()): Promise<T | null> {
  const runId = request.headers.get("x-rubik-u03-run-id") ?? "";
  const expiresText = request.headers.get("x-rubik-u03-expires") ?? "";
  const suppliedMac = request.headers.get("x-rubik-u03-capability") ?? "";
  const expiresAt = Number(expiresText);
  const deploymentId = env.VERCEL_DEPLOYMENT_ID ?? "";
  const host = env.VERCEL_URL ?? "";
  const requestHost = new URL(request.url).host;
  const sha = env.VERCEL_GIT_COMMIT_SHA ?? "";
  const secret = env.U03_PREVIEW_WRITER_WINDOW_SECRET ?? "";
  const expectedRun = env.U03_PREVIEW_WRITER_WINDOW_RUN_ID ?? "";
  const ref = env.U03_PREVIEW_WRITER_WINDOW_REF ?? "";
  const expectedSha = env.U03_PREVIEW_WRITER_WINDOW_SHA ?? "";
  if (env.VERCEL_ENV !== "preview" || ref !== "rhnnplewqsekrnaousyl" ||
      env.VERCEL_GIT_COMMIT_REF !== "codex/u03-final-gates-20261020" ||
      !SHA.test(sha) || sha !== expectedSha || !DEPLOYMENT.test(deploymentId) ||
      !host || host.toLowerCase() !== requestHost.toLowerCase() ||
      env.U03_PREVIEW_WRITER_WINDOW !== "armed-run-capability" || !secret ||
      !UUID.test(runId) || runId !== expectedRun ||
      !Number.isSafeInteger(expiresAt) || expiresAt <= now || expiresAt > now + MAX_WINDOW_MS ||
      suppliedMac.length !== 64 || !/^[a-f0-9]{64}$/.test(suppliedMac)) return null;
  const expected = previewWindowMac(secret, { runId, expiresAt, deploymentId, host, sha });
  if (!timingSafeEqual(Buffer.from(expected, "hex"), Buffer.from(suppliedMac, "hex"))) return null;
  const namespace = `u03-${runId.replaceAll("-", "").slice(0, 12)}`;
  const validScope = tenantId === `${namespace}-a` ? ["a1", "a2"].includes(projectId)
    : tenantId === `${namespace}-b` && projectId === "b1";
  if (!validScope) return null;
  return scope.run({ runId, tenantId, projectId, expiresAt }, action);
}
