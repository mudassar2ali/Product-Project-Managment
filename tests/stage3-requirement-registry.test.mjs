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

function seedRequirement(database) {
  database.exec("INSERT INTO users(id,external_user_id,email,display_name) VALUES('user-1','external-1','owner@example.test','Owner')");
  database.exec("INSERT INTO products(id,business_id,name,code) VALUES('product-1','PROD-0001','Governed Product','GOV')");
  database.exec("INSERT INTO projects(id,business_id,name,code,product_id) VALUES('project-1','PROJ-0001','Governed Project','GOV-P','product-1')");
  database.exec("INSERT INTO requirements(id,business_id,requirement_type,product_id,project_id,owner_user_id) VALUES('requirement-1','REQ-0001','FUNCTIONAL','product-1','project-1','user-1')");
  database.exec("INSERT INTO requirement_revisions(id,requirement_id,revision_number,title,statement,verification_method,governance_status) VALUES('revision-1','requirement-1',1,'Checkout must support guest orders','Guest users can complete checkout without an account.','Manual UAT walkthrough','DRAFT')");
}

test("Step 5 schema defines relational requirements and requirement revisions", async () => {
  const schema = await read("db/schema.ts");
  for (const value of [
    "requirements", "requirementRevisions",
    "uq_requirements_business_id", "uq_requirement_revisions_number", "uq_requirement_revisions_one_draft",
    "uq_requirement_revisions_one_current_approved", "idx_requirements_product_type_status", "idx_requirements_project_type_status",
    "idx_requirement_revisions_requirement_status",
  ]) assert.match(schema, new RegExp(value));
  for (const constraint of [
    "ck_requirement_type", "ck_requirement_status", "ck_requirement_archive",
    "ck_requirement_revision_status", "ck_requirement_revision_priority", "ck_requirement_revision_hash", "ck_requirement_revision_lock",
  ]) assert.match(schema, new RegExp(constraint));
});

test("generated Step 5 migration contains tables indexes foreign keys and immutability triggers", async () => {
  const names = (await readdir(new URL("drizzle/", root))).filter((name) => name.startsWith("0019_") && name.endsWith(".sql"));
  assert.equal(names.length, 1);
  const migration = await read(`drizzle/${names[0]}`);
  for (const value of [
    "CREATE TABLE `requirements`", "CREATE TABLE `requirement_revisions`",
    "FOREIGN KEY (`product_id`)", "FOREIGN KEY (`requirement_id`)", "FOREIGN KEY (`document_id`)",
    "uq_requirement_revisions_one_draft", "uq_requirement_revisions_one_current_approved",
    "trg_requirement_revisions_transition", "trg_requirement_revisions_locked_identity_update", "trg_requirement_revisions_locked_delete",
    "trg_requirements_locked_delete",
    "REQUIREMENT_REVISION_LOCKED", "REQUIREMENT_REVISION_TRANSITION_INVALID",
  ]) assert.match(migration, new RegExp(value.replace(/[()]/g, "\\$&")));
});

test("all 20 migrations replay with requirement registry integrity", async () => {
  const { database, files } = await migratedDatabase();
  assert.equal(files.filter((name) => Number(name.slice(0, 4)) <= 19).length, 20);
  assert.ok(database.prepare("SELECT COUNT(*) count FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'").get().count >= 39);
  assert.deepEqual(database.prepare("PRAGMA foreign_key_check").all(), []);
  assert.equal(database.prepare("SELECT COUNT(*) count FROM sqlite_master WHERE type='trigger' AND name LIKE 'trg_requirement%'").get().count, 4);
  database.close();
});

