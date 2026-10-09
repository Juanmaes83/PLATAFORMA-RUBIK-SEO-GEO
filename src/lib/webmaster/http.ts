import "server-only";

// Shared HTTP plumbing for the read-only webmaster transports (ADR 0009). Requests never follow
// redirects, are never cached, time out and cap the body. A failure is reported to the Core as
// `{ httpStatus, retryAfter }` only: never the URL (Bing's key travels in it), headers or body.
export type FetchLike = (input: string, init: RequestInit) => Promise<Response>;

const MAX_BODY_BYTES = 2_000_000;

export type HttpOutcome =
  | { ok: true; json: unknown }
  | { ok: false; httpStatus: number; retryAfter?: number; message: string };

export class WebmasterTransportError extends Error {
  constructor(message: string, readonly code?: string) {
    super(message);
    this.name = code === "ETIMEDOUT" ? "AbortError" : "WebmasterTransportError";
  }
}

export async function requestJson(url: string, init: RequestInit, opts: { fetchImpl?: FetchLike; timeoutMs?: number } = {}): Promise<HttpOutcome> {
  const fetchImpl: FetchLike = opts.fetchImpl ?? ((i, n) => fetch(i, n));
  let res: Response;
  try {
    res = await fetchImpl(url, { ...init, redirect: "error", cache: "no-store", signal: AbortSignal.timeout(opts.timeoutMs ?? 15_000) });
  } catch (error) {
    const name = (error as { name?: string })?.name;
    if (name === "TimeoutError" || name === "AbortError") throw new WebmasterTransportError("Provider request timed out", "ETIMEDOUT");
    throw new WebmasterTransportError("Provider is not reachable");
  }
  if (!res.ok) {
    await res.body?.cancel();
    const retry = Number(res.headers.get("retry-after"));
    return { ok: false, httpStatus: res.status, ...(Number.isFinite(retry) && retry >= 0 ? { retryAfter: retry } : {}), message: `Provider answered HTTP ${res.status}` };
  }
  const text = await res.text();
  if (text.length > MAX_BODY_BYTES) throw new WebmasterTransportError("Provider response too large");
  try {
    return { ok: true, json: JSON.parse(text) };
  } catch {
    throw new WebmasterTransportError("Provider did not return JSON");
  }
}

/** Domain of a project as stored (bare host), lower-case, without scheme, path or www. */
export const apexOf = (domain: string | null | undefined) =>
  (domain ?? "").trim().toLowerCase().replace(/^https?:\/\//, "").replace(/\/.*$/, "").replace(/^www\./, "");
