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
  database.exec("INSERT INTO products(id,business_id,name,code) VALUES('product-2','PROD-0002','Other Product','OTH')");
  database.exec("INSERT INTO projects(id,business_id,name,code,product_id) VALUES('project-1','PROJ-0001','Governed Project','GOV-P','product-1')");
  database.exec("INSERT INTO requirements(id,business_id,requirement_type,product_id,project_id) VALUES('requirement-1','REQ-0001','FUNCTIONAL','product-1','project-1')");
  database.exec("INSERT INTO requirements(id,business_id,requirement_type,product_id,project_id) VALUES('requirement-2','REQ-0002','FUNCTIONAL','product-1','project-1')");
  database.exec("INSERT INTO requirements(id,business_id,requirement_type,product_id,project_id) VALUES('requirement-3','REQ-0003','FUNCTIONAL','product-2',NULL)");
  database.exec("INSERT INTO backlog_items(id,business_id,project_id,item_type,title) VALUES('backlog-1','BLI-0001','project-1','STORY','Guest checkout story')");
}

test("Step 6 schema defines relational requirement relationships and backlog links", async () => {
  const schema = await read("db/schema.ts");
  for (const value of [
    "requirementRelationships", "requirementBacklogLinks",
    "uq_requirement_relationships_edge", "uq_requirement_backlog_links_edge",
    "idx_requirement_relationships_source", "idx_requirement_backlog_links_requirement",
  ]) assert.match(schema, new RegExp(value));
  for (const constraint of [
    "ck_requirement_relationship_type", "ck_requirement_relationship_not_self",
    "ck_requirement_backlog_link_type", "ck_requirement_backlog_link_coverage",
  ]) assert.match(schema, new RegExp(constraint));
});

test("generated Step 6 migration contains both tables with foreign keys and controlled edges", async () => {
  const names = (await readdir(new URL("drizzle/", root))).filter((name) => name.startsWith("0020_") && name.endsWith(".sql"));
  assert.equal(names.length, 1);
  const migration = await read(`drizzle/${names[0]}`);
  for (const value of [
    "CREATE TABLE `requirement_relationships`", "CREATE TABLE `requirement_backlog_links`",
    "FOREIGN KEY (`source_requirement_id`)", "FOREIGN KEY (`target_requirement_id`)",
    "FOREIGN KEY (`requirement_id`)", "FOREIGN KEY (`backlog_item_id`)",
    "uq_requirement_relationships_edge", "uq_requirement_backlog_links_edge",
  ]) assert.match(migration, new RegExp(value.replace(/[()]/g, "\\$&")));
});

test("all 21 migrations replay with traceability integrity", async () => {
  const { database, files } = await migratedDatabase();
  assert.equal(files.filter((name) => Number(name.slice(0, 4)) <= 20).length, 21);
  assert.ok(database.prepare("SELECT COUNT(*) count FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'").get().count >= 39);
  assert.deepEqual(database.prepare("PRAGMA foreign_key_check").all(), []);
  database.close();
});

test("database constraints reject self-relationships, unknown types and unbalanced partial coverage", async () => {
  const { database } = await migratedDatabase();
  seedGraph(database);
  assert.throws(() => database.exec("INSERT INTO requirement_relationships(id,source_requirement_id,target_requirement_id,relationship_type) VALUES('rel-1','requirement-1','requirement-1','DEPENDS_ON')"), /CHECK/);
  assert.throws(() => database.exec("INSERT INTO requirement_relationships(id,source_requirement_id,target_requirement_id,relationship_type) VALUES('rel-2','requirement-1','requirement-2','RELATES_TO')"), /CHECK/);
  database.exec("INSERT INTO requirement_relationships(id,source_requirement_id,target_requirement_id,relationship_type) VALUES('rel-3','requirement-1','requirement-2','DEPENDS_ON')");
  assert.throws(() => database.exec("INSERT INTO requirement_relationships(id,source_requirement_id,target_requirement_id,relationship_type) VALUES('rel-4','requirement-1','requirement-2','DEPENDS_ON')"), /UNIQUE/);
  assert.throws(() => database.exec("INSERT INTO requirement_backlog_links(id,requirement_id,backlog_item_id,link_type,coverage_percentage) VALUES('link-1','requirement-1','backlog-1','IMPLEMENTS',50)"), /CHECK/);
  assert.throws(() => database.exec("INSERT INTO requirement_backlog_links(id,requirement_id,backlog_item_id,link_type,rationale) VALUES('link-2','requirement-1','backlog-1','PARTIALLY_IMPLEMENTS','Half done')"), /CHECK/);
  database.exec("INSERT INTO requirement_backlog_links(id,requirement_id,backlog_item_id,link_type,coverage_percentage,rationale) VALUES('link-3','requirement-1','backlog-1','PARTIALLY_IMPLEMENTS',60,'Half done')");
  database.close();
});

