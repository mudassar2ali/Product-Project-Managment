import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");

test("BRD contract supplies all 25 server-controlled sections and bounded validation", async () => {
  const source = await read("app/governance/brd-contract.ts");
  const templates = source.match(/\{ key: "[A-Z_]+", heading: "[^"]+", required: true \}/g) ?? [];
  assert.equal(templates.length, 25);
  for (const key of ["DOCUMENT_INFORMATION", "BUSINESS_REQUIREMENTS", "SCOPE", "FUNCTIONAL_REQUIREMENTS", "NON_FUNCTIONAL_REQUIREMENTS", "SUCCESS_METRICS", "UAT_CRITERIA", "SIGN_OFF"]) assert.match(source, new RegExp(`key: "${key}"`));
  for (const control of ["Every BRD section must be supplied exactly once", "Section is duplicated", "20_000", "250_000", "incompleteRequiredSections"]) assert.match(source, new RegExp(control));
  assert.match(source, /heading: template\.heading/);
  assert.match(source, /sequence: index \+ 1/);
});

test("BRD repository persists governed identity, optimistic drafts and bounded audit evidence", async () => {
  const source = await read("db/governance-documents.ts");
  for (const operation of ["listBrdDocuments", "getBrdWorkspace", "createBrd", "updateBrdMetadata", "replaceBrdSections", "createBrdRevision"]) assert.match(source, new RegExp(`function ${operation}`));
  assert.match(source, /document_type='BRD'/);
  assert.match(source, /VALUES\(\?,\?,'BRD'/);
  assert.match(source, /VALUES\(\?,\?,'Draft 0\.1'/);
  assert.match(source, /version=version\+1/);
  assert.match(source, /WHERE id=\? AND version=\? AND lifecycle_status='DRAFT'/);
  assert.match(source, /results\.at\(-1\)\?\.meta\.changes/);
  assert.match(source, /ON CONFLICT\(document_version_id,section_key\) DO UPDATE/);
  assert.match(source, /SECTIONS_REPLACE/);
  assert.match(source, /sectionCount: sections\.length/);
  assert.match(source, /contentCharacters:/);
  assert.doesNotMatch(source.match(/"SECTIONS_REPLACE"[\s\S]*?correlationId/)?.[0] ?? "", /JSON\.stringify\(sections\)|contentText\s*:/);
});

test("BRD submission requires complete content and creates immutable SHA-256 evidence", async () => {
  const source = await read("db/governance-documents.ts");
  for (const control of ["submitBrdVersion", "SHA-256", "contentHash", "Review 0.9", "lifecycle_status='IN_REVIEW'", "locked_at=CURRENT_TIMESTAMP", "SUBMIT_REVIEW"]) assert.match(source, new RegExp(control.replace(/[.+]/g, "\\$&")));
  assert.match(source, /rows\.results\.length !== brdSectionTemplates\.length \|\| incomplete\.length/);
  assert.match(source, /completionStatus !== "COMPLETE"/);
  assert.match(source, /if \(!results\[1\]\?\.meta\.changes\) return \{ kind: "conflict"/);
  assert.match(source, /\["APPROVED", "APPROVED_WITH_CONDITIONS", "REJECTED"\]/);
});

test("BRD APIs enforce atomic permissions, validation, stable errors and no-store responses", async () => {
  const paths = [
    "app/api/v3/documents/route.ts",
    "app/api/v3/documents/[id]/route.ts",
    "app/api/v3/documents/[id]/versions/route.ts",
    "app/api/v3/document-versions/[id]/sections/route.ts",
    "app/api/v3/document-versions/[id]/submit/route.ts",
  ];
  const sources = await Promise.all(paths.map(read));
  const joined = sources.join("\n");
  for (const permission of ["document.view", "document.create", "document.edit", "document.version", "document.submit"]) assert.match(joined, new RegExp(`authorizeApi\\("${permission.replace(".", "\\.")}"\\)`));
  for (const error of ["VALIDATION_FAILED", "VERSION_REQUIRED", "GOVERNANCE_VERSION_LOCKED", "VERSION_CONFLICT", "BRD_INCOMPLETE", "BRD_NOT_FOUND"]) assert.match(joined, new RegExp(error));
  assert.match(sources[0], /validateBrdDocumentInput/);
  assert.match(sources[3], /validateBrdSections/);
  assert.match(joined, /apiHeaders\(context\.correlationId\)/);
  assert.match(await read("app/api/v1/api-helpers.ts"), /"cache-control": "no-store"/i);
});

test("BRD authoring UI exposes honest library, draft, lock, conflict and history states", async () => {
  const [shell, center] = await Promise.all([read("app/command-center-shell.tsx"), read("app/governance/brd-center.tsx")]);
  assert.match(shell, /label: "BRD"/);
  for (const evidence of ["No BRDs found", "Create Business Requirements Document", "Loading BRDs", "BRD draft saved", "Submit for review", "Immutable review evidence", "Version history", "Create revision"]) assert.match(center, new RegExp(evidence));
  assert.match(center, /if \(!response\.ok \|\| !body\.data\).*body\.error\?\.message/);
  assert.match(center, /window\.confirm/);
  assert.match(center, /completed !== workspace\.sections\.length/);
  assert.match(center, /canCreate/);
  assert.match(center, /canEdit/);
  assert.match(center, /canVersion/);
  assert.match(center, /canSubmit/);
  assert.doesNotMatch(center, /Math\.random|sample data|lorem ipsum|mock API/i);
});

test("BRD authoring remains accessible and responsive without color-only section meaning", async () => {
  const [center, css] = await Promise.all([read("app/governance/brd-center.tsx"), read("app/globals.css")]);
  for (const evidence of ["aria-labelledby=\"brd-title\"", "aria-label=\"BRD sections\"", "aria-current=", "role=\"status\"", "role=\"alert\"", "aria-modal=\"true\""]) assert.match(center, new RegExp(evidence));
  assert.match(center, /event\.key === "Escape"/);
  assert.match(center, /section\.completionStatus === "COMPLETE" \? "✓"/);
  assert.match(css, /\.brd-authoring-grid/);
  assert.match(css, /@media \(max-width: 900px\)/);
  assert.match(css, /@media \(max-width: 620px\)/);
  assert.match(css, /\.section-state\.state-complete/);
});

test("BRD Step 3 exposure does not reveal PRD or later governance modules", async () => {
  const [shell, center, record] = await Promise.all([read("app/command-center-shell.tsx"), read("app/governance/brd-center.tsx"), read("outputs/STAGE-3-IMPLEMENTATION-RECORD.md")]);
  for (const deferred of ["PRD", "Requirements", "Traceability", "Sign-offs", "RACI", "Feasibility"]) assert.doesNotMatch(shell, new RegExp(`label: "${deferred}"`));
  assert.doesNotMatch(center, /Product Requirements Document|PRD authoring/);
  assert.match(record, /## Step 3 — BRD Structured Authoring and Version Workflow/);
  assert.match(record, /No PRD label or placeholder is exposed/);
});
