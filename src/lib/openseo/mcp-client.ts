import "server-only";

// Minimal MCP Streamable HTTP client for OpenSEO (ADR 0006), server-side only. It implements
// the slice of the protocol the Core bridge needs: `initialize`, `notifications/initialized`
// and `tools/call`, with JSON or SSE responses, a session id and a timeout per request.
//
// It exposes the shape the Core expects, `{kind, callTool(name, args)}`, and refuses any tool
// outside ALLOWED_TOOLS before touching the network: keywords, SERP, backlinks, rank tracking,
// Lighthouse and every other tool that may cost money are unreachable from this client.
//
// The API key only travels in the Authorization header. Errors never include headers, the
// request body or the response body: only an HTTP status, a JSON-RPC code or a fixed message.

export const ALLOWED_TOOLS = Object.freeze(["whoami", "run_site_audit", "get_audit_status", "get_audit_issues", "get_audit_pages"] as const);
export type AllowedTool = (typeof ALLOWED_TOOLS)[number];

const PROTOCOL_VERSION = "2025-06-18";
const CLIENT_INFO = { name: "plataforma-rubik-seo-geo", version: "0.1.0" };
const MAX_BODY_BYTES = 2_000_000;

export type FetchLike = (input: string, init: RequestInit) => Promise<Response>;

export interface McpClientOptions {
  mcpUrl: string;
  apiKey: string;
  /** Hard ceiling for run_site_audit.maxPages, enforced again here (defence in depth). */
  maxPages: number;
  fetchImpl?: FetchLike;
  timeoutMs?: number;
}

export interface ToolResult {
  structuredContent?: unknown;
  isError?: boolean;
}

/** Error shape the Core's `openseoFailure` understands: status, retryAfter, code. */
export class OpenSeoTransportError extends Error {
  constructor(
    message: string,
    readonly status?: number,
    readonly code?: string | number,
    readonly retryAfter?: number,
  ) {
    super(message);
    this.name = code === "ETIMEDOUT" ? "AbortError" : "OpenSeoTransportError";
  }
}

export interface OpenSeoMcpClient {
  kind: "live";
  callTool(name: string, args: Record<string, unknown>): Promise<ToolResult>;
  close(): Promise<void>;
}

function guardArgs(name: string, args: Record<string, unknown>, maxPages: number) {
  if (!(ALLOWED_TOOLS as readonly string[]).includes(name)) {
    throw new OpenSeoTransportError("Tool not allowed by the platform bridge", undefined, "TOOL_NOT_ALLOWED");
  }
  if (name === "run_site_audit") {
    if (args.runLighthouse !== false) throw new OpenSeoTransportError("runLighthouse must be false", undefined, "LIGHTHOUSE_NOT_ALLOWED");
    const pages = args.maxPages;
    if (typeof pages !== "number" || !Number.isInteger(pages) || pages < 10 || pages > maxPages) {
      throw new OpenSeoTransportError("maxPages outside the server limit", undefined, "MAX_PAGES_NOT_ALLOWED");
    }
  }
}

/** Reads the JSON-RPC response with the given id from a JSON or SSE body. */
async function readMessage(res: Response, id: number): Promise<{ result?: unknown; error?: { code?: unknown } }> {
  const text = await res.text();
  if (text.length > MAX_BODY_BYTES) throw new OpenSeoTransportError("OpenSEO response too large");
  const type = res.headers.get("content-type") ?? "";
  const candidates: unknown[] = [];
  if (type.includes("text/event-stream")) {
    for (const event of text.split(/\r?\n\r?\n/)) {
      const data = event
        .split(/\r?\n/)
        .filter((l) => l.startsWith("data:"))
        .map((l) => l.slice(5).trimStart())
        .join("\n");
      if (!data) continue;
      try {
        candidates.push(JSON.parse(data));
      } catch {
        /* ignore non-JSON events */
      }
    }
  } else {
    try {
      const parsed = JSON.parse(text);
      candidates.push(...(Array.isArray(parsed) ? parsed : [parsed]));
    } catch {
      throw new OpenSeoTransportError("OpenSEO did not return JSON");
    }
  }
  const msg = candidates.find((m) => !!m && typeof m === "object" && (m as { id?: unknown }).id === id);
  if (!msg) throw new OpenSeoTransportError("OpenSEO response without a matching JSON-RPC id");
  return msg as { result?: unknown; error?: { code?: unknown } };
}

