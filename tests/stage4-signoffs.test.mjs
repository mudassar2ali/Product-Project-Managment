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

function seedRelease(database, status = "READY_FOR_SIGNOFF") {
  database.exec("INSERT INTO users(id,external_user_id,email,display_name) VALUES('user-1','external-1','owner@example.test','Owner')");
  database.exec("INSERT INTO users(id,external_user_id,email,display_name) VALUES('user-2','external-2','approver@example.test','Approver')");
  database.exec("INSERT INTO products(id,business_id,name,code) VALUES('product-1','PROD-0001','Governed Product','GOV')");
  database.exec("INSERT INTO projects(id,business_id,name,code,product_id) VALUES('project-1','PROJ-0001','Governed Project','GOV-P','product-1')");
  database.exec(`INSERT INTO releases(id,business_id,project_id,name,owner_user_id,status,updated_by) VALUES('release-1','REL-0001','project-1','2026.09 Release','user-1','${status}','user-1')`);
}

test("Step 8 schema gives signoff_requests a fourth nullable Release subject with a matching partial unique index", async () => {
  const schema = await read("db/schema.ts");
  for (const value of [
    "releaseId: text\\(\"release_id\"\\)\\.references", "uq_signoff_requests_active_release", "idx_signoff_requests_release",
  ]) assert.match(schema, new RegExp(value));
  const subjectCheck = schema.match(/check\("ck_signoff_request_subject", sql`([\s\S]*?)`\)/)?.[1] ?? "";
  assert.match(subjectCheck, /table\.releaseId\} IS NOT NULL/);
  assert.equal((subjectCheck.match(/OR \(/g) ?? []).length, 3, "the subject check must be a four-way exclusive-or (3 ORs joining 4 clauses)");
});

test("generated forward migration 0030 rebuilds signoff_requests for the new column and re-creates all three of its triggers", async () => {
  const names = (await readdir(new URL("drizzle/", root))).filter((name) => name.startsWith("0030_") && name.endsWith(".sql"));
  assert.equal(names.length, 1);
  const migration = await read(`drizzle/${names[0]}`);
  assert.match(migration, /FOREIGN KEY \(`release_id`\) REFERENCES `releases`/);
  assert.match(migration, /CREATE UNIQUE INDEX `uq_signoff_requests_active_release`/);
  // The old migration's INSERT...SELECT must supply a literal NULL for the new column — the source
  // (pre-rebuild) table has no release_id yet, so selecting the column name itself would fail.
  assert.match(migration, /SELECT "id", "document_version_id", "requirement_revision_id", "feasibility_revision_id", NULL, "status"/);
  for (const trigger of ["trg_signoff_requests_transition", "trg_signoff_requests_locked_identity_update", "trg_signoff_requests_locked_delete"]) {
    assert.match(migration, new RegExp(`CREATE TRIGGER \`${trigger}\``), `${trigger} must be re-created after the table rebuild — DROP TABLE silently deletes any trigger drizzle-kit does not manage`);
  }
  assert.match(migration, /NEW\.release_id IS NOT OLD\.release_id/, "the identity-lock trigger must also guard the new release_id column");
});

test("all 31 migrations replay cleanly with referential integrity intact", async () => {
  const { database, files } = await migratedDatabase();
  assert.equal(files.filter((name) => Number(name.slice(0, 4)) <= 30).length, 31);
  assert.deepEqual(database.prepare("PRAGMA foreign_key_check").all(), []);
  database.close();
});

test("database enforces the four-way exclusive subject, one active request per Release, and the recreated triggers still fire", async () => {
  const { database } = await migratedDatabase();
  seedRelease(database);
  assert.throws(() => database.exec("INSERT INTO signoff_requests(id,requested_by,created_by,updated_by) VALUES('sr-bad','user-1','user-1','user-1')"), /CHECK/, "a request needs exactly one subject");
  assert.throws(
    () => database.exec("INSERT INTO signoff_requests(id,release_id,requirement_revision_id,requested_by,created_by,updated_by) VALUES('sr-bad2','release-1','req-rev-x','user-1','user-1','user-1')"),
    /CHECK|FOREIGN KEY/,
    "a request cannot carry two subjects at once",
  );
  database.exec("INSERT INTO signoff_requests(id,release_id,requested_by,created_by,updated_by) VALUES('sr-1','release-1','user-1','user-1','user-1')");
  assert.throws(
    () => database.exec("INSERT INTO signoff_requests(id,release_id,requested_by,created_by,updated_by) VALUES('sr-2','release-1','user-1','user-1','user-1')"),
    /UNIQUE/,
    "only one active (PENDING/UNDER_REVIEW) request per Release",
  );
  assert.throws(() => database.exec("UPDATE signoff_requests SET release_id=NULL WHERE id='sr-1'"), /SIGNOFF_REQUEST_LOCKED/, "the identity-lock trigger must still fire after the rebuild");
  database.exec("UPDATE signoff_requests SET status='APPROVED',completed_at=CURRENT_TIMESTAMP WHERE id='sr-1'");
  assert.throws(() => database.exec("UPDATE signoff_requests SET status='REJECTED' WHERE id='sr-1'"), /SIGNOFF_REQUEST_TRANSITION_INVALID/, "the transition trigger must still fire after the rebuild — APPROVED is terminal and cannot move to REJECTED");
  database.close();
});

test("signoff contract accepts RELEASE as a fourth sign-off subject type", async () => {
  const source = await read("app/governance/signoff-contract.ts");
  assert.match(source, /SignoffSubjectType = "DOCUMENT_VERSION" \| "REQUIREMENT_REVISION" \| "FEASIBILITY_REVISION" \| "RELEASE"/);
  assert.match(source, /requestedSubjectType === "RELEASE"/);
});

test("the signoff repository is extended, not special-cased, for Release: a per-subject-type eligibility status, a Release UPDATE gated on READY_FOR_SIGNOFF, and Release folded into every existing subject-derivation branch", async () => {
  const source = await read("db/signoffs.ts");
  for (const value of [
    "loadReleaseSubject", "RELEASE: \"READY_FOR_SIGNOFF\"",
    "statusColumn !== eligibleStatusBySubjectType[input.subjectType]",
    "UPDATE releases SET status=?,version=version+1", "WHERE id=? AND status='READY_FOR_SIGNOFF'",
    "release_id=?", "lane.releaseId",
  ]) assert.ok(source.includes(value), `missing ${value}`);
});

test("release readiness now reads real sign-off evidence instead of the Step 7 null/0 placeholder", async () => {
  const source = await read("db/release-readiness.ts");
  for (const value of [
    "FROM signoff_requests WHERE release_id=? ORDER BY requested_at DESC, id DESC LIMIT 1",
    "FROM signoff_conditions c",
    "JOIN signoff_decisions d ON d.id=c.decision_id",
    "JOIN signoff_lanes l ON l.id=d.signoff_lane_id",
    "WHERE l.signoff_request_id=? AND c.status IN ('OPEN','IN_PROGRESS')",
  ]) assert.ok(source.includes(value), `missing ${value}`);
  assert.doesNotMatch(source, /signoffStatus: null,\s*\n\s*openMandatorySignoffConditions: 0,/, "the Step 7 hardcoded placeholder must be gone now that signoff_requests.release_id exists");
});

test("Stage 4 Release navigation and UI remain unexposed after Step 8", async () => {
  const shell = await read("app/command-center-shell.tsx");
  assert.doesNotMatch(shell, /label: "Releases"/);
});
