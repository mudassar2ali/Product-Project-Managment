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

function seedCampaign(database) {
  database.exec("INSERT INTO users(id,external_user_id,email,display_name) VALUES('user-1','external-1','owner@example.test','Owner')");
  database.exec("INSERT INTO products(id,business_id,name,code) VALUES('product-1','PROD-0001','Governed Product','GOV')");
  database.exec("INSERT INTO projects(id,business_id,name,code,product_id) VALUES('project-1','PROJ-0001','Governed Project','GOV-P','product-1')");
  database.exec("INSERT INTO backlog_items(id,business_id,project_id,item_type,title) VALUES('item-1','BL-0001','project-1','STORY','Story one')");
  database.exec("INSERT INTO requirements(id,business_id,requirement_type,product_id,project_id) VALUES('req-1','REQ-0001','FUNCTIONAL','product-1','project-1')");
  database.exec("INSERT INTO releases(id,business_id,project_id,name,owner_user_id) VALUES('release-1','REL-0001','project-1','2026.09 Release','user-1')");
  database.exec("INSERT INTO uat_campaigns(id,business_id,release_id,name) VALUES('campaign-1','CAM-0001','release-1','Initial UAT pass')");
}

test("Step 4 schema defines UAT campaigns and test cases with status-guarded lifecycle constraints", async () => {
  const schema = await read("db/schema.ts");
  for (const value of [
    "export const uatCampaigns", "export const uatTestCases",
    "uq_uat_campaigns_business_id", "idx_uat_campaigns_release_status",
    "uq_uat_test_cases_business_id", "idx_uat_test_cases_campaign_status", "idx_uat_test_cases_requirement",
  ]) assert.match(schema, new RegExp(value.replace(/[()]/g, "\\$&")));
  for (const constraint of ["ck_uat_campaign_status", "ck_uat_campaign_fields", "ck_uat_campaign_started_consistency", "ck_uat_campaign_completed_consistency", "ck_uat_test_case_priority", "ck_uat_test_case_status", "ck_uat_test_case_fields"]) assert.match(schema, new RegExp(constraint));
});

