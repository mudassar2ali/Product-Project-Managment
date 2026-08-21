import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const root = new URL("../", import.meta.url);
const read = (path) => readFile(new URL(path, root), "utf8");

test("db/stage4-insights.ts computes a portfolio-wide, access-gated Release/UAT/defect/sign-off summary with a capped attention list", async () => {
  const source = await read("db/stage4-insights.ts");
  assert.match(source, /export type Stage4InsightAccess = \{\s*releases: boolean;\s*uat: boolean;\s*defects: boolean;\s*signoffs: boolean;\s*\};/);
  assert.match(source, /export async function getPortfolioStage4Insights/);
  assert.match(source, /status NOT IN \('RELEASED','ROLLED_BACK','CANCELLED','REJECTED'\)/);
  assert.match(source, /latest\.execution_number=\(SELECT MAX\(execution_number\) FROM uat_test_executions WHERE test_case_id=t\.id\)/);
  assert.match(source, /status NOT IN \('CLOSED','DUPLICATE','DEFERRED'\)/);
  assert.match(source, /release_id IS NOT NULL AND status IN \('PENDING','UNDER_REVIEW'\)/);
  assert.match(source, /l\.due_at IS NOT NULL AND date\(l\.due_at\)<date\('now'\)/);
  assert.match(source, /planned_end_date IS NOT NULL AND date\(planned_end_date\)<date\('now'\)/);
  assert.match(source, /attention: \[\.\.\.overdueLanes\.results, \.\.\.criticalDefectAttention\.results, \.\.\.overdueCampaigns\.results\]\.slice\(0, 10\)/);
});

test("db/dashboard.ts threads a Stage4InsightAccess parameter through to getPortfolioStage4Insights and folds its attention into the combined queue", async () => {
  const source = await read("db/dashboard.ts");
  assert.match(source, /import \{ getPortfolioStage4Insights, type Stage4InsightAccess \} from "\.\/stage4-insights";/);
  assert.match(source, /stage4Access: Stage4InsightAccess = \{ releases: false, uat: false, defects: false, signoffs: false \}/);
  assert.match(source, /getPortfolioStage4Insights\(stage4Access\)/);
  assert.match(source, /attention: \[\.\.\.delivery\.attention, \.\.\.attention\.results, \.\.\.stage4\.attention\]\.slice\(0, 12\)/);
});

test("the dashboard API derives Stage 4 access from the caller's own release/uat/defect/signoff permissions", async () => {
  const source = await read("app/api/v1/dashboard/route.ts");
  assert.match(source, /releases: context\.principal\.permissions\.includes\("release\.view"\)/);
  assert.match(source, /uat: context\.principal\.permissions\.includes\("uat\.view"\)/);
  assert.match(source, /defects: context\.principal\.permissions\.includes\("defect\.view"\)/);
  assert.match(source, /signoffs: context\.principal\.permissions\.includes\("signoff\.view"\)/);
});

test("the Executive Dashboard renders a Stage 4 Release/UAT pulse section with the same permission-aware unavailable-state pattern as Stage 2's delivery pulse", async () => {
  const source = await read("app/dashboard/executive-dashboard.tsx");
  assert.match(source, /function Stage4Pulse/);
  assert.match(source, /<Stage4Pulse stage4=\{data\.stage4\} open=\{open\} canNavigate=\{canNavigate\} \/>/);
  assert.match(source, /!stage4\.releases\.available \? <Unavailable reason=\{stage4\.releases\.reason\} \/>/);
  assert.match(source, /stage4: Stage4;/);
});

test("db/governance-overview.ts adds a Project-scoped Release readiness and open-critical-defect area to the Governance summary", async () => {
  const source = await read("db/governance-overview.ts");
  assert.match(source, /export type GovernanceOverviewAccess = \{ documents: boolean; requirements: boolean; signoffs: boolean; raci: boolean; feasibility: boolean; releases: boolean \};/);
  assert.match(source, /async function releaseSummary\(projectId: string\)/);
  assert.match(source, /r\.project_id=\? AND r\.record_status='ACTIVE' AND r\.status NOT IN \('RELEASED','ROLLED_BACK','CANCELLED','REJECTED'\)/);
  assert.match(source, /FROM defects WHERE project_id=\? AND status NOT IN \('CLOSED','DUPLICATE','DEFERRED'\)/);
  assert.match(source, /releases: releases \? \{ available: true as const, \.\.\.releases \} : \{ available: false as const, reason: "Requires Release viewing permission\." \}/);
});

