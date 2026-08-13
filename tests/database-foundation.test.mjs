import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const root = new URL("../", import.meta.url);

test("declares durable D1 storage and governed foundation tables", async () => {
  const [hosting, migration] = await Promise.all([
    readFile(new URL(".openai/hosting.json", root), "utf8"),
    readFile(new URL("drizzle/0000_long_sprite.sql", root), "utf8"),
  ]);
  assert.equal(JSON.parse(hosting).d1, "DB");
  for (const table of [
    "users", "roles", "permissions", "role_permissions", "user_role_assignments",
    "business_sequences", "audit_logs",
  ]) {
    assert.match(migration, new RegExp("CREATE TABLE `" + table + "`"));
  }
  assert.match(migration, /uq_users_external_user_id/);
  assert.match(migration, /uq_user_role_scope/);
  assert.match(migration, /idx_audit_correlation/);
  assert.match(migration, /ON DELETE restrict/);
});

test("keeps secrets out of the relational foundation", async () => {
  const schema = await readFile(new URL("db/schema.ts", root), "utf8");
  assert.doesNotMatch(schema, /password|accessToken|refreshToken|personalAccessToken|patSecret/i);
  assert.match(schema, /externalUserId/);
  assert.match(schema, /correlationId/);
});
