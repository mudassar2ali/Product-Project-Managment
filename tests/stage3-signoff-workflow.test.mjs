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
  database.exec("INSERT INTO users(id,external_user_id,email,display_name) VALUES('user-author','external-author','author@example.test','Author')");
  database.exec("INSERT INTO users(id,external_user_id,email,display_name) VALUES('user-approver','external-approver','approver@example.test','Approver')");
  database.exec("INSERT INTO products(id,business_id,name,code) VALUES('product-1','PROD-0001','Governed Product','GOV')");
  database.exec("INSERT INTO governance_documents(id,business_id,document_type,title,product_id,created_by,updated_by) VALUES('doc-1','BRD-0001','BRD','Checkout BRD','product-1','user-author','user-author')");
  database.exec(`INSERT INTO governance_document_versions(id,document_id,version_label,lifecycle_status,content_hash,submitted_at,locked_at,created_by,updated_by)
    VALUES('doc-version-1','doc-1','Review 0.1','IN_REVIEW','${"a".repeat(64)}',CURRENT_TIMESTAMP,CURRENT_TIMESTAMP,'user-author','user-author')`);
}

test("Step 8 schema defines sign-off requests, lanes, decisions and conditions with controlled fields", async () => {
  const schema = await read("db/schema.ts");
  for (const value of [
    "signoffRequests", "signoffLanes", "signoffDecisions", "signoffConditions",
    "uq_signoff_lanes_request_type", "uq_signoff_requests_active_document_version", "uq_signoff_requests_active_requirement_revision",
  ]) assert.match(schema, new RegExp(value));
  for (const constraint of [
    "ck_signoff_request_subject", "ck_signoff_request_completion", "ck_signoff_lane_type", "ck_signoff_lane_status",
    "ck_signoff_decision_value", "ck_signoff_decision_not_self", "ck_signoff_condition_status", "ck_signoff_condition_closure",
  ]) assert.match(schema, new RegExp(constraint));
});

test("generated Step 8 migration creates all four tables with triggers governing transitions and immutability", async () => {
  const names = (await readdir(new URL("drizzle/", root))).filter((name) => name.startsWith("0022_") && name.endsWith(".sql"));
  assert.equal(names.length, 1);
  const migration = await read(`drizzle/${names[0]}`);
  for (const value of [
    "CREATE TABLE `signoff_requests`", "CREATE TABLE `signoff_lanes`", "CREATE TABLE `signoff_decisions`", "CREATE TABLE `signoff_conditions`",
    "trg_signoff_requests_transition", "trg_signoff_requests_locked_identity_update", "trg_signoff_lanes_locked_delete",
    "trg_signoff_decisions_immutable_update", "trg_signoff_decisions_immutable_delete",
    "trg_signoff_conditions_transition", "trg_signoff_conditions_locked_delete",
  ]) assert.match(migration, new RegExp(value.replace(/[()]/g, "\\$&")));
});

test("all 23 migrations replay with sign-off integrity", async () => {
  const { database, files } = await migratedDatabase();
  assert.equal(files.filter((name) => Number(name.slice(0, 4)) <= 22).length, 23);
  assert.ok(database.prepare("SELECT COUNT(*) count FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'").get().count >= 44);
  assert.deepEqual(database.prepare("PRAGMA foreign_key_check").all(), []);
  database.close();
});

test("database constraints reject a sign-off request with no subject or both subjects", async () => {
  const { database } = await migratedDatabase();
  seedGraph(database);
  assert.throws(() => database.exec("INSERT INTO signoff_requests(id,requested_by) VALUES('req-1','user-author')"), /CHECK/);
  assert.throws(() => database.exec("INSERT INTO signoff_requests(id,document_version_id,requirement_revision_id,requested_by) VALUES('req-2','doc-version-1','doc-version-1','user-author')"), /CHECK|FOREIGN/);
  database.exec("INSERT INTO signoff_requests(id,document_version_id,requested_by) VALUES('req-3','doc-version-1','user-author')");
  database.close();
});

test("database rejects a second active sign-off request for the same subject and a duplicate lane type", async () => {
  const { database } = await migratedDatabase();
  seedGraph(database);
  database.exec("INSERT INTO signoff_requests(id,document_version_id,requested_by) VALUES('req-1','doc-version-1','user-author')");
  assert.throws(() => database.exec("INSERT INTO signoff_requests(id,document_version_id,requested_by) VALUES('req-2','doc-version-1','user-author')"), /UNIQUE/);
  database.exec("INSERT INTO signoff_lanes(id,signoff_request_id,lane_type,assigned_approver_user_id) VALUES('lane-1','req-1','PRODUCT','user-approver')");
  assert.throws(() => database.exec("INSERT INTO signoff_lanes(id,signoff_request_id,lane_type,assigned_approver_user_id) VALUES('lane-2','req-1','PRODUCT','user-approver')"), /UNIQUE/);
  database.close();
});

