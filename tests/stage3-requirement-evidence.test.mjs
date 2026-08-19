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
  database.exec("INSERT INTO requirements(id,business_id,requirement_type,product_id) VALUES('requirement-1','REQ-0001','FUNCTIONAL','product-1')");
}

test("Step 7 schema defines requirement_evidence_references with controlled evidence fields", async () => {
  const schema = await read("db/schema.ts");
  for (const value of [
    "requirementEvidenceReferences", "uq_requirement_evidence_reference",
    "idx_requirement_evidence_requirement_type", "idx_requirement_evidence_observed",
  ]) assert.match(schema, new RegExp(value));
  for (const constraint of [
    "ck_requirement_evidence_type", "ck_requirement_evidence_status",
    "ck_requirement_evidence_fields", "ck_requirement_evidence_url", "ck_requirement_evidence_observed_consistency",
  ]) assert.match(schema, new RegExp(constraint));
});

test("generated Step 7 migration creates the evidence table with a unique reference index", async () => {
  const names = (await readdir(new URL("drizzle/", root))).filter((name) => name.startsWith("0021_") && name.endsWith(".sql"));
  assert.equal(names.length, 1);
  const migration = await read(`drizzle/${names[0]}`);
  for (const value of [
    "CREATE TABLE `requirement_evidence_references`",
    "FOREIGN KEY (`requirement_id`)",
    "uq_requirement_evidence_reference",
  ]) assert.match(migration, new RegExp(value.replace(/[()]/g, "\\$&")));
});

test("all 22 migrations replay with evidence integrity", async () => {
  const { database, files } = await migratedDatabase();
  assert.equal(files.filter((name) => Number(name.slice(0, 4)) <= 21).length, 22);
  assert.ok(database.prepare("SELECT COUNT(*) count FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'").get().count >= 40);
  assert.deepEqual(database.prepare("PRAGMA foreign_key_check").all(), []);
  database.close();
});

test("database constraints reject unknown evidence status, bad URLs and inconsistent observed dates", async () => {
  const { database } = await migratedDatabase();
  seedGraph(database);
  assert.throws(() => database.exec("INSERT INTO requirement_evidence_references(id,requirement_id,evidence_type,source_system,external_reference,evidence_status) VALUES('ev-1','requirement-1','LOAD_TEST','Jira','QA-1','PENDING')"), /CHECK/);
  assert.throws(() => database.exec("INSERT INTO requirement_evidence_references(id,requirement_id,evidence_type,source_system,external_reference,evidence_status) VALUES('ev-2','requirement-1','QA','Jira','QA-1','UNKNOWN')"), /CHECK/);
  assert.throws(() => database.exec("INSERT INTO requirement_evidence_references(id,requirement_id,evidence_type,source_system,external_reference,source_url,evidence_status) VALUES('ev-3','requirement-1','QA','Jira','QA-1','ftp://example.test/1','PENDING')"), /CHECK/);
  assert.throws(() => database.exec("INSERT INTO requirement_evidence_references(id,requirement_id,evidence_type,source_system,external_reference,evidence_status,observed_at) VALUES('ev-4','requirement-1','QA','Jira','QA-1','PENDING','2026-01-01T00:00:00.000Z')"), /CHECK/);
  assert.throws(() => database.exec("INSERT INTO requirement_evidence_references(id,requirement_id,evidence_type,source_system,external_reference,evidence_status) VALUES('ev-5','requirement-1','QA','Jira','QA-1','PASSED')"), /CHECK/);
  database.exec("INSERT INTO requirement_evidence_references(id,requirement_id,evidence_type,source_system,external_reference,evidence_status,observed_at) VALUES('ev-6','requirement-1','QA','Jira','QA-1','PASSED','2026-01-01T00:00:00.000Z')");
  assert.throws(() => database.exec("INSERT INTO requirement_evidence_references(id,requirement_id,evidence_type,source_system,external_reference,evidence_status,observed_at) VALUES('ev-7','requirement-1','QA','Jira','QA-1','FAILED','2026-02-01T00:00:00.000Z')"), /UNIQUE/);
  database.close();
});

test("requirement contract validates evidence input with bounded fields and status-conditional observed date", async () => {
  const source = await read("app/governance/requirement-contract.ts");
  for (const control of [
    "validateRequirementEvidenceInput", "Select a valid evidence type", "Select a valid evidence status",
    "Provide a valid http\\(s\\) URL", "Provide the date this evidence was observed",
    "Only Passed, Failed, Conditional or Stale evidence records an observed date",
  ]) assert.match(source, new RegExp(control));
});

test("evidence freshness derivation distinguishes not-applicable, fresh, aging and stale states", async () => {
  const source = await read("app/governance/stage3-contract.ts");
  assert.match(source, /export function deriveEvidenceFreshness/);
  assert.match(source, /return "NOT_APPLICABLE"/);
  assert.match(source, /return "FRESH"/);
  assert.match(source, /return "AGING"/);
  assert.match(source, /return "STALE"/);
});

test("requirement traceability repository adds evidence with duplicate detection and surfaces freshness", async () => {
  const source = await read("db/requirement-traceability.ts");
  assert.match(source, /export async function addRequirementEvidence/);
  assert.match(source, /duplicate/);
  assert.match(source, /deriveEvidenceFreshness/);
  assert.match(source, /evidence: evidenceWithFreshness/);
});

test("portfolio coverage repository aggregates delivery status, gaps and coverage evidence", async () => {
  const source = await read("db/requirement-coverage.ts");
  assert.match(source, /export async function getPortfolioTraceability/);
  assert.match(source, /deriveRequirementDeliveryStatus/);
  assert.match(source, /requirementCoverageEvidence/);
  assert.match(source, /NOT_LINKED.*SOURCE_UNAVAILABLE|SOURCE_UNAVAILABLE.*NOT_LINKED/s);
});

test("evidence and portfolio traceability APIs enforce permissions and stable error codes", async () => {
  const paths = ["app/api/v3/requirements/[id]/evidence/route.ts", "app/api/v3/traceability/route.ts"];
  const sources = await Promise.all(paths.map(read));
  const joined = sources.join("\n");
  assert.match(joined, /authorizeApi\("traceability\.evidence"\)/);
  assert.match(joined, /authorizeApi\("traceability\.view"\)/);
  for (const error of ["VALIDATION_FAILED", "DUPLICATE_EVIDENCE_REFERENCE", "REQUIREMENT_NOT_FOUND"]) assert.match(joined, new RegExp(error));
  assert.match(joined, /apiHeaders\(context\.correlationId\)/);
});

test("Requirements navigation is exposed while traceability and later Stage 3 modules stay absent", async () => {
  const shell = await read("app/command-center-shell.tsx");
  assert.match(shell, /label: "Requirements"/);
  for (const deferred of ["Traceability", "Sign-offs", "RACI", "Feasibility"]) assert.doesNotMatch(shell, new RegExp(`label: "${deferred}"`));
});
