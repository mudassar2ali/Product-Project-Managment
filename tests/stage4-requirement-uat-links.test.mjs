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

function seedGraph(database) {
  database.exec("INSERT INTO users(id,external_user_id,email,display_name) VALUES('user-1','external-1','owner@example.test','Owner')");
  database.exec("INSERT INTO products(id,business_id,name,code) VALUES('product-1','PROD-0001','Governed Product','GOV')");
  database.exec("INSERT INTO projects(id,business_id,name,code,product_id) VALUES('project-1','PROJ-0001','Governed Project','GOV-P','product-1')");
  database.exec("INSERT INTO requirements(id,business_id,requirement_type,product_id,project_id) VALUES('req-1','REQ-0001','FUNCTIONAL','product-1','project-1')");
  database.exec("INSERT INTO releases(id,business_id,project_id,name,owner_user_id) VALUES('release-1','REL-0001','project-1','2026.09 Release','user-1')");
  database.exec("INSERT INTO uat_campaigns(id,business_id,release_id,name) VALUES('campaign-1','CAM-0001','release-1','Initial UAT pass')");
  database.exec("INSERT INTO uat_test_cases(id,business_id,campaign_id,title,steps,expected_result,status) VALUES('tc-1','TC-00001','campaign-1','Login works','Open app; log in','User is logged in','READY')");
}

test("Step 9 schema defines requirement_uat_links as a governed many-to-many edge, distinct from uat_test_cases.requirement_id", async () => {
  const schema = await read("db/schema.ts");
  assert.match(schema, /export const requirementUatLinks/);
  assert.match(schema, /uq_requirement_uat_links_edge/);
  assert.match(schema, /idx_requirement_uat_links_requirement/);
  assert.match(schema, /idx_requirement_uat_links_test_case/);
  assert.match(schema, /ck_requirement_uat_link_type/);
});

test("generated forward migration 0031 adds requirement_uat_links with foreign keys to requirements and uat_test_cases", async () => {
  const names = (await readdir(new URL("drizzle/", root))).filter((name) => name.startsWith("0031_") && name.endsWith(".sql"));
  assert.equal(names.length, 1);
  const migration = await read(`drizzle/${names[0]}`);
  assert.match(migration, /CREATE TABLE `requirement_uat_links`/);
  assert.match(migration, /FOREIGN KEY \(`requirement_id`\) REFERENCES `requirements`/);
  assert.match(migration, /FOREIGN KEY \(`uat_test_case_id`\) REFERENCES `uat_test_cases`/);
  assert.match(migration, /CREATE UNIQUE INDEX `uq_requirement_uat_links_edge`/);
});

test("all 32 migrations replay cleanly with referential integrity intact", async () => {
  const { database, files } = await migratedDatabase();
  assert.equal(files.filter((name) => Number(name.slice(0, 4)) <= 31).length, 32);
  assert.deepEqual(database.prepare("PRAGMA foreign_key_check").all(), []);
  database.close();
});

test("database enforces the controlled link-type vocabulary and a unique typed edge per (requirement, test case)", async () => {
  const { database } = await migratedDatabase();
  seedGraph(database);
  assert.throws(() => database.exec("INSERT INTO requirement_uat_links(id,requirement_id,uat_test_case_id,link_type,created_by,updated_by) VALUES('link-bad','req-1','tc-1','IMPLEMENTS','user-1','user-1')"), /CHECK/, "only VALIDATES is a supported link type");
  database.exec("INSERT INTO requirement_uat_links(id,requirement_id,uat_test_case_id,link_type,created_by,updated_by) VALUES('link-1','req-1','tc-1','VALIDATES','user-1','user-1')");
  assert.throws(() => database.exec("INSERT INTO requirement_uat_links(id,requirement_id,uat_test_case_id,link_type,created_by,updated_by) VALUES('link-2','req-1','tc-1','VALIDATES','user-1','user-1')"), /UNIQUE/, "the same (requirement, test case, link type) edge cannot be created twice");
  database.close();
});

test("a representative lookup by test case selects its dedicated index", async () => {
  const { database } = await migratedDatabase();
  seedGraph(database);
  database.exec("INSERT INTO requirement_uat_links(id,requirement_id,uat_test_case_id,link_type,created_by,updated_by) VALUES('link-1','req-1','tc-1','VALIDATES','user-1','user-1')");
  const plan = (sql, ...parameters) => database.prepare(`EXPLAIN QUERY PLAN ${sql}`).all(...parameters).map((row) => String(row.detail)).join(" ");
  assert.match(plan("SELECT * FROM requirement_uat_links WHERE uat_test_case_id=?", "tc-1"), /idx_requirement_uat_links_test_case/);
  assert.match(plan("SELECT * FROM requirement_uat_links WHERE requirement_id=?", "req-1"), /idx_requirement_uat_links_requirement/);
  database.close();
});

test("the repository validates both sides exist, rejects a duplicate edge, and scopes remove to the owning test case", async () => {
  const source = await read("db/requirement-uat-links.ts");
  for (const value of [
    "addRequirementUatLink", "removeRequirementUatLink", "listRequirementUatLinksForTestCase",
    "record_status recordStatus FROM requirements",
    "WHERE requirement_id=? AND uat_test_case_id=? AND link_type=?",
    "WHERE id=? AND uat_test_case_id=?",
    "REQUIREMENT_LINK_ADD", "REQUIREMENT_LINK_REMOVE",
  ]) assert.ok(source.includes(value), `missing ${value}`);
});

test("the UAT contract validates a link's Requirement id and link type", async () => {
  const source = await read("app/releases/uat-contract.ts");
  for (const control of ["validateRequirementUatLinkInput", "parseRequirementUatLinkType", "Select a Requirement.", "Select a valid link type."]) {
    assert.ok(source.includes(control), `missing ${control}`);
  }
});

test("requirement-links APIs are permission-scoped and return stable no-store responses", async () => {
  const [add, remove] = await Promise.all([
    read("app/api/v4/test-cases/[id]/requirement-links/route.ts"),
    read("app/api/v4/test-cases/[id]/requirement-links/[linkId]/route.ts"),
  ]);
  assert.match(add, /authorizeApi\("traceability\.manage"\)/);
  assert.match(add, /DUPLICATE_REQUIREMENT_LINK/);
  assert.match(remove, /authorizeApi\("traceability\.manage"\)/);
  assert.match(remove, /REQUIREMENT_LINK_NOT_FOUND/);
  for (const source of [add, remove]) assert.match(source, /apiHeaders/);
});

test("Requirement traceability now surfaces UAT links with their latest execution result, continuing the Requirement→test case→execution chain", async () => {
  const source = await read("db/requirement-traceability.ts");
  assert.match(source, /FROM requirement_uat_links l/);
  assert.match(source, /JOIN uat_test_cases t ON t\.id=l\.uat_test_case_id/);
  assert.match(source, /latest\.execution_number=\(SELECT MAX\(execution_number\) FROM uat_test_executions WHERE test_case_id=t\.id\)/);
  assert.match(source, /uatLinks: uatLinks\.results/);
});

test("Stage 4 Release navigation and UI remain unexposed after Step 9", async () => {
  const shell = await read("app/command-center-shell.tsx");
  assert.doesNotMatch(shell, /label: "Releases"/);
});