test("requirement contract validates relationship and backlog-link input with bounded fields", async () => {
  const source = await read("app/governance/requirement-contract.ts");
  for (const control of [
    "validateRequirementRelationshipInput", "validateRequirementBacklogLinkInput",
    "Select a target Requirement", "Select a Backlog item", "coverage percentage between 1 and 99", "Explain the partial coverage",
  ]) assert.match(source, new RegExp(control.replace(/[.+]/g, "\\$&")));
});

test("delivery status derivation prioritizes stale Azure evidence and distinguishes partial from implemented", async () => {
  const source = await read("app/governance/stage3-contract.ts");
  assert.match(source, /export function deriveRequirementDeliveryStatus/);
  assert.match(source, /return "NOT_LINKED"/);
  assert.match(source, /return "SOURCE_UNAVAILABLE"/);
  assert.match(source, /return "IMPLEMENTED"/);
  assert.match(source, /return "PARTIAL"/);
});

test("requirement traceability repository enforces same-Product scope, rationale and cycle prevention", async () => {
  const source = await read("db/requirement-traceability.ts");
  for (const operation of ["getRequirementTraceability", "addRequirementRelationship", "removeRequirementRelationship", "addRequirementBacklogLink", "removeRequirementBacklogLink"]) assert.match(source, new RegExp(operation));
  assert.match(source, /source\.productId !== target\.productId/);
  assert.match(source, /rationale_required/);
  assert.match(source, /WITH RECURSIVE reachable/);
  assert.match(source, /cycleCheckedTypes/);
});

test("requirement traceability APIs enforce atomic permissions, validation and stable errors", async () => {
  const paths = [
    "app/api/v3/requirements/[id]/relationships/route.ts",
    "app/api/v3/requirements/[id]/relationships/[relationshipId]/route.ts",
    "app/api/v3/requirements/[id]/backlog-links/route.ts",
    "app/api/v3/requirements/[id]/backlog-links/[linkId]/route.ts",
    "app/api/v3/requirements/[id]/traceability/route.ts",
  ];
  const sources = await Promise.all(paths.map(read));
  const joined = sources.join("\n");
  for (const permission of ["requirement.link", "traceability.manage", "traceability.view"]) assert.match(joined, new RegExp(`authorizeApi\\("${permission.replace(".", "\\.")}"\\)`));
  for (const error of ["VALIDATION_FAILED", "RELATIONSHIP_CYCLE", "DUPLICATE_RELATIONSHIP", "RATIONALE_REQUIRED", "DUPLICATE_BACKLOG_LINK", "REQUIREMENT_NOT_FOUND"]) assert.match(joined, new RegExp(error));
  assert.match(joined, /apiHeaders\(context\.correlationId\)/);
});

test("Requirements navigation is exposed while traceability and later Stage 3 modules stay absent", async () => {
  const shell = await read("app/command-center-shell.tsx");
  assert.match(shell, /label: "Requirements"/);
  for (const deferred of ["Traceability", "Sign-offs", "RACI", "Feasibility"]) assert.doesNotMatch(shell, new RegExp(`label: "${deferred}"`));
});