test("database constraints enforce one draft per requirement and controlled lifecycle values", async () => {
  const { database } = await migratedDatabase();
  seedRequirement(database);
  assert.throws(() => database.exec("INSERT INTO requirement_revisions(id,requirement_id,revision_number,title) VALUES('revision-2','requirement-1',2,'Second draft')"), /UNIQUE/);
  assert.throws(() => database.exec("INSERT INTO requirements(id,business_id,requirement_type,product_id) VALUES('requirement-2','REQ-0002','UNKNOWN','product-1')"), /CHECK/);
  assert.throws(() => database.exec("INSERT INTO requirement_revisions(id,requirement_id,revision_number,title,priority) VALUES('revision-3','requirement-1',3,'Bad priority','URGENT')"), /CHECK/);
  database.exec("UPDATE requirement_revisions SET governance_status='IN_REVIEW',content_hash=lower(hex(randomblob(32))),submitted_at='2026-08-18T00:00:00Z' WHERE id='revision-1'");
  assert.throws(() => database.exec("UPDATE requirement_revisions SET governance_status='DRAFT' WHERE id='revision-1'"), /REQUIREMENT_REVISION_TRANSITION_INVALID/);
  database.close();
});

test("locked requirement revisions reject content tampering and deletion", async () => {
  const { database } = await migratedDatabase();
  seedRequirement(database);
  database.exec("UPDATE requirement_revisions SET governance_status='IN_REVIEW',content_hash=lower(hex(randomblob(32))),submitted_at='2026-08-18T00:00:00Z' WHERE id='revision-1'");
  assert.throws(() => database.exec("UPDATE requirement_revisions SET title='Tampered title' WHERE id='revision-1'"), /REQUIREMENT_REVISION_LOCKED/);
  assert.throws(() => database.exec("DELETE FROM requirement_revisions WHERE id='revision-1'"), /REQUIREMENT_REVISION_LOCKED/);
  assert.throws(() => database.exec("DELETE FROM requirements WHERE id='requirement-1'"), /REQUIREMENT_REVISION_LOCKED/);
  database.close();
});

test("requirement contract validates registration and revision content with bounded fields", async () => {
  const source = await read("app/governance/requirement-contract.ts");
  for (const control of [
    "requirementPriorities", "validateRequirementRegistrationInput", "validateRequirementRevisionInput", "incompleteRequirementRevision",
    "3–240 characters", "20,000 characters", "4,000 characters",
  ]) assert.match(source, new RegExp(control.replace(/[.+]/g, "\\$&")));
});

test("requirement repository persists governed identity, optimistic drafts and bounded audit evidence", async () => {
  const source = await read("db/requirements.ts");
  for (const operation of ["listRequirements", "getRequirementWorkspace", "createRequirement", "updateRequirementDraft", "submitRequirementRevision", "archiveRequirement"]) assert.match(source, new RegExp(operation));
  assert.match(source, /REQ-/);
  assert.match(source, /version=version\+1/);
  assert.match(source, /governance_status='DRAFT'/);
  assert.match(source, /results\[1\]\?\.meta\.changes/);
  assert.match(source, /SUBMIT_REVIEW/);
  assert.match(source, /revisionNumber !== 1/);
});

test("requirement APIs enforce atomic permissions, validation, stable errors and no-store responses", async () => {
  const paths = [
    "app/api/v3/requirements/route.ts",
    "app/api/v3/requirements/[id]/route.ts",
    "app/api/v3/requirements/[id]/submit/route.ts",
  ];
  const sources = await Promise.all(paths.map(read));
  const joined = sources.join("\n");
  for (const permission of ["requirement.view", "requirement.create", "requirement.edit", "requirement.archive", "requirement.submit"]) assert.match(joined, new RegExp(`authorizeApi\\("${permission.replace(".", "\\.")}"\\)`));
  for (const error of ["VALIDATION_FAILED", "VERSION_REQUIRED", "REQUIREMENT_REVISION_LOCKED", "VERSION_CONFLICT", "REQUIREMENT_INCOMPLETE", "REQUIREMENT_NOT_FOUND", "REQUIREMENT_NOT_ELIGIBLE"]) assert.match(joined, new RegExp(error));
  assert.match(joined, /apiHeaders\(context\.correlationId\)/);
});

test("requirement registry navigation is exposed while later Stage 3 modules stay absent", async () => {
  const shell = await read("app/command-center-shell.tsx");
  assert.match(shell, /label: "Requirements"/);
  for (const deferred of ["Traceability", "Sign-offs", "RACI", "Feasibility"]) assert.doesNotMatch(shell, new RegExp(`label: "${deferred}"`));
});
