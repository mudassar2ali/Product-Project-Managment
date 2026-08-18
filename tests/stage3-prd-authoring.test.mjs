import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import { DatabaseSync } from "node:sqlite";
import test from "node:test";

const root = new URL("../", import.meta.url);
const read = (path) => readFile(new URL(path, root), "utf8");
const prdKeys = [
  "PRODUCT_OVERVIEW", "PROBLEM", "OPPORTUNITY", "TARGET_USERS", "PERSONAS", "USE_CASES", "OBJECTIVES",
  "SUCCESS_METRICS", "FEATURES", "FUNCTIONAL_REQUIREMENTS", "NON_FUNCTIONAL_REQUIREMENTS", "USER_STORIES",
  "ACCEPTANCE_CRITERIA", "UX_REQUIREMENTS", "ANALYTICS_REQUIREMENTS", "DEPENDENCIES", "RISKS", "RELEASE_STRATEGY", "OUT_OF_SCOPE",
];

async function migratedDatabase() {
  const database = new DatabaseSync(":memory:");
  database.exec("PRAGMA foreign_keys=ON");
  const files = (await readdir(new URL("drizzle/", root))).filter((name) => name.endsWith(".sql")).sort();
  for (const file of files) {
    const source = await read(`drizzle/${file}`);
    for (const statement of source.split("--> statement-breakpoint").map((value) => value.trim()).filter(Boolean)) database.exec(statement);
  }
  return database;
}

