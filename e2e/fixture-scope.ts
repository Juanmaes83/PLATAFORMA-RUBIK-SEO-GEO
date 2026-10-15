import { randomUUID } from "node:crypto";

export function assertFixtureEndpoint(apiUrl: string) {
  if (new URL(apiUrl).origin !== "http://127.0.0.1:54321") throw new Error("E2E fixtures require 127.0.0.1:54321");
}

export function fixtureScope(run = process.env.RUBIK_E2E_RUN_ID) {
  if (!run || !/^[a-f0-9]{32}$/.test(run)) throw new Error("Missing or invalid E2E run identity");
  const prefix = `pw-${run}`;
  return {
    run, prefix,
    tenant: `${prefix}-a`, otherTenant: `${prefix}-b`,
    project: "restaurante-ejemplo", otherProject: "despacho-ejemplo",
    users: Object.fromEntries(["owner", "analyst", "client", "outsider", "newcomer"]
      .map((role) => [role, `${prefix}-${role}@ejemplo.test`])) as Record<"owner" | "analyst" | "client" | "outsider" | "newcomer", string>,
  };
}

export function fixtureEmail(label: string) {
  if (!/^[a-z-]+$/.test(label)) throw new Error("Invalid fixture label");
  return `${fixtureScope().prefix}-${label}-${randomUUID().slice(0, 8)}@ejemplo.test`;
}
