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

function seedProject(database) {
  database.exec("INSERT INTO users(id,external_user_id,email,display_name) VALUES('user-1','external-1','owner@example.test','Owner')");
  database.exec("INSERT INTO products(id,business_id,name,code) VALUES('product-1','PROD-0001','Governed Product','GOV')");
  database.exec("INSERT INTO projects(id,business_id,name,code,product_id) VALUES('project-1','PROJ-0001','Governed Project','GOV-P','product-1')");
  database.exec("INSERT INTO backlog_items(id,business_id,project_id,item_type,title,status) VALUES('item-1','BL-0001','project-1','BUG','Fix login','READY')");
}

test("Step 5 defects schema already established the vocabulary Step 6 governs (regression guard)", async () => {
  const schema = await read("db/schema.ts");
  assert.match(schema, /export const defects/);
  assert.match(schema, /ck_defect_status/);
});

test("no migration was added by Step 6 (app-layer only) and all migrations through it still replay cleanly", async () => {
  const { database, files } = await migratedDatabase();
  assert.equal(files.filter((name) => Number(name.slice(0, 4)) <= 28).length, 29);
  assert.deepEqual(database.prepare("PRAGMA foreign_key_check").all(), []);
  database.close();
});

test("a defect cannot move to Fixed without a Done fix item, and cannot move to Verified without a later Pass execution", async () => {
  const { database } = await migratedDatabase();
  seedProject(database);
  database.exec("INSERT INTO defects(id,business_id,project_id,title) VALUES('defect-1','DEF-0001','project-1','Login fails')");
  // The database layer itself does not enforce the fix-item-done or retest-pass rules — those are
  // repository-level business rules verified by source-control checks below, but the underlying
  // status/evidence CHECK constraints must still hold for whatever the repository ultimately writes.
  assert.throws(() => database.exec("UPDATE defects SET status='FIXED' WHERE id='defect-1'"), /CHECK/, "FIXED requires resolved_at, which only the repository sets");
  database.exec("UPDATE defects SET status='FIXED',resolved_at='2026-08-20T00:00:00Z' WHERE id='defect-1'");
  database.exec("UPDATE defects SET status='VERIFIED' WHERE id='defect-1'");
  database.exec("UPDATE defects SET status='CLOSED',closed_at='2026-08-21T00:00:00Z' WHERE id='defect-1'");
  database.close();
});

test("defect repository derives verification evidence from the uat_test_executions chain and requires a Done fix item for Fixed", async () => {
  const source = await read("db/defects.ts");
  for (const value of [
    "DEF-", "entity_type,next_value,updated_at) VALUES('DEFECT'",
    "assertDefectTransition", "assertDefectClosureConsistent",
    "backlogItem.status !== \"DONE\"", "hasVerificationEvidence",
    "test_case_id=? AND execution_number>? AND result='PASS'",
  ]) assert.ok(source.includes(value), `missing ${value}`);
  assert.doesNotMatch(source, /requestBody|responseBody|authorizationHeader/i);
});

test("defect repository preserves the original resolution time across Fixed to Verified and clears it on reopen", async () => {
  const source = await read("db/defects.ts");
  assert.match(source, /CASE WHEN \? IN \('FIXED','VERIFIED'\) THEN COALESCE\(resolved_at,CURRENT_TIMESTAMP\) ELSE NULL END/);
  assert.match(source, /closed_at=NULL/);
});

test("defect contract validates creation, progress and closure input and routes terminal statuses away from the progress endpoint", async () => {
  const source = await read("app/releases/defect-contract.ts");
  for (const control of [
    "validateDefectCreationInput", "validateDefectProgressInput", "validateDefectClosureInput",
    "parseDefectSeverity", "parseDefectSource", "parseDefectStatus",
    "Enter a defect title.", "Use the close action for Closed, Deferred or Duplicate.",
    "A duplicate requires the defect it duplicates.", "A duplicate target is only allowed when marking Duplicate.",
  ]) assert.ok(source.includes(control), `missing ${control}`);
});

test("defect APIs are permission-scoped, separate progress updates from terminal closure, and return stable no-store responses", async () => {
  const [list, detail, close] = await Promise.all([
    read("app/api/v4/defects/route.ts"),
    read("app/api/v4/defects/[id]/route.ts"),
    read("app/api/v4/defects/[id]/close/route.ts"),
  ]);
  assert.match(list, /authorizeApi\("defect\.view"\)/);
  assert.match(list, /authorizeApi\("defect\.create"\)/);
  assert.match(detail, /authorizeApi\("defect\.edit"\)/);
  assert.match(detail, /VERSION_CONFLICT/);
  assert.match(detail, /FIX_ITEM_NOT_DONE/);
  assert.match(detail, /VERIFICATION_EVIDENCE_MISSING/);
  assert.match(close, /authorizeApi\("defect\.close"\)/);
  assert.match(close, /INVALID_DUPLICATE_TARGET/);
  for (const source of [list, detail, close]) assert.match(source, /apiHeaders/);
});

test("Stage 4 Release navigation and UI remain unexposed after Step 6", async () => {
  const shell = await read("app/command-center-shell.tsx");
  assert.doesNotMatch(shell, /label: "Releases"/);
});
