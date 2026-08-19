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
  database.exec("INSERT INTO users(id,external_user_id,email,display_name) VALUES('user-1','external-1','eng@example.test','Engineer')");
  database.exec("INSERT INTO products(id,business_id,name,code) VALUES('product-1','PROD-0001','Governed Product','GOV')");
  database.exec("INSERT INTO projects(id,business_id,name,code,product_id) VALUES('project-1','PROJ-0001','Governed Project','GOV-P','product-1')");
  database.exec("INSERT INTO technical_feasibility_assessments(id,business_id,project_id,created_by,updated_by) VALUES('assess-1','FEAS-0001','project-1','user-1','user-1')");
  database.exec("INSERT INTO technical_feasibility_revisions(id,assessment_id,revision_number,created_by,updated_by) VALUES('rev-1','assess-1',1,'user-1','user-1')");
}

test("Step 10 schema defines feasibility assessments, revisions and requirement links with controlled fields", async () => {
  const schema = await read("db/schema.ts");
  for (const value of [
    "technicalFeasibilityAssessments", "technicalFeasibilityRevisions", "feasibilityRequirementLinks",
    "uq_technical_feasibility_revisions_one_draft", "uq_technical_feasibility_revisions_one_current", "uq_feasibility_requirement_links_edge",
    "feasibilityRevisionId",
  ]) assert.match(schema, new RegExp(value));
  for (const constraint of [
    "ck_technical_feasibility_revision_status", "ck_technical_feasibility_revision_lock", "ck_technical_feasibility_revision_estimate",
    "ck_technical_feasibility_revision_estimate_unit", "ck_signoff_request_subject",
  ]) assert.match(schema, new RegExp(constraint));
});

test("generated Step 10 migration creates feasibility tables, recreates signoff_requests with a third subject and restores its triggers", async () => {
  const names = (await readdir(new URL("drizzle/", root))).filter((name) => name.startsWith("0024_") && name.endsWith(".sql"));
  assert.equal(names.length, 1);
  const migration = await read(`drizzle/${names[0]}`);
  for (const value of [
    "CREATE TABLE `technical_feasibility_assessments`", "CREATE TABLE `technical_feasibility_revisions`", "CREATE TABLE `feasibility_requirement_links`",
    "CREATE TABLE `__new_signoff_requests`", "`feasibility_revision_id` text",
    "trg_technical_feasibility_revisions_transition", "trg_technical_feasibility_revisions_locked_identity_update", "trg_technical_feasibility_revisions_locked_delete",
    "trg_technical_feasibility_assessments_locked_delete",
    "trg_signoff_requests_transition", "trg_signoff_requests_locked_identity_update", "trg_signoff_requests_locked_delete",
  ]) assert.match(migration, new RegExp(value.replace(/[()]/g, "\\$&")));
  // the recreate's copy-forward must not select a column the source table never had
  assert.doesNotMatch(migration, /SELECT "id", "document_version_id", "requirement_revision_id", "feasibility_revision_id",/);
});

test("all 25 migrations replay with feasibility integrity", async () => {
  const { database, files } = await migratedDatabase();
  assert.equal(files.filter((name) => Number(name.slice(0, 4)) <= 24).length, 25);
  assert.ok(database.prepare("SELECT COUNT(*) count FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'").get().count >= 53);
  assert.deepEqual(database.prepare("PRAGMA foreign_key_check").all(), []);
  database.close();
});

test("database allows only one draft and one current-decided revision per assessment", async () => {
  const { database } = await migratedDatabase();
  seedGraph(database);
  assert.throws(() => database.exec("INSERT INTO technical_feasibility_revisions(id,assessment_id,revision_number,created_by,updated_by) VALUES('rev-2','assess-1',2,'user-1','user-1')"), /UNIQUE/);
  database.exec(`UPDATE technical_feasibility_revisions SET status='IN_REVIEW',content_hash='${"a".repeat(64)}',submitted_at=CURRENT_TIMESTAMP WHERE id='rev-1'`);
  database.exec("UPDATE technical_feasibility_revisions SET status='FEASIBLE',approved_at=CURRENT_TIMESTAMP WHERE id='rev-1'");
  // a second decided revision cannot coexist with the still-current rev-1
  assert.throws(
    () => database.exec("INSERT INTO technical_feasibility_revisions(id,assessment_id,revision_number,status,content_hash,submitted_at,approved_at,created_by,updated_by) VALUES('rev-2','assess-1',2,'FEASIBLE_WITH_CONDITIONS','" + "b".repeat(64) + "',CURRENT_TIMESTAMP,CURRENT_TIMESTAMP,'user-1','user-1')"),
    /UNIQUE/,
  );
  // superseding rev-1 frees the slot for a new decided revision
  database.exec("UPDATE technical_feasibility_revisions SET status='SUPERSEDED' WHERE id='rev-1'");
  database.exec("INSERT INTO technical_feasibility_revisions(id,assessment_id,revision_number,status,content_hash,submitted_at,approved_at,created_by,updated_by) VALUES('rev-2','assess-1',2,'FEASIBLE_WITH_CONDITIONS','" + "b".repeat(64) + "',CURRENT_TIMESTAMP,CURRENT_TIMESTAMP,'user-1','user-1')");
  database.close();
});