test("generated forward migration 0027 adds uat_campaigns and uat_test_cases with foreign keys", async () => {
  const names = (await readdir(new URL("drizzle/", root))).filter((name) => name.startsWith("0027_") && name.endsWith(".sql"));
  assert.equal(names.length, 1);
  const migration = await read(`drizzle/${names[0]}`);
  for (const value of [
    "CREATE TABLE `uat_campaigns`", "CREATE TABLE `uat_test_cases`",
    "FOREIGN KEY (`release_id`) REFERENCES `releases`", "FOREIGN KEY (`campaign_id`) REFERENCES `uat_campaigns`",
    "FOREIGN KEY (`requirement_id`) REFERENCES `requirements`", "FOREIGN KEY (`backlog_item_id`) REFERENCES `backlog_items`",
  ]) assert.match(migration, new RegExp(value.replace(/[()`]/g, "\\$&")));
});

test("all 28 migrations replay cleanly with referential integrity intact", async () => {
  const { database, files } = await migratedDatabase();
  assert.equal(files.filter((name) => Number(name.slice(0, 4)) <= 27).length, 28);
  assert.deepEqual(database.prepare("PRAGMA foreign_key_check").all(), []);
  database.close();
});

test("database constraints enforce controlled UAT vocabulary and started/completed evidence consistency", async () => {
  const { database } = await migratedDatabase();
  seedCampaign(database);
  assert.throws(() => database.exec("INSERT INTO uat_campaigns(id,business_id,release_id,name,status) VALUES('campaign-2','CAM-0002','release-1','Bad status','NOT_A_STATUS')"), /CHECK/);
  assert.throws(() => database.exec("INSERT INTO uat_campaigns(id,business_id,release_id,name,status) VALUES('campaign-3','CAM-0003','release-1','Missing start','IN_PROGRESS')"), /CHECK/, "IN_PROGRESS requires started_at");
  database.exec("INSERT INTO uat_campaigns(id,business_id,release_id,name,status,started_at) VALUES('campaign-3','CAM-0003','release-1','Regression pass','IN_PROGRESS','2026-08-20T00:00:00Z')");
  assert.throws(() => database.exec("UPDATE uat_campaigns SET status='COMPLETED' WHERE id='campaign-3'"), /CHECK/, "COMPLETED requires completed_at");
  database.exec("UPDATE uat_campaigns SET status='COMPLETED',completed_at='2026-08-21T00:00:00Z' WHERE id='campaign-3'");
  assert.throws(() => database.exec("INSERT INTO uat_test_cases(id,business_id,campaign_id,title,steps,expected_result,priority) VALUES('tc-bad','TC-00001','campaign-1','Bad priority','Steps','Expected','NOT_A_PRIORITY')"), /CHECK/);
  database.exec("INSERT INTO uat_test_cases(id,business_id,campaign_id,requirement_id,backlog_item_id,title,steps,expected_result) VALUES('tc-1','TC-00001','campaign-1','req-1','item-1','Login works','Open app; log in','User is logged in')");
  assert.throws(() => database.exec("INSERT INTO uat_test_cases(id,business_id,campaign_id,title,steps,expected_result) VALUES('tc-2','TC-00001','campaign-1','Duplicate business id','Steps','Expected')"), /UNIQUE/);
  database.close();
});

test("representative UAT queries select their intended indexes", async () => {
  const { database } = await migratedDatabase();
  seedCampaign(database);
  database.exec("INSERT INTO uat_test_cases(id,business_id,campaign_id,title,steps,expected_result) VALUES('tc-1','TC-00001','campaign-1','Login works','Open app; log in','User is logged in')");
  const plan = (sql, ...parameters) => database.prepare(`EXPLAIN QUERY PLAN ${sql}`).all(...parameters).map((row) => String(row.detail)).join(" ");
  assert.match(plan("SELECT * FROM uat_campaigns WHERE release_id=? AND status=?", "release-1", "DRAFT"), /idx_uat_campaigns_release_status/);
  assert.match(plan("SELECT * FROM uat_test_cases WHERE campaign_id=? AND status=?", "campaign-1", "DRAFT"), /idx_uat_test_cases_campaign_status/);
  database.close();
});

test("UAT repository allocates business IDs, scopes test case links to the Release's Project and locks non-Draft edits", async () => {
  const source = await read("db/uat.ts");
  for (const value of [
    "nextBusinessId(\"UAT_CAMPAIGN\", \"CAM\"", "nextBusinessId(\"TEST_CASE\", \"TC\"", "entity_type,next_value,updated_at) VALUES(?",
    "requirements WHERE id=? AND project_id=?", "backlog_items WHERE id=? AND project_id=?",
    "existing.status !== \"DRAFT\"", "status='DRAFT'",
  ]) assert.ok(source.includes(value), `missing ${value}`);
  assert.doesNotMatch(source, /requestBody|responseBody|authorizationHeader/i);
});

test("UAT contract validates campaign and test case registration input", async () => {
  const source = await read("app/releases/uat-contract.ts");
  for (const control of [
    "validateCampaignRegistrationInput", "validateTestCaseRegistrationInput", "parseTestCasePriority", "parseTestCaseStatus",
    "Enter a UAT campaign name.", "Enter a test case title.", "Enter the test steps.", "Enter the expected result.",
  ]) assert.match(source, new RegExp(control.replace(/[.]/g, "\\$&")));
});

test("Stage 4 lifecycle contract guards campaign transitions and timestamp evidence", async () => {
  const { assertCampaignTransition, assertCampaignTimestampConsistent } = await import("../app/releases/stage4-contract.ts");
  assert.doesNotThrow(() => assertCampaignTransition("DRAFT", "PLANNED"));
  assert.throws(() => assertCampaignTransition("COMPLETED", "IN_PROGRESS"), /CAMPAIGN_STATUS_TRANSITION_INVALID/);
  assert.doesNotThrow(() => assertCampaignTimestampConsistent("IN_PROGRESS", "2026-08-20T00:00:00Z", null));
  assert.throws(() => assertCampaignTimestampConsistent("IN_PROGRESS", null, null), /CAMPAIGN_START_EVIDENCE_INVALID/);
  assert.throws(() => assertCampaignTimestampConsistent("COMPLETED", "2026-08-20T00:00:00Z", null), /CAMPAIGN_COMPLETION_EVIDENCE_INVALID/);
});

test("UAT campaign and test case APIs are permission-scoped and return stable no-store responses", async () => {
  const [campaigns, testCases, testCaseDetail] = await Promise.all([
    read("app/api/v4/releases/[id]/campaigns/route.ts"),
    read("app/api/v4/campaigns/[id]/test-cases/route.ts"),
    read("app/api/v4/test-cases/[id]/route.ts"),
  ]);
  assert.match(campaigns, /authorizeApi\("uat\.view"\)/);
  assert.match(campaigns, /authorizeApi\("uat\.create"\)/);
  assert.match(testCases, /authorizeApi\("uat\.view"\)/);
  assert.match(testCases, /authorizeApi\("uat\.create"\)/);
  assert.match(testCaseDetail, /authorizeApi\("uat\.edit"\)/);
  assert.match(testCaseDetail, /VERSION_CONFLICT/);
  assert.match(testCaseDetail, /TEST_CASE_LOCKED/);
  for (const source of [campaigns, testCases, testCaseDetail]) assert.match(source, /apiHeaders/);
});

test("Stage 4 Release navigation and UI remain unexposed after Step 4", async () => {
  const shell = await read("app/command-center-shell.tsx");
  assert.doesNotMatch(shell, /label: "Releases"/);
});
