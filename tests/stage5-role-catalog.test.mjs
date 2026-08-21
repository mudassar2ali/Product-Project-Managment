import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import { DatabaseSync } from "node:sqlite";
import test from "node:test";

const root = new URL("../", import.meta.url);
const read = (path) => readFile(new URL(path, root), "utf8");

async function migratedDatabase() {
  const database = new DatabaseSync(":memory:");
  database.exec("PRAGMA foreign_keys=ON");
  const files = (await readdir(new URL("drizzle/", root))).filter((name) => name.endsWith(".sql")).sort();
  for (const file of files) {
    const migration = await read(`drizzle/${file}`);
    for (const statement of migration.split("--> statement-breakpoint").map((value) => value.trim()).filter(Boolean)) database.exec(statement);
  }
  return { database, files };
}

test("Step 1 schema constrains user_role_assignments to GLOBAL scope only", async () => {
  const schema = await read("db/schema.ts");
  assert.match(schema, /check\("ck_user_role_assignment_scope_global", sql`\$\{table\.scopeType\}='GLOBAL' AND \$\{table\.scopeId\}='\*'`\)/);
});

test("generated forward migration 0032 adds the scope constraint and seeds the eleven system roles", async () => {
  const names = (await readdir(new URL("drizzle/", root))).filter((name) => name.startsWith("0032_") && name.endsWith(".sql"));
  assert.equal(names.length, 1);
  const migration = await read(`drizzle/${names[0]}`);
  assert.match(migration, /CONSTRAINT "ck_user_role_assignment_scope_global"/);
  assert.match(migration, /INSERT INTO `roles`/);
  for (const code of [
    "ADMINISTRATOR", "PRODUCT_DEVELOPMENT_MANAGER", "PRODUCT_MANAGER", "BUSINESS_ANALYST", "ENGINEERING_LEAD",
    "DEVELOPER", "QA", "FINANCE", "COMPLIANCE_LEGAL", "STAKEHOLDER_APPROVER", "EXECUTIVE_VIEWER",
  ]) assert.match(migration, new RegExp(`'${code}'`));
});

test("a migrated database seeds exactly the eleven system roles, matching authorization.ts's RoleCode set one-for-one", async () => {
  const { database, files } = await migratedDatabase();
  assert.ok(files.length >= 33);
  const rows = database.prepare("SELECT code, name, system_role systemRole FROM roles ORDER BY code").all();
  assert.equal(rows.length, 11);
  assert.ok(rows.every((row) => row.systemRole === 1));
  const authorization = await read("app/authorization.ts");
  for (const row of rows) assert.match(authorization, new RegExp(`\\b${row.code}\\b`));
  assert.deepEqual(database.prepare("PRAGMA foreign_key_check").all(), []);
  database.close();
});

test("user_role_assignments rejects a non-GLOBAL scope row and accepts a GLOBAL/* row", async () => {
  const { database } = await migratedDatabase();
  database.exec("INSERT INTO users(id,external_user_id,email,display_name) VALUES('user-1','external-1','a@example.test','A')");
  assert.throws(() => {
    database.exec("INSERT INTO user_role_assignments(id,user_id,role_id,scope_type,scope_id) VALUES('a1','user-1','role_qa','PROJECT','project-1')");
  }, /ck_user_role_assignment_scope_global/);
  database.exec("INSERT INTO user_role_assignments(id,user_id,role_id,scope_type,scope_id) VALUES('a2','user-1','role_qa','GLOBAL','*')");
  const row = database.prepare("SELECT scope_type scopeType, scope_id scopeId FROM user_role_assignments WHERE id='a2'").get();
  assert.equal(row.scopeType, "GLOBAL");
  assert.equal(row.scopeId, "*");
  database.close();
});

test("uq_user_role_scope still rejects assigning the same role to the same user twice", async () => {
  const { database } = await migratedDatabase();
  database.exec("INSERT INTO users(id,external_user_id,email,display_name) VALUES('user-1','external-1','a@example.test','A')");
  database.exec("INSERT INTO user_role_assignments(id,user_id,role_id,scope_type,scope_id) VALUES('a1','user-1','role_qa','GLOBAL','*')");
  assert.throws(() => {
    database.exec("INSERT INTO user_role_assignments(id,user_id,role_id,scope_type,scope_id) VALUES('a2','user-1','role_qa','GLOBAL','*')");
  }, /UNIQUE constraint failed/);
  database.close();
});
