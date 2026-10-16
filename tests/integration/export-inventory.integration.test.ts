import { execFileSync } from "node:child_process";
import { expect, it } from "vitest";
import { EXPORT_TABLE_INVENTORY } from "@/lib/recovery/export-inventory";
import { localDatabaseContainer } from "../../scripts/supabase-test-env.mjs";

it("classifies every application table as included, partial, excluded or identity-only", async () => {
  const container = localDatabaseContainer();
  const rows = execFileSync("docker", ["exec", "-i", container, "psql", "-U", "postgres", "-v", "ON_ERROR_STOP=1", "-qAt", "-c",
    "select table_schema || '.' || table_name from information_schema.tables where table_schema in ('public','private') and table_type='BASE TABLE' order by table_schema, table_name;"],
  { encoding: "utf8" }).trim().split(/\r?\n/);
  const classified = new Set(Object.keys(EXPORT_TABLE_INVENTORY));
  expect(rows.filter((name) => !classified.has(name))).toEqual([]);
  expect([...classified].filter((name) => !rows.includes(name))).toEqual([]);
});
