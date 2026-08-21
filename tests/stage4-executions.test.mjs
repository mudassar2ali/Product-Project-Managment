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

function seedTestCase(database) {
  database.exec("INSERT INTO users(id,external_user_id,email,display_name) VALUES('user-1','external-1','owner@example.test','Owner')");
  database.exec("INSERT INTO products(id,business_id,name,code) VALUES('product-1','PROD-0001','Governed Product','GOV')");
  database.exec("INSERT INTO projects(id,business_id,name,code,product_id) VALUES('project-1','PROJ-0001','Governed Project','GOV-P','product-1')");
  database.exec("INSERT INTO releases(id,business_id,project_id,name,owner_user_id) VALUES('release-1','REL-0001','project-1','2026.09 Release','user-1')");
  database.exec("INSERT INTO uat_campaigns(id,business_id,release_id,name) VALUES('campaign-1','CAM-0001','release-1','Initial UAT pass')");
  database.exec("INSERT INTO uat_test_cases(id,business_id,campaign_id,title,steps,expected_result,status) VALUES('tc-1','TC-00001','campaign-1','Login works','Open app; log in','User is logged in','READY')");
}

test("Step 5 schema defines defects and append-only UAT test executions with evidence-consistency constraints", async () => {
  const schema = await read("db/schema.ts");
  for (const value of [
    "export const defects", "export const uatTestExecutions",
    "uq_defects_business_id", "idx_defects_project_status_severity", "idx_defects_assignee", "idx_defects_release",
    "uq_uat_test_executions_case_number", "idx_uat_test_executions_test_case", "idx_uat_test_executions_defect",
  ]) assert.match(schema, new RegExp(value.replace(/[()]/g, "\\$&")));
  for (const constraint of [
    "ck_defect_source", "ck_defect_severity", "ck_defect_status", "ck_defect_fields",
    "ck_defect_resolution_consistency", "ck_defect_closure_consistency", "ck_defect_duplicate_consistency",
    "ck_uat_execution_result", "ck_uat_execution_number", "ck_uat_execution_evidence_consistency", "ck_uat_execution_fields",
  ]) assert.match(schema, new RegExp(constraint));
});

