import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const root = new URL("../", import.meta.url);
const read = (path) => readFile(new URL(path, root), "utf8");

test("Releases navigation is wired to the Release Center with the correct permission and step", async () => {
  const shell = await read("app/command-center-shell.tsx");
  assert.match(shell, /\{ label: "Releases", icon: "▶", step: 10, permission: "release\.view" \}/);
  assert.match(shell, /import \{ ReleaseCenter \} from ".\/releases\/release-center";/);
  assert.match(shell, /active === "Releases" \? \(\s*<ReleaseCenter/);
  assert.match(shell, /canCreateRelease: principal\.permissions\.includes\("release\.create"\)/);
  assert.match(shell, /canReadiness: principal\.permissions\.includes\("release\.readiness"\)/);
  assert.match(shell, /canManageTraceability: principal\.permissions\.includes\("traceability\.manage"\)/);
});

test("Release Center composes the portfolio and, once a Release is open, the detail drawer with the full permission set", async () => {
  const center = await read("app/releases/release-center.tsx");
  assert.match(center, /import \{ ReleasePortfolio \} from ".\/release-portfolio";/);
  assert.match(center, /import \{ ReleaseDetail \} from ".\/release-detail";/);
  assert.match(center, /<ReleasePortfolio canCreate=\{permissions\.canCreateRelease\} onOpen=\{setOpenReleaseId\} \/>/);
  assert.match(center, /openReleaseId && <ReleaseDetail/);
});

test("Release Detail exposes Overview, Environments & Deployments, Sign-off, UAT and Defects as contextual tabs inside one Release, mirroring Stage 3's Governance Center", async () => {
  const detail = await read("app/releases/release-detail.tsx");
  assert.match(detail, /const tabs = \["Overview", "Environments & Deployments", "Sign-off", "UAT", "Defects"\] as const;/);
  assert.match(detail, /import \{ SignoffPanel \} from "\.\.\/governance\/signoff-panel";/);
  assert.match(detail, /subjectType="RELEASE"/);
  assert.match(detail, /subjectEligible=\{release\.status === "READY_FOR_SIGNOFF"\}/);
  assert.match(detail, /import \{ UatWorkspace \} from "\.\/uat-workspace";/);
  assert.match(detail, /import \{ DefectWorkspace \} from "\.\/defect-workspace";/);
  assert.match(detail, /<UatWorkspace releaseId=\{release\.id\} projectId=\{release\.projectId\}/);
  assert.match(detail, /<DefectWorkspace releaseId=\{release\.id\} projectId=\{release\.projectId\}/);
});

test("Release status transitions in the UI are restricted to the manual allowlist, never the dedicated lock-scope/deployment/sign-off transitions", async () => {
  const detail = await read("app/releases/release-detail.tsx");
  assert.match(detail, /import \{ manualReleaseStatusTargets \} from "\.\/release-contract";/);
  assert.match(detail, /transitionTargets = release \? \(manualReleaseStatusTargets as readonly string\[\]\)\.filter/);
});

test("PATCH /api/v4/releases/:id dispatches a status transition to transitionReleaseStatus when a status field is present, and otherwise keeps the Step 3 metadata path", async () => {
  const source = await read("app/api/v4/releases/[id]/route.ts");
  assert.match(source, /import \{ validateReleaseMetadataInput, validateReleaseStatusTransitionInput \} from "\.\.\/\.\.\/\.\.\/\.\.\/releases\/release-contract";/);
  assert.match(source, /typeof source\.status === "string" && source\.status\.trim\(\)/);
  assert.match(source, /transitionReleaseStatus/);
  assert.match(source, /UAT_NOT_STARTED/);
  assert.match(source, /READINESS_SNAPSHOT_STALE/);
  assert.match(source, /updateReleaseMetadata/);
});

test("release-contract.ts restricts manual status transitions to CANCELLED, PLANNING, IN_UAT and READY_FOR_SIGNOFF — excluding the automatic and dedicated-endpoint transitions", async () => {
  const source = await read("app/releases/release-contract.ts");
  assert.match(source, /export const manualReleaseStatusTargets = \["CANCELLED", "PLANNING", "IN_UAT", "READY_FOR_SIGNOFF"\] as const;/);
  assert.match(source, /export function validateReleaseStatusTransitionInput/);
});

test("db/releases.ts gates IN_UAT on an active UAT campaign and READY_FOR_SIGNOFF on a fresh readiness snapshot", async () => {
  const source = await read("db/releases.ts");
  assert.match(source, /export async function transitionReleaseStatus/);
  assert.match(source, /uat_campaigns WHERE release_id=\? AND status IN \('PLANNED','IN_PROGRESS'\)/);
  assert.match(source, /uat_not_started/);
  assert.match(source, /isReadinessSnapshotFresh\(id\)/);
  assert.match(source, /readiness_stale/);
});

test("isReadinessSnapshotFresh compares the latest snapshot's source revision against a fresh evidence hash, reusing gatherEvidence/hashEvidence rather than a separate staleness field", async () => {
  const source = await read("db/release-readiness.ts");
  assert.match(source, /export async function isReadinessSnapshotFresh/);
  assert.match(source, /latest\.sourceRevision === sourceRevision/);
});

test("the three previously-missing Stage 4 read endpoints (execution history, requirement links, single defect) are now wired with view-level permissions", async () => {
  const [executions, links, defect] = await Promise.all([
    read("app/api/v4/test-cases/[id]/executions/route.ts"),
    read("app/api/v4/test-cases/[id]/requirement-links/route.ts"),
    read("app/api/v4/defects/[id]/route.ts"),
  ]);
  assert.match(executions, /export async function GET/);
  assert.match(executions, /authorizeApi\("uat\.view"\)/);
  assert.match(executions, /listExecutions/);
  assert.match(links, /export async function GET/);
  assert.match(links, /authorizeApi\("traceability\.view"\)/);
  assert.match(links, /listRequirementUatLinksForTestCase/);
  assert.match(defect, /export async function GET/);
  assert.match(defect, /authorizeApi\("defect\.view"\)/);
  assert.match(defect, /getDefect/);
});

test("globals.css defines the Stage 4 tone-badge family and Release/UAT workspace layout classes", async () => {
  const css = await read("app/globals.css");
  for (const selector of [".tone-badge", ".tone-neutral", ".tone-positive", ".tone-warning", ".tone-critical", ".release-summary-strip", ".release-status-actions", ".uat-tree", ".uat-execution-row", ".uat-link-row"]) {
    assert.match(css, new RegExp(selector.replace(".", "\\.")));
  }
});

test("the new Release Center panels defer their initial load through window.setTimeout rather than a synchronous setState-in-effect", async () => {
  for (const file of ["app/releases/release-portfolio.tsx", "app/releases/uat-workspace.tsx", "app/releases/defect-workspace.tsx", "app/releases/release-detail.tsx"]) {
    const source = await read(file);
    assert.match(source, /window\.setTimeout\(\(\) => void load/);
  }
});

test("SignoffPanel's local request type now accounts for a Release subject, without changing its subject-agnostic request/decide/condition flow", async () => {
  const source = await read("app/governance/signoff-panel.tsx");
  assert.match(source, /releaseId: string \| null/);
});