test("the Project Overview API and UI thread the new Release governance area through, permission-gated on release.view", async () => {
  const route = await read("app/api/v1/projects/[id]/overview/route.ts");
  assert.match(route, /releases: context\.principal\.permissions\.includes\("release\.view"\)/);
  const ui = await read("app/projects/project-overview.tsx");
  assert.match(ui, /releases:\{available:boolean;reason\?:string;total\?:number;ready\?:number;atRisk\?:number;blocked\?:number;openDefects\?:number;openCriticalDefects\?:number\};/);
  assert.match(ui, /governance\.releases\.available \? <article><span>Release readiness<\/span>/);
});

test("db/releases.ts carries the latest readiness snapshot on every list row, fulfilling Section 10's own 'readiness badge' Release portfolio screen contract", async () => {
  const source = await read("db/releases.ts");
  assert.match(source, /\(SELECT rs\.readiness FROM release_readiness_snapshots rs WHERE rs\.release_id=r\.id ORDER BY rs\.calculated_at DESC,rs\.id DESC LIMIT 1\) readiness/);
  assert.match(source, /readiness: string \| null;/);
});

test("the Release portfolio table renders a Readiness column using the existing ReadinessBadge component", async () => {
  const source = await read("app/releases/release-portfolio.tsx");
  assert.match(source, /<th>Readiness<\/th>/);
  assert.match(source, /<td><ReadinessBadge readiness=\{release\.readiness\} \/><\/td>/);
});

test("db/reports.ts adds five Stage 4 report definitions with their own summary branches, reusing the unchanged /api/v1/reports/:key route", async () => {
  const source = await read("db/reports.ts");
  for (const key of ["release-portfolio-status", "release-scope-delivery", "uat-execution-pass-rate", "defect-aging-severity", "deployment-history-rollback"]) {
    assert.match(source, new RegExp(`"${key}": \\{`));
    assert.match(source, new RegExp(`if \\(key === "${key}"\\) return \\[`));
  }
  assert.match(source, /latest\.execution_number=\(SELECT MAX\(execution_number\) FROM uat_test_executions WHERE test_case_id=t\.id\)/);
});

test("the Report Center exposes a Stage 4 Release & UAT report group listing all five new report keys", async () => {
  const source = await read("app/reports/report-center.tsx");
  assert.match(source, /const releaseReports = \[/);
  assert.match(source, /STAGE 4 RELEASE &amp; UAT/);
  for (const key of ["release-portfolio-status", "release-scope-delivery", "uat-execution-pass-rate", "defect-aging-severity", "deployment-history-rollback"]) {
    assert.match(source, new RegExp(`\\["${key}"`));
  }
});

test("the Audit Trail API and UI accept Stage 4 entity types and actions", async () => {
  const route = await read("app/api/v1/audit/route.ts");
  for (const entity of ["Release", "UatCampaign", "UatTestCase", "Defect"]) assert.match(route, new RegExp(`"${entity}"`));
  const center = await read("app/audit/audit-center.tsx");
  for (const entity of ["Release", "UatCampaign", "UatTestCase", "Defect"]) assert.match(center, new RegExp(`"${entity}"`));
  for (const action of ["SCOPE_ADD", "SCOPE_REMOVE", "SCOPE_LOCK", "DEPLOYMENT_RECORD", "EXECUTION_RECORD", "PROGRESS_UPDATE", "CLOSE", "READINESS_CALCULATE", "REQUIREMENT_LINK_ADD", "REQUIREMENT_LINK_REMOVE"]) {
    assert.match(center, new RegExp(`"${action}"`));
  }
});