test("generated forward migration 0028 adds defects and uat_test_executions with foreign keys", async () => {
  const names = (await readdir(new URL("drizzle/", root))).filter((name) => name.startsWith("0028_") && name.endsWith(".sql"));
  assert.equal(names.length, 1);
  const migration = await read(`drizzle/${names[0]}`);
  for (const value of [
    "CREATE TABLE `defects`", "CREATE TABLE `uat_test_executions`",
    "FOREIGN KEY (`duplicate_of_id`) REFERENCES `defects`", "FOREIGN KEY (`test_case_id`) REFERENCES `uat_test_cases`",
    "FOREIGN KEY (`defect_id`) REFERENCES `defects`",
  ]) assert.match(migration, new RegExp(value.replace(/[()`]/g, "\\$&")));
});

test("all 29 migrations replay cleanly with referential integrity intact", async () => {
  const { database, files } = await migratedDatabase();
  assert.equal(files.filter((name) => Number(name.slice(0, 4)) <= 28).length, 29);
  assert.deepEqual(database.prepare("PRAGMA foreign_key_check").all(), []);
  database.close();
});

test("database constraints enforce controlled defect vocabulary and resolution/closure/duplicate evidence", async () => {
  const { database } = await migratedDatabase();
  seedTestCase(database);
  assert.throws(() => database.exec("INSERT INTO defects(id,business_id,project_id,title,severity) VALUES('defect-bad','DEF-0001','project-1','Bad severity','NOT_A_SEVERITY')"), /CHECK/);
  assert.throws(() => database.exec("INSERT INTO defects(id,business_id,project_id,title,status) VALUES('defect-2','DEF-0002','project-1','Missing resolution','FIXED')"), /CHECK/, "FIXED requires resolved_at");
  database.exec("INSERT INTO defects(id,business_id,project_id,title,status,resolved_at) VALUES('defect-2','DEF-0002','project-1','Resolved defect','FIXED','2026-08-20T00:00:00Z')");
  assert.throws(() => database.exec("UPDATE defects SET status='CLOSED' WHERE id='defect-2'"), /CHECK/, "CLOSED requires closed_at");
  database.exec("UPDATE defects SET status='VERIFIED' WHERE id='defect-2'");
  database.exec("UPDATE defects SET status='CLOSED',closed_at='2026-08-21T00:00:00Z' WHERE id='defect-2'");
  assert.throws(() => database.exec("INSERT INTO defects(id,business_id,project_id,title,status) VALUES('defect-3','DEF-0003','project-1','Bad duplicate','DUPLICATE')"), /CHECK/, "DUPLICATE requires duplicate_of_id");
  database.exec("INSERT INTO defects(id,business_id,project_id,title,status,closed_at,duplicate_of_id) VALUES('defect-3','DEF-0003','project-1','Duplicate defect','DUPLICATE','2026-08-21T00:00:00Z','defect-2')");
  database.close();
});

test("database constraints enforce append-only execution evidence and one execution number per test case", async () => {
  const { database } = await migratedDatabase();
  seedTestCase(database);
  assert.throws(() => database.exec("INSERT INTO uat_test_executions(id,test_case_id,execution_number,result) VALUES('exec-bad','tc-1',1,'PASS')"), /CHECK/, "PASS requires executed_at/executed_by_user_id");
  database.exec("INSERT INTO uat_test_executions(id,test_case_id,execution_number,result,executed_at,executed_by_user_id) VALUES('exec-1','tc-1',1,'PASS','2026-08-20T00:00:00Z','user-1')");
  assert.throws(() => database.exec("INSERT INTO uat_test_executions(id,test_case_id,execution_number,result) VALUES('exec-2','tc-1',1,'NOT_EXECUTED')"), /UNIQUE/, "execution_number must be unique per test case");
  assert.throws(() => database.exec("INSERT INTO uat_test_executions(id,test_case_id,execution_number,result,executed_at,executed_by_user_id) VALUES('exec-3','tc-1',2,'NOT_EXECUTED','2026-08-20T00:00:00Z','user-1')"), /CHECK/, "NOT_EXECUTED forbids executor evidence");
  database.close();
});

test("representative defect and execution queries select their intended indexes", async () => {
  const { database } = await migratedDatabase();
  seedTestCase(database);
  database.exec("INSERT INTO defects(id,business_id,project_id,title) VALUES('defect-1','DEF-0001','project-1','Login fails')");
  database.exec("INSERT INTO uat_test_executions(id,test_case_id,execution_number,result,executed_at,executed_by_user_id,defect_id) VALUES('exec-1','tc-1',1,'FAIL','2026-08-20T00:00:00Z','user-1','defect-1')");
  const plan = (sql, ...parameters) => database.prepare(`EXPLAIN QUERY PLAN ${sql}`).all(...parameters).map((row) => String(row.detail)).join(" ");
  assert.match(plan("SELECT * FROM defects WHERE project_id=? AND status=? AND severity=?", "project-1", "OPEN", "MEDIUM"), /idx_defects_project_status_severity/);
  assert.match(plan("SELECT * FROM uat_test_executions WHERE test_case_id=?", "tc-1"), /idx_uat_test_executions_test_case|uq_uat_test_executions_case_number/);
  database.close();
});

test("UAT execution repository enforces Ready-only recording, append-only numbering and a guarded campaign start side effect", async () => {
  const source = await read("db/uat-executions.ts");
  for (const value of [
    "assertTestCaseExecutable", "assertExecutionEvidenceConsistent", "assertCampaignTransition",
    "COUNT(*) total FROM uat_test_executions", "executionNumber = (countRow?.total ?? 0) + 1",
    "input.result === \"FAIL\" || input.result === \"BLOCKED\"",
    "testCase.campaignStatus === \"DRAFT\" || testCase.campaignStatus === \"PLANNED\"",
  ]) assert.ok(source.includes(value), `missing ${value}`);
  assert.doesNotMatch(source, /requestBody|responseBody|authorizationHeader/i);
});

test("execution contract requires a valid result, rejects a defect on a non-Fail/Blocked result, and validates linked defect fields", async () => {
  const source = await read("app/releases/uat-execution-contract.ts");
  for (const control of [
    "validateExecutionInput", "parseExecutionResult", "parseDefectSeverity",
    "Select a valid execution result.", "A linked defect can only be logged for a Fail or Blocked result.",
    "Enter a defect title.", "Select a valid defect severity.",
    "result !== \"FAIL\" && result !== \"BLOCKED\"",
  ]) assert.ok(source.includes(control), `missing ${control}`);
});

test("UAT execution API is permission-scoped, never accepts a client-supplied executor, and returns stable no-store responses", async () => {
  const [executions, contract] = await Promise.all([
    read("app/api/v4/test-cases/[id]/executions/route.ts"),
    read("app/releases/uat-execution-contract.ts"),
  ]);
  assert.match(executions, /authorizeApi\("uat\.execute"\)/);
  assert.match(executions, /TEST_CASE_NOT_READY/);
  assert.match(executions, /EXECUTION_EVIDENCE_INVALID/);
  assert.match(executions, /apiHeaders/);
  assert.doesNotMatch(contract, /executedByUserId/, "the executor must be derived from the authenticated actor, never accepted from the request body");
});

test("Stage 4 Release navigation is wired to the Release Center as of Step 10 (this file's own Step 5 unexposed check is superseded)", async () => {
  const shell = await read("app/command-center-shell.tsx");
  assert.match(shell, /label: "Releases"/);
});
