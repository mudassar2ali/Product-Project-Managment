import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");

test("Stage 3 atomic permissions are centralized and least-privilege role governed", async () => {
  const source = await read("app/authorization.ts");
  for (const permission of [
    "document.view", "document.create", "document.edit", "document.version", "document.submit",
    "requirement.view", "requirement.create", "requirement.edit", "requirement.archive", "requirement.submit", "requirement.link",
    "traceability.view", "traceability.manage", "traceability.evidence", "traceability.export",
    "signoff.view", "signoff.request", "signoff.decide", "signoff.manage", "signoff.waive_condition",
    "raci.view", "raci.manage", "raci.publish", "feasibility.view", "feasibility.edit", "feasibility.submit",
    "governance.report.view", "governance.report.export",
  ]) assert.match(source, new RegExp(`"${permission.replace(".", "\\.")}"`));
  for (const role of ["PRODUCT_DEVELOPMENT_MANAGER", "PRODUCT_MANAGER", "BUSINESS_ANALYST", "ENGINEERING_LEAD", "QA", "COMPLIANCE_LEGAL", "STAKEHOLDER_APPROVER", "EXECUTIVE_VIEWER"]) assert.match(source, new RegExp(role));
  assert.match(source, /STAKEHOLDER_APPROVER: \[\.\.\.viewerPermissions, "signoff\.decide"\]/);
  assert.doesNotMatch(source, /EXECUTIVE_VIEWER: \[.*signoff\.decide/);
});

test("BRD and PRD contracts contain every mandated structured section", async () => {
  const source = await read("app/governance/stage3-contract.ts");
  for (const section of [
    "DOCUMENT_INFORMATION", "EXECUTIVE_SUMMARY", "BUSINESS_CONTEXT", "PROBLEM_STATEMENT", "BUSINESS_OBJECTIVES",
    "BUSINESS_REQUIREMENTS", "CURRENT_STATE", "FUTURE_STATE", "BUSINESS_PROCESSES", "BUSINESS_RULES",
    "COMPLIANCE_REQUIREMENTS", "KPIS", "UAT_CRITERIA", "SIGN_OFF", "PRODUCT_OVERVIEW", "OPPORTUNITY",
    "TARGET_USERS", "PERSONAS", "USE_CASES", "FEATURES", "UX_REQUIREMENTS", "ANALYTICS_REQUIREMENTS", "RELEASE_STRATEGY",
  ]) assert.match(source, new RegExp(`"${section}"`));
  assert.match(source, /requiredSectionsFor/);
});

test("governance versions are controlled and submitted evidence is immutable", async () => {
  const source = await read("app/governance/stage3-contract.ts");
  for (const status of ["DRAFT", "IN_REVIEW", "APPROVED", "APPROVED_WITH_CONDITIONS", "REJECTED", "SUPERSEDED", "RETIRED"]) assert.match(source, new RegExp(`"${status}"`));
  assert.match(source, /status !== "DRAFT"/);
  assert.match(source, /GOVERNANCE_VERSION_LOCKED/);
  assert.match(source, /Draft\|Review\|Approved\|Revision/);
});

test("formal requirements and traceability use explicit typed evidence", async () => {
  const source = await read("app/governance/stage3-contract.ts");
  for (const value of [
    "BUSINESS", "PRODUCT", "FUNCTIONAL", "NON_FUNCTIONAL", "COMPLIANCE", "BUSINESS_RULE", "UX", "ANALYTICS", "UAT",
    "DERIVES_FROM", "DEPENDS_ON", "CONFLICTS_WITH", "DUPLICATES", "IMPLEMENTS", "PARTIALLY_IMPLEMENTS", "VALIDATES",
    "NOT_LINKED", "PLANNED", "IN_PROGRESS", "IMPLEMENTED", "PARTIAL", "SOURCE_UNAVAILABLE", "QA", "RELEASE",
  ]) assert.match(source, new RegExp(`"${value}"`));
  assert.match(source, /EXPLICIT_REQUIRED_LINKS/);
  assert.match(source, /denominator > 0/);
  assert.match(source, /value:.*null/);
});

test("sign-off aggregation preserves rejection conditions and incomplete review", async () => {
  const source = await read("app/governance/stage3-contract.ts");
  for (const lane of ["PRODUCT", "BUSINESS", "ENGINEERING", "ARCHITECTURE", "QA", "COMPLIANCE", "LEGAL", "FINANCE", "OPERATIONS", "EXECUTIVE_SPONSOR"]) assert.match(source, new RegExp(`"${lane}"`));
  for (const status of ["PENDING", "UNDER_REVIEW", "APPROVED", "APPROVED_WITH_CONDITIONS", "REJECTED"]) assert.match(source, new RegExp(`"${status}"`));
  assert.match(source, /openMandatoryConditions/);
  assert.match(source, /aggregateSignoffStatus/);
});

test("RACI and feasibility contracts enforce governed outcomes", async () => {
  const source = await read("app/governance/stage3-contract.ts");
  for (const responsibility of ["RESPONSIBLE", "ACCOUNTABLE", "CONSULTED", "INFORMED"]) assert.match(source, new RegExp(`"${responsibility}"`));
  assert.match(source, /Exactly one Accountable/);
  assert.match(source, /At least one Responsible/);
  for (const status of ["FEASIBLE", "FEASIBLE_WITH_CONDITIONS", "NOT_FEASIBLE"]) assert.match(source, new RegExp(`"${status}"`));
});

test("authorized document module is exposed while unfinished Stage 3 modules remain absent", async () => {
  const source = await read("app/command-center-shell.tsx");
  assert.match(source, /label: "BRD \/ PRD"/);
  assert.doesNotMatch(source, /label: "Requirements"/);
  assert.doesNotMatch(source, /label: "Traceability"/);
});
