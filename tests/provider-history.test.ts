import { randomBytes } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import { beforeEach, describe, expect, it } from "vitest";
import { providers } from "@/lib/core";
import type { Database } from "@/lib/supabase/database.types";
import type { ProjectRef } from "@/lib/provenance/audit";
import { loadKeyring } from "@/lib/provenance/keyring";
import { sealProviderResult } from "@/lib/provenance/results";
import { listProviderResults, loadProviderResult } from "@/lib/provenance/repository";

const project: ProjectRef = { projectId: "11111111-1111-4111-8111-111111111111", organizationId: "22222222-2222-4222-8222-222222222222", scope: { tenantId: "fixture", projectId: "one" } };
const second = { ...project, projectId: "33333333-3333-4333-8333-333333333333" };
const id = "44444444-4444-4444-8444-444444444444";
const ring = loadKeyring({ PROVENANCE_SIGNING_KEYS: `fixture:${randomBytes(32).toString("base64")}`, PROVENANCE_ACTIVE_KEY_ID: "fixture" });
if (!ring.ok) throw new Error(ring.error);
const keyring = ring.keyring;
let rows: Record<string, unknown>[];
let requests: URL[];
let fail: boolean;
const client = createClient<Database>("https://fixture.example", "fixture-public-key", {
  auth: { persistSession: false, autoRefreshToken: false },
  global: { fetch: async (input) => {
    const url = new URL(String(input));
    requests.push(url);
    if (fail) return Response.json({ message: "private-fixture-error", code: "42501" }, { status: 403 });
    let data = rows.filter((row) => ["id", "project_id", "organization_id"].every((column) => !url.searchParams.has(column) || url.searchParams.get(column) === `eq.${row[column]}`));
    data = data.slice(Number(url.searchParams.get("offset") ?? 0), Number(url.searchParams.get("offset") ?? 0) + Number(url.searchParams.get("limit") ?? 100));
    const fields = url.searchParams.get("select");
    if (fields && fields !== "*") data = data.map((row) => Object.fromEntries(fields.split(",").map((f) => [f.trim(), row[f.trim()]])));
    return Response.json(data);
  } },
});

beforeEach(async () => {
  requests = []; fail = false;
  const result = await providers.runProviderRequest({ provider: "dataforseo", operation: "backlinks", input: { target: "fixture.example" }, transport: { kind: "live", request: async () => ({ rows: [] }) }, confirmCost: true, budget: { maxRequests: 1, maxUnits: 1 } });
  const sealed = sealProviderResult(result, project, keyring);
  if (!sealed.ok) throw new Error(sealed.error);
  rows = [{ ...sealed.row, id, created_at: "2026-10-09T00:00:00Z" }];
});

describe("project-scoped provider history through the Supabase client", () => {
  it("reopens a signed result only in its expected project", async () => {
    const own = await loadProviderResult(client, project, id, keyring);
    expect(own.ok && own.verification.verified).toBe(true);
    expect(await loadProviderResult(client, second, id, keyring)).toEqual({ ok: false, error: "NOT_FOUND" });
    expect(await loadProviderResult(client, { ...project, organizationId: second.projectId }, id, keyring)).toEqual({ ok: false, error: "NOT_FOUND" });
  });

  it("lists bounded metadata without signed payloads or data", async () => {
    expect(await listProviderResults(client, second)).toEqual({ ok: true, rows: [] });
    const page = await listProviderResults(client, project, { limit: 1, offset: 0 });
    expect(page.ok && page.rows.map((r) => r.id)).toEqual([id]);
    expect(page.ok && Object.keys(page.rows[0]).sort()).toEqual(["captured_at", "created_at", "id", "operation", "provider", "status"]);
    expect(JSON.stringify(page)).not.toMatch(/signature|signed_payload|data_hash|key_id/);
    expect(requests.at(-1)?.searchParams.get("order")).toBe("created_at.desc,id.desc");
    expect(await listProviderResults(client, project, { limit: 1, offset: 1 })).toEqual({ ok: true, rows: [] });
  });

  it.each([{ limit: 0 }, { limit: 101 }, { limit: 1.5 }, { offset: -1 }, { offset: 10001 }, { offset: Infinity }])("rejects invalid page %j before any request", async (page) => {
    expect(await listProviderResults(client, project, page)).toEqual({ ok: false, error: "INVALID_PAGE" });
    expect(requests).toHaveLength(0);
  });

  it("rejects invalid identifiers/scopes before any request", async () => {
    expect(await loadProviderResult(client, project, "invalid", keyring)).toEqual({ ok: false, error: "NOT_FOUND" });
    const invalid = { ...project, projectId: "invalid" };
    expect(await loadProviderResult(client, invalid, id, keyring)).toEqual({ ok: false, error: "NOT_FOUND" });
    expect(await listProviderResults(client, invalid)).toEqual({ ok: false, error: "INVALID_SCOPE" });
    expect(requests).toHaveLength(0);
  });

  it("reports read errors generically instead of showing empty successful history", async () => {
    fail = true;
    expect(await listProviderResults(client, project)).toEqual({ ok: false, error: "READ_FAILED" });
    expect(await loadProviderResult(client, project, id, keyring)).toEqual({ ok: false, error: "READ_FAILED" });
  });
});
