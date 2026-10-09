import { expect, it, vi } from "vitest";
import { createOpenSeoMcpClient } from "@/lib/openseo/mcp-client";
function client(pages: unknown[]) {
  let page = 0;
  const methods: string[] = [];
  const fetchImpl = vi.fn(async (_url: string, init: RequestInit) => {
    const body = JSON.parse(String(init.body)); methods.push(body.method);
    if (body.method === "notifications/initialized") return new Response(null, { status: 202 });
    return Response.json({ jsonrpc: "2.0", id: body.id, result: body.method === "initialize"
      ? { protocolVersion: "2025-06-18", capabilities: {}, serverInfo: { name: "mock", version: "1" } }
      : pages[page++] });
  });
  return { methods, mcp: createOpenSeoMcpClient({ mcpUrl: "https://mcp.example/mcp", apiKey: "simulation", maxPages: 10, fetchImpl }) };
}
it("lists all pages without executing tools, including while Google calls are disabled", async () => {
  const c = client([{ tools: [{ name: "a" }], nextCursor: "p2" }, { tools: [{ name: "b" }] }]);
  expect((await c.mcp.listTools()).map((t) => t.name)).toEqual(["a", "b"]);
  expect(c.methods).toEqual(["initialize", "notifications/initialized", "tools/list", "tools/list"]);
});
it("fails closed for cycles, malformed cursors and a catalogue still incomplete at the page cap", async () => {
  for (const pages of [ [{ tools: [], nextCursor: "same" }, { tools: [], nextCursor: "same" }],
    [{ tools: [], nextCursor: 12 }], Array.from({ length: 10 }, (_, i) => ({ tools: [], nextCursor: `p${i}` })) ]) {
    await expect(client(pages).mcp.listTools()).rejects.toThrow();
  }
});