test("PRD contract supplies exactly 19 ordered server-controlled sections", async () => {
  const source = await read("app/governance/brd-contract.ts");
  const block = source.match(/prdSectionTemplates[^=]*= \[([\s\S]*?)\n\];/)?.[1] ?? "";
  const templates = block.match(/\{ key: "[A-Z_]+", heading: "[^"]+", required: true \}/g) ?? [];
  assert.equal(templates.length, 19);
  for (const key of prdKeys) assert.match(block, new RegExp(`key: "${key}"`));
  assert.match(source, /documentSectionTemplates[\s\S]*BRD: brdSectionTemplates,[\s\S]*PRD: prdSectionTemplates/);
  assert.match(source, /allowedKeys = documentType === "BRD" \? brdSectionKeys : prdSectionKeys/);
  assert.match(source, /Section is not allowed for a \$\{documentType\}/);
});

test("generic document repository isolates BRD and PRD identity templates and persistence", async () => {
  const source = await read("db/governance-documents.ts");
  for (const operation of ["listGovernanceDocuments", "getGovernanceWorkspace", "createGovernanceDocument", "updateGovernanceMetadata", "replaceGovernanceSections", "submitGovernanceVersion", "createGovernanceRevision"]) assert.match(source, new RegExp(`function ${operation}`));
  assert.match(source, /nextBusinessId\(documentType/);
  assert.match(source, /return `\$\{documentType\}-\$\{String/);
  assert.match(source, /const templates = documentSectionTemplates\[documentType\]/);
  assert.match(source, /Initial \$\{documentType\} draft/);
  assert.match(source, /documentType: "PRD"/);
  assert.match(source, /createGovernanceDocument\("PRD"/);
  assert.match(source, /new Set\(keys\)\.size !== templates\.length/);
  assert.match(source, /expectedKeys\.has\(key\)/);
  assert.match(source, /results\.at\(-1\)\?\.meta\.changes/);
});

test("Stage 3 document APIs validate type and derive section policy from persisted evidence", async () => {
  const [collection, detail, versions, sections, submit] = await Promise.all([
    read("app/api/v3/documents/route.ts"), read("app/api/v3/documents/[id]/route.ts"),
    read("app/api/v3/documents/[id]/versions/route.ts"), read("app/api/v3/document-versions/[id]/sections/route.ts"),
    read("app/api/v3/document-versions/[id]/submit/route.ts"),
  ]);
  assert.match(collection, /searchParams\.get\("documentType"\)/);
  assert.match(collection, /Only BRD or PRD is supported/);
  assert.match(collection, /createGovernanceDocument\(documentType/);
  assert.match(sections, /getGovernanceVersionSections\(id\)/);
  assert.match(sections, /validateGovernanceSections\(body, persisted\.version\.documentType\)/);
  assert.match(sections, /invalid_sections/);
  for (const source of [collection, detail, versions, sections, submit]) assert.match(source, /authorizeApi\("document\.(?:view|create|edit|version|submit)"\)/);
  assert.match([collection, detail, versions, sections, submit].join("\n"), /DOCUMENT_INCOMPLETE/);
});

test("accepted schema persists a complete PRD and locks submitted section evidence", async () => {
  const database = await migratedDatabase();
  database.exec("INSERT INTO users(id,external_user_id,email,display_name) VALUES('user-prd','external-prd','prd@example.test','PRD Owner')");
  database.exec("INSERT INTO products(id,business_id,name,code) VALUES('product-prd','PROD-PRD','PRD Product','PRD')");
  database.exec("INSERT INTO governance_documents(id,business_id,document_type,product_id,title,owner_user_id) VALUES('document-prd','PRD-0001','PRD','product-prd','Product launch PRD','user-prd')");
  database.exec("INSERT INTO governance_document_versions(id,document_id,version_label,major_version,minor_version,lifecycle_status,change_summary) VALUES('version-prd','document-prd','Draft 0.1',0,1,'DRAFT','Initial PRD draft')");
  const insert = database.prepare("INSERT INTO governance_document_sections(id,document_version_id,section_key,heading,sequence,content_text,completion_status) VALUES(?,'version-prd',?,?,?,?,'COMPLETE')");
  prdKeys.forEach((key, index) => insert.run(`section-prd-${index + 1}`, key, key.replaceAll("_", " "), index + 1, `Governed ${key.toLowerCase()} evidence`));
  assert.equal(database.prepare("SELECT COUNT(*) count FROM governance_document_sections WHERE document_version_id='version-prd'").get().count, 19);
  database.exec("UPDATE governance_document_versions SET version_label='Review 0.9',major_version=0,minor_version=9,lifecycle_status='IN_REVIEW',content_hash=lower(hex(randomblob(32))),submitted_at='2026-08-15T00:00:00Z',locked_at='2026-08-15T00:00:00Z' WHERE id='version-prd'");
  assert.throws(() => database.exec("UPDATE governance_document_sections SET content_text='tampered' WHERE id='section-prd-1'"), /GOVERNANCE_VERSION_LOCKED/);
  assert.deepEqual(database.prepare("PRAGMA foreign_key_check").all(), []);
  database.close();
});

test("combined document workspace exposes separate honest BRD and PRD authoring paths", async () => {
  const [shell, center, css] = await Promise.all([read("app/command-center-shell.tsx"), read("app/governance/brd-center.tsx"), read("app/globals.css")]);
  assert.match(shell, /label: "BRD \/ PRD"/);
  assert.match(shell, /Stage 3 · Step 4/);
  for (const evidence of ["Business Requirements Documents", "Product Requirements Documents", "role=\"tablist\"", "aria-selected=", "selectType\\(\"BRD\"\\)", "selectType\\(\"PRD\"\\)", "documentType: activeType", "Product Requirements Document"]) assert.match(center, new RegExp(evidence));
  assert.match(center, /documentSectionTemplates\[documentType\]\[0\]\.key/);
  assert.match(center, /workspace\.document\.documentType/);
  assert.match(css, /\.document-type-tabs/);
  assert.match(css, /@media \(max-width: 620px\)/);
  assert.doesNotMatch(center, /Math\.random|sample data|lorem ipsum|mock API/i);
});

test("PRD review hashing audit and revision rules remain immutable and body-free", async () => {
  const source = await read("db/governance-documents.ts");
  for (const evidence of ["SHA-256", "contentHash", "locked_at=CURRENT_TIMESTAMP", "SUBMIT_REVIEW", "CREATE_REVISION", "APPROVED_WITH_CONDITIONS", "REJECTED"]) assert.match(source, new RegExp(evidence));
  assert.match(source, /rows\.results\.length !== templates\.length/);
  assert.match(source, /documentType: version\.documentType/);
  assert.doesNotMatch(source.match(/"SECTIONS_REPLACE"[\s\S]*?correlationId/)?.[0] ?? "", /JSON\.stringify\(sections\)|contentText\s*:/);
  assert.doesNotMatch(source.match(/"SUBMIT_REVIEW"[\s\S]*?correlationId/)?.[0] ?? "", /contentText\s*:/);
});

test("Step 4 record is complete and later Stage 3 modules remain unexposed", async () => {
  const [shell, record, hosting] = await Promise.all([read("app/command-center-shell.tsx"), read("outputs/STAGE-3-IMPLEMENTATION-RECORD.md"), read(".openai/hosting.json")]);
  assert.match(record, /## Step 4 — PRD Structured Authoring and Version Workflow/);
  assert.match(record, /all 19 mandated PRD sections/);
  for (const deferred of ["Requirements", "Traceability", "Sign-offs", "RACI", "Feasibility"]) assert.doesNotMatch(shell, new RegExp(`label: "${deferred}"`));
  assert.match(hosting, /"d1": "DB"/);
  assert.match(hosting, /"r2": null/);
});