test("feasibility revision transitions are guarded and content is locked once submitted", async () => {
  const { database } = await migratedDatabase();
  seedGraph(database);
  assert.throws(() => database.exec("UPDATE technical_feasibility_revisions SET status='FEASIBLE' WHERE id='rev-1'"), /FEASIBILITY_REVISION_TRANSITION_INVALID/);
  database.exec(`UPDATE technical_feasibility_revisions SET status='IN_REVIEW',content_hash='${"a".repeat(64)}',submitted_at=CURRENT_TIMESTAMP WHERE id='rev-1'`);
  assert.throws(() => database.exec("UPDATE technical_feasibility_revisions SET feasibility_summary='changed' WHERE id='rev-1'"), /FEASIBILITY_REVISION_LOCKED/);
  assert.throws(() => database.exec("DELETE FROM technical_feasibility_revisions WHERE id='rev-1'"), /FEASIBILITY_REVISION_LOCKED/);
  database.exec("UPDATE technical_feasibility_revisions SET status='NOT_FEASIBLE' WHERE id='rev-1'");
  assert.throws(() => database.exec("UPDATE technical_feasibility_revisions SET status='FEASIBLE' WHERE id='rev-1'"), /FEASIBILITY_REVISION_TRANSITION_INVALID/);
  database.close();
});

test("signoff_requests enforces exactly one of three subjects and locks all three identity columns", async () => {
  const { database } = await migratedDatabase();
  seedGraph(database);
  database.exec(`UPDATE technical_feasibility_revisions SET status='IN_REVIEW',content_hash='${"a".repeat(64)}',submitted_at=CURRENT_TIMESTAMP WHERE id='rev-1'`);
  database.exec("INSERT INTO signoff_requests(id,feasibility_revision_id,requested_by,created_by,updated_by) VALUES('sr-1','rev-1','user-1','user-1','user-1')");
  assert.throws(() => database.exec("INSERT INTO signoff_requests(id,requested_by,created_by,updated_by) VALUES('sr-2','user-1','user-1','user-1')"), /CHECK/);
  assert.throws(() => database.exec("UPDATE signoff_requests SET feasibility_revision_id=NULL WHERE id='sr-1'"), /SIGNOFF_REQUEST_LOCKED/);
  database.close();
});

test("feasibility contract validates revision input, estimate/unit pairing and submission completeness", async () => {
  const source = await read("app/governance/feasibility-contract.ts");
  for (const control of [
    "validateFeasibilityAssessmentRegistrationInput", "validateFeasibilityRevisionInput", "incompleteFeasibilityRevision",
    "An engineering estimate and its unit must be provided together", "feasibilityEstimateUnits",
  ]) assert.match(source, new RegExp(control.replace(/[.]/g, "\\$&")));
});

test("feasibility repository resolves project/backlog scope, tracks drafts and computes a content hash on submit", async () => {
  const source = await read("db/feasibility.ts");
  for (const operation of ["listFeasibilityAssessments", "getFeasibilityWorkspace", "createFeasibilityAssessment", "updateFeasibilityDraft", "submitFeasibilityRevision"]) assert.match(source, new RegExp(operation));
  assert.match(source, /invalid_backlog_feature/);
  assert.match(source, /crypto\.subtle\.digest\("SHA-256"/);
  assert.match(source, /status='DRAFT'/);
});

test("feasibility APIs enforce view/edit/submit permissions independently and return stable errors", async () => {
  const paths = ["app/api/v3/projects/[id]/feasibility/route.ts", "app/api/v3/feasibility/[id]/route.ts", "app/api/v3/feasibility/[id]/submit/route.ts"];
  const sources = await Promise.all(paths.map(read));
  const joined = sources.join("\n");
  for (const permission of ["feasibility.view", "feasibility.edit", "feasibility.submit"]) assert.match(joined, new RegExp(`authorizeApi\\("${permission.replace(".", "\\.")}"\\)`));
  for (const error of ["VALIDATION_FAILED", "PROJECT_NOT_FOUND", "FEASIBILITY_ASSESSMENT_NOT_FOUND", "FEASIBILITY_REVISION_LOCKED", "FEASIBILITY_INCOMPLETE", "VERSION_CONFLICT"]) assert.match(joined, new RegExp(error));
  assert.match(joined, /apiHeaders\(context\.correlationId\)/);
});

test("sign-off subject propagation maps aggregate decisions onto feasibility outcomes", async () => {
  const source = await read("db/signoffs.ts");
  assert.match(source, /loadFeasibilityRevisionSubject/);
  assert.match(source, /FEASIBILITY_REVISION/);
  assert.match(source, /"FEASIBLE"/);
  assert.match(source, /"FEASIBLE_WITH_CONDITIONS"/);
  assert.match(source, /"NOT_FEASIBLE"/);
});

test("Feasibility remains unexposed in navigation", async () => {
  const shell = await read("app/command-center-shell.tsx");
  for (const deferred of ["Requirements", "Traceability", "Sign-offs", "RACI", "Feasibility"]) assert.doesNotMatch(shell, new RegExp(`label: "${deferred}"`));
});
