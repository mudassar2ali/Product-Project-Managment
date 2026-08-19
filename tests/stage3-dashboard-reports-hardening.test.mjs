import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const root = new URL("../", import.meta.url);
const read = (path) => readFile(new URL(path, root), "utf8");

test("db/reports.ts defines all eight Stage 3 governance reports with persisted or computed evidence", async () => {
  const source = await read("db/reports.ts");
  for (const key of [
    "governance-portfolio", "requirement-register", "requirement-traceability-coverage", "requirement-integrity",
    "signoff-approval-aging", "signoff-condition-tracking", "raci-completeness", "feasibility-status",
  ]) assert.match(source, new RegExp(`"${key}":`));
  for (const title of [
    "BRD/PRD Portfolio Status and Version Report", "Requirement Register by Type, Priority, Owner and Governance Status",
    "Requirement-to-Delivery Traceability Coverage and Gap Report", "Unlinked, Stale, Source-missing and Conflicting Requirement Report",
    "Approval Aging and Overdue Lane Report", "Approved-with-Conditions and Overdue-Condition Report",
    "RACI Completeness and Accountability-Gap Report", "Technical-Feasibility Status, Risk and Outstanding-Condition Report",
  ]) assert.match(source, new RegExp(title.replace(/[.]/g, "\\$&")));
  assert.doesNotMatch(source, /sample|mock/i);
});

test("report catalog supports a computeRows escape hatch for reports that reuse governed delivery-status logic", async () => {
  const source = await read("db/reports.ts");
  assert.match(source, /computeRows\?:\s*\(\)\s*=>\s*Promise<ReportRow\[\]>/);
  assert.match(source, /loadRequirementDeliveryRows/);
  assert.match(source, /deriveRequirementDeliveryStatus/);
  assert.match(source, /deriveEvidenceFreshness/);
  assert.match(source, /definition\.computeRows \? await definition\.computeRows\(\)/);
});

test("requirement-integrity report flags unlinked, source-missing, conflicting and stale requirements", async () => {
  const source = await read("db/reports.ts");
  assert.match(source, /attention\.push\("Unlinked"\)/);
  assert.match(source, /attention\.push\("Source missing"\)/);
  assert.match(source, /attention\.push\("Conflicting delivery signals"\)/);
  assert.match(source, /attention\.push\("Stale evidence"\)/);
});

test("report UI exposes a Stage 3 governance report group alongside the existing catalog", async () => {
  const source = await read("app/reports/report-center.tsx");
  assert.match(source, /const governanceReports = \[/);
  assert.match(source, /STAGE 3 GOVERNANCE/);
  assert.match(source, /governanceReports\.map/);
});

test("rate limit policies cover document submission, decision recording and high-cost traceability queries", async () => {
  const source = await read("db/operations.ts");
  for (const key of ["GOVERNANCE_SUBMIT", "SIGNOFF_DECISION", "TRACEABILITY_QUERY"]) assert.match(source, new RegExp(`${key}:\\s*\\{ limit:`));
});

test("document version, requirement and feasibility submit routes are rate limited and record operational events", async () => {
  const paths = [
    "app/api/v3/document-versions/[id]/submit/route.ts",
    "app/api/v3/requirements/[id]/submit/route.ts",
    "app/api/v3/feasibility/[id]/submit/route.ts",
  ];
  for (const path of paths) {
    const source = await read(path);
    assert.match(source, /consumeRateLimit\("GOVERNANCE_SUBMIT"/);
    assert.match(source, /OPERATION_RATE_LIMITED/);
    assert.match(source, /recordOperationalEvent/);
  }
});

test("sign-off decision recording is rate limited independently of governance submission", async () => {
  const source = await read("app/api/v3/signoff-lanes/[id]/decisions/route.ts");
  assert.match(source, /consumeRateLimit\("SIGNOFF_DECISION"/);
  assert.match(source, /OPERATION_RATE_LIMITED/);
  assert.match(source, /recordOperationalEvent/);
});

test("portfolio traceability query is rate limited as a high-cost graph query", async () => {
  const source = await read("app/api/v3/traceability/route.ts");
  assert.match(source, /consumeRateLimit\("TRACEABILITY_QUERY"/);
  assert.match(source, /OPERATION_RATE_LIMITED/);
  assert.match(source, /recordOperationalEvent/);
});

test("audit trail exposes Stage 3 governance entity types and actions for filtering", async () => {
  const [route, center] = await Promise.all([read("app/api/v1/audit/route.ts"), read("app/audit/audit-center.tsx")]);
  for (const entity of [
    "GovernanceDocument", "GovernanceDocumentVersion", "Requirement", "RequirementRevision",
    "SignoffRequest", "SignoffLane", "SignoffCondition", "RaciMatrix", "TechnicalFeasibilityAssessment", "TechnicalFeasibilityRevision",
  ]) {
    assert.match(route, new RegExp(`"${entity}"`));
    assert.match(center, new RegExp(`"${entity}"`));
  }
  for (const action of ["SUBMIT_REVIEW", "RELATIONSHIP_ADD", "BACKLOG_LINK_ADD", "DECISION", "STATUS_TRANSITION", "CONDITION_WAIVE", "PUBLISH"]) {
    assert.match(center, new RegExp(`"${action}"`));
  }
});

test("db/governance-overview.ts composes a permission-gated governance summary for the Project Overview", async () => {
  const source = await read("db/governance-overview.ts");
  assert.match(source, /export type GovernanceOverviewAccess = \{ documents: boolean; requirements: boolean; signoffs: boolean; raci: boolean; feasibility: boolean \}/);
  assert.match(source, /export async function getProjectGovernanceSummary/);
  assert.match(source, /getPortfolioTraceability/);
  for (const key of ["documents", "requirements", "signoffs", "raci", "feasibility"]) assert.match(source, new RegExp(`${key}:`));
});

test("Project Overview API gates governance evidence behind the caller's own permissions", async () => {
  const source = await read("app/api/v1/projects/[id]/overview/route.ts");
  assert.match(source, /documents: context\.principal\.permissions\.includes\("document\.view"\)/);
  assert.match(source, /requirements: context\.principal\.permissions\.includes\("requirement\.view"\)/);
  assert.match(source, /signoffs: context\.principal\.permissions\.includes\("signoff\.view"\)/);
  assert.match(source, /raci: context\.principal\.permissions\.includes\("raci\.view"\)/);
  assert.match(source, /feasibility: context\.principal\.permissions\.includes\("feasibility\.view"\)/);
});

test("Project Overview UI renders a Stage 3 governance evidence section with per-area unavailable states", async () => {
  const source = await read("app/projects/project-overview.tsx");
  assert.match(source, /function GovernanceEvidence/);
  assert.match(source, /STAGE 3 GOVERNANCE/);
  assert.match(source, /governance\.documents\.available/);
  assert.match(source, /governance\.requirements\.available/);
  assert.match(source, /governance\.signoffs\.available/);
  assert.match(source, /governance\.raci\.available/);
  assert.match(source, /governance\.feasibility\.available/);
  assert.match(source, /<GovernanceEvidence governance=\{overview\.governance\} \/>/);
});

test("db/projects.ts wires the governance summary into getProjectOverview alongside delivery insights", async () => {
  const source = await read("db/projects.ts");
  assert.match(source, /getProjectGovernanceSummary\(id, governanceAccess\)/);
  assert.match(source, /governance,/);
});
