import "server-only";
import { previewIdentityMatches } from "@/lib/auth/mode";
import { currentPreviewWriterCapability } from "./preview-writer-capability";

const APPROVED_REF = "rhnnplewqsekrnaousyl";
const APPROVED_BRANCH = "codex/u03-final-gates-20261020";
const APPROVED_POOLER = "aws-1-eu-west-3.pooler.supabase.com";
const APPROVED_WRITER_USER = `rubik_preview_u03_writer.${APPROVED_REF}`;
const WRITER_ROLE_OPTION = "-c role=rubik_audit_writer";
const SHA = /^[0-9a-f]{40}$/;

export type PreviewWriterWindowScope = { tenantId: string; projectId: string };

function validWriterUrl(value: string | undefined): boolean {
  if (!value) return false;
  try {
    const url = new URL(value);
    const keys = [...url.searchParams.keys()];
    return url.protocol === "postgresql:" && url.hostname === APPROVED_POOLER && url.port === "5432" &&
      url.username === APPROVED_WRITER_USER && !!url.password && url.pathname === "/postgres" &&
      keys.length === 1 && keys[0] === "options" && url.searchParams.get("options") === WRITER_ROLE_OPTION &&
      ![...url.searchParams.keys()].some(key => key.toLowerCase().startsWith("ssl"));
  } catch { return false; }
}

/**
 * Fail-closed gate for the separately protected U03 test deployment. It never opens the
 * ordinary Preview writer; every identity, deployment, scope, credential and TTL pin must match.
 */
export function previewWriterWindowActive(env: Record<string, string | undefined> = process.env, now = Date.now()): boolean {
  if (env.U03_PREVIEW_WRITER_WINDOW !== "armed-run-capability") return false;
  const capability = currentPreviewWriterCapability(now);
  return env.VERCEL_ENV === "preview" && previewIdentityMatches(env) && !!capability &&
    capability.runId === env.U03_PREVIEW_WRITER_WINDOW_RUN_ID &&
    env.U03_PREVIEW_WRITER_WINDOW_REF === APPROVED_REF &&
    env.VERCEL_GIT_COMMIT_REF === APPROVED_BRANCH &&
    SHA.test(env.VERCEL_GIT_COMMIT_SHA ?? "") && env.VERCEL_GIT_COMMIT_SHA === env.U03_PREVIEW_WRITER_WINDOW_SHA &&
    !!env.VERCEL_DEPLOYMENT_ID && !!env.VERCEL_URL && validWriterUrl(env.RUBIK_AUDIT_DATABASE_URL);
}

/** Preview writes are limited to the two namespaces and three project slugs owned by this run. */
export function previewWriterScopeAllowed(scope: PreviewWriterWindowScope,
  env: Record<string, string | undefined> = process.env, now = Date.now()): boolean {
  if (env.VERCEL_ENV !== "preview") return true;
  if (!previewWriterWindowActive(env, now)) return false;
  if (env.U03_PREVIEW_WRITER_WINDOW === "armed-run-capability") {
    const capability = currentPreviewWriterCapability(now);
    const expectedNamespace = `u03-${capability?.runId.replaceAll("-", "").slice(0, 12)}`;
    const sideMatches = scope.tenantId === `${expectedNamespace}-a`
      ? ["a1", "a2"].includes(scope.projectId)
      : scope.tenantId === `${expectedNamespace}-b` && scope.projectId === "b1";
    return !!capability && capability.tenantId === scope.tenantId && capability.projectId === scope.projectId && sideMatches;
  }
  const namespace = `u03-${env.U03_PREVIEW_WRITER_WINDOW_RUN_ID!.replaceAll("-", "").slice(0, 12)}`;
  return ["a1", "a2", "b1"].includes(scope.projectId) &&
    [
      `${namespace}-a`,
      `${namespace}-b`,
    ].includes(scope.tenantId);
}