export function createOpenSeoMcpClient(opts: McpClientOptions): OpenSeoMcpClient {
  const fetchImpl: FetchLike = opts.fetchImpl ?? ((input, init) => fetch(input, init));
  const timeoutMs = opts.timeoutMs ?? 15_000;
  let sessionId: string | null = null;
  let initialized = false;
  let nextId = 1;

  async function post(body: Record<string, unknown>): Promise<Response> {
    const headers: Record<string, string> = {
      "content-type": "application/json",
      accept: "application/json, text/event-stream",
      authorization: `Bearer ${opts.apiKey}`,
    };
    if (initialized) headers["mcp-protocol-version"] = PROTOCOL_VERSION;
    if (sessionId) headers["mcp-session-id"] = sessionId;
    let res: Response;
    try {
      res = await fetchImpl(opts.mcpUrl, { method: "POST", headers, body: JSON.stringify(body), redirect: "error", cache: "no-store", signal: AbortSignal.timeout(timeoutMs) });
    } catch (error) {
      const name = (error as { name?: string })?.name;
      if (name === "TimeoutError" || name === "AbortError") throw new OpenSeoTransportError("OpenSEO request timed out", undefined, "ETIMEDOUT");
      throw new OpenSeoTransportError("OpenSEO is not reachable");
    }
    if (!res.ok && res.status !== 202) {
      const retry = Number(res.headers.get("retry-after"));
      throw new OpenSeoTransportError(`OpenSEO answered HTTP ${res.status}`, res.status, undefined, Number.isFinite(retry) ? retry : undefined);
    }
    return res;
  }

  async function rpc(method: string, params: Record<string, unknown>): Promise<unknown> {
    const id = nextId++;
    const res = await post({ jsonrpc: "2.0", id, method, params });
    const msg = await readMessage(res, id);
    if (msg.error) {
      const code = typeof msg.error.code === "number" ? msg.error.code : undefined;
      throw new OpenSeoTransportError("OpenSEO returned a JSON-RPC error", undefined, code);
    }
    return msg.result;
  }

  async function ensureSession() {
    if (initialized) return;
    const id = nextId++;
    const res = await post({ jsonrpc: "2.0", id, method: "initialize", params: { protocolVersion: PROTOCOL_VERSION, capabilities: {}, clientInfo: CLIENT_INFO } });
    sessionId = res.headers.get("mcp-session-id");
    if (sessionId !== null && !/^[\x21-\x7e]{1,256}$/.test(sessionId)) throw new OpenSeoTransportError("Invalid MCP session id");
    const msg = await readMessage(res, id);
    if (msg.error) throw new OpenSeoTransportError("OpenSEO refused the MCP initialization", undefined, typeof msg.error.code === "number" ? msg.error.code : undefined);
    initialized = true;
    const ack = await post({ jsonrpc: "2.0", method: "notifications/initialized" });
    await ack.body?.cancel();
  }

  return {
    kind: "live",
    async callTool(name, args) {
      guardArgs(name, args, opts.maxPages);
      await ensureSession();
      const result = await rpc("tools/call", { name, arguments: args });
      return (result && typeof result === "object" ? result : {}) as ToolResult;
    },
    async close() {
      if (!sessionId) return;
      const headers = { authorization: `Bearer ${opts.apiKey}`, "mcp-session-id": sessionId, "mcp-protocol-version": PROTOCOL_VERSION };
      sessionId = null;
      initialized = false;
      try {
        const res = await fetchImpl(opts.mcpUrl, { method: "DELETE", headers, redirect: "error", cache: "no-store", signal: AbortSignal.timeout(timeoutMs) });
        await res.body?.cancel();
      } catch {
        /* best effort: the server expires idle sessions */
      }
    },
  };
}