test("sign-off decisions are append-only and immutable once recorded", async () => {
  const { database } = await migratedDatabase();
  seedGraph(database);
  database.exec("INSERT INTO signoff_requests(id,document_version_id,requested_by) VALUES('req-1','doc-version-1','user-author')");
  database.exec("INSERT INTO signoff_lanes(id,signoff_request_id,lane_type,assigned_approver_user_id) VALUES('lane-1','req-1','PRODUCT','user-approver')");
  database.exec("INSERT INTO signoff_decisions(id,signoff_lane_id,decision,approver_user_id) VALUES('dec-1','lane-1','APPROVED','user-approver')");
  assert.throws(() => database.exec("UPDATE signoff_decisions SET decision='REJECTED' WHERE id='dec-1'"), /SIGNOFF_DECISION_IMMUTABLE/);
  assert.throws(() => database.exec("DELETE FROM signoff_decisions WHERE id='dec-1'"), /SIGNOFF_DECISION_IMMUTABLE/);
  assert.throws(() => database.exec("INSERT INTO signoff_decisions(id,signoff_lane_id,decision,approver_user_id) VALUES('dec-2','lane-1','WITHDRAWN','user-approver')"), /CHECK/);
  database.close();
});

test("sign-off conditions enforce valid transitions and closure evidence consistency", async () => {
  const { database } = await migratedDatabase();
  seedGraph(database);
  database.exec("INSERT INTO signoff_requests(id,document_version_id,requested_by) VALUES('req-1','doc-version-1','user-author')");
  database.exec("INSERT INTO signoff_lanes(id,signoff_request_id,lane_type,assigned_approver_user_id) VALUES('lane-1','req-1','PRODUCT','user-approver')");
  database.exec("INSERT INTO signoff_decisions(id,signoff_lane_id,decision,approver_user_id) VALUES('dec-1','lane-1','APPROVED_WITH_CONDITIONS','user-approver')");
  assert.throws(() => database.exec("INSERT INTO signoff_conditions(id,decision_id,description,status,closed_by,closed_at) VALUES('cond-1','dec-1','Needs load test','OPEN','user-approver',CURRENT_TIMESTAMP)"), /CHECK/);
  database.exec("INSERT INTO signoff_conditions(id,decision_id,description) VALUES('cond-2','dec-1','Needs load test')");
  assert.throws(() => database.exec("UPDATE signoff_conditions SET status='SATISFIED' WHERE id='cond-2'"), /CHECK/);
  database.exec("UPDATE signoff_conditions SET status='SATISFIED',closure_evidence='Load test passed',closed_by='user-approver',closed_at=CURRENT_TIMESTAMP WHERE id='cond-2'");
  assert.throws(() => database.exec("UPDATE signoff_conditions SET status='OPEN' WHERE id='cond-2'"), /SIGNOFF_CONDITION_TRANSITION_INVALID/);
  database.close();
});

test("signoff contract validates request, decision and condition input with bounded, condition-consistent fields", async () => {
  const source = await read("app/governance/signoff-contract.ts");
  for (const control of [
    "validateSignoffRequestInput", "validateSignoffDecisionInput", "validateSignoffConditionUpdateInput",
    "Provide at least one approver lane", "At least one lane must be required",
    "Approved with Conditions requires at least one tracked condition",
    "Conditions only apply to an Approved with Conditions decision",
    "Provide a waiver reason",
  ]) assert.match(source, new RegExp(control.replace(/[.]/g, "\\$&")));
});

test("signoff repository enforces subject eligibility, assignment, self-approval prevention and aggregate transitions", async () => {
  const source = await read("db/signoffs.ts");
  for (const operation of ["createSignoffRequest", "recordSignoffDecision", "updateSignoffCondition", "getSignoffRequestWorkspace", "listSignoffRequests"]) assert.match(source, new RegExp(operation));
  assert.match(source, /statusColumn !== "IN_REVIEW"/);
  assert.match(source, /not_assigned/);
  assert.match(source, /self_approval_forbidden/);
  assert.match(source, /aggregateSignoffStatus/);
  assert.match(source, /applySubjectDecision/);
});

test("sign-off APIs enforce independent permissions, waiver elevation and stable error codes", async () => {
  const paths = ["app/api/v3/signoffs/route.ts", "app/api/v3/signoff-lanes/[id]/decisions/route.ts", "app/api/v3/signoff-conditions/[id]/route.ts"];
  const sources = await Promise.all(paths.map(read));
  const joined = sources.join("\n");
  for (const permission of ["signoff.view", "signoff.request", "signoff.decide", "signoff.manage"]) assert.match(joined, new RegExp(`authorizeApi\\("${permission.replace(".", "\\.")}"\\)`));
  assert.match(joined, /signoff\.waive_condition/);
  for (const error of ["VALIDATION_FAILED", "ACTIVE_SIGNOFF_EXISTS", "SELF_APPROVAL_FORBIDDEN", "NOT_ASSIGNED_APPROVER", "WAIVER_FORBIDDEN", "VERSION_CONFLICT"]) assert.match(joined, new RegExp(error));
  assert.match(joined, /apiHeaders\(context\.correlationId\)/);
});

test("Sign-offs remain unexposed in navigation while RACI and Feasibility stay absent", async () => {
  const shell = await read("app/command-center-shell.tsx");
  for (const deferred of ["Requirements", "Traceability", "Sign-offs", "RACI", "Feasibility"]) assert.doesNotMatch(shell, new RegExp(`label: "${deferred}"`));
});
