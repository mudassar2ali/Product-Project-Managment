import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");

test("Stage 4 atomic permissions are centralized and least-privilege role governed", async () => {
  const source = await read("app/authorization.ts");
  for (const permission of [
    "release.view", "release.create", "release.edit", "release.scope", "release.readiness",
    "deployment.view", "deployment.record",
    "uat.view", "uat.create", "uat.edit", "uat.execute",
    "defect.view", "defect.create", "defect.edit", "defect.close",
  ]) assert.match(source, new RegExp(`"${permission.replace(".", "\\.")}"`));
  assert.match(source, /"release\.view", "uat\.view", "defect\.view",\s*\n\];/);
  assert.match(source, /"release\.create", "release\.edit", "release\.scope", "release\.readiness",/);
  assert.match(source, /"release\.edit", "deployment\.view", "deployment\.record", "defect\.edit", "defect\.close",/);
  assert.match(source, /"uat\.create", "uat\.edit", "uat\.execute", "defect\.create", "defect\.edit"/);
  assert.doesNotMatch(source, /DEVELOPER:.*release\./);
});

test("release lifecycle only allows governed forward/rollback transitions", async () => {
  const { assertReleaseTransition } = await import("../app/releases/stage4-contract.ts");
  assert.doesNotThrow(() => assertReleaseTransition("PLANNING", "SCOPE_LOCKED"));
  assert.doesNotThrow(() => assertReleaseTransition("APPROVED", "RELEASED"));
  assert.doesNotThrow(() => assertReleaseTransition("RELEASED", "ROLLED_BACK"));
  assert.doesNotThrow(() => assertReleaseTransition("ROLLED_BACK", "SCOPE_LOCKED"));
  assert.throws(() => assertReleaseTransition("PLANNING", "RELEASED"), /RELEASE_STATUS_TRANSITION_INVALID/);
  assert.throws(() => assertReleaseTransition("CANCELLED", "PLANNING"), /RELEASE_STATUS_TRANSITION_INVALID/);
});

test("deployment records require completion evidence exactly for terminal statuses", async () => {
  const { assertDeploymentCompletionConsistent } = await import("../app/releases/stage4-contract.ts");
  assert.doesNotThrow(() => assertDeploymentCompletionConsistent("PLANNED", null));
  assert.doesNotThrow(() => assertDeploymentCompletionConsistent("SUCCEEDED", "2026-08-20T00:00:00Z"));
  assert.throws(() => assertDeploymentCompletionConsistent("SUCCEEDED", null), /DEPLOYMENT_COMPLETION_REQUIRED/);
  assert.throws(() => assertDeploymentCompletionConsistent("IN_PROGRESS", "2026-08-20T00:00:00Z"), /DEPLOYMENT_COMPLETION_NOT_ALLOWED/);
});

test("UAT executions are append-only evidence bound to a ready test case", async () => {
  const { assertExecutionEvidenceConsistent, assertTestCaseExecutable } = await import("../app/releases/stage4-contract.ts");
  assert.doesNotThrow(() => assertTestCaseExecutable("READY"));
  assert.throws(() => assertTestCaseExecutable("DRAFT"), /TEST_CASE_NOT_READY/);
  assert.doesNotThrow(() => assertExecutionEvidenceConsistent("PASS", "2026-08-20T00:00:00Z", "user-1"));
  assert.doesNotThrow(() => assertExecutionEvidenceConsistent("NOT_EXECUTED", null, null));
  assert.throws(() => assertExecutionEvidenceConsistent("PASS", null, null), /EXECUTION_EVIDENCE_REQUIRED/);
  assert.throws(() => assertExecutionEvidenceConsistent("NOT_EXECUTED", "2026-08-20T00:00:00Z", "user-1"), /EXECUTION_EVIDENCE_NOT_ALLOWED/);
});

test("defect lifecycle enforces governed transitions and closure/duplicate evidence", async () => {
  const { assertDefectTransition, assertDefectClosureConsistent } = await import("../app/releases/stage4-contract.ts");
  assert.doesNotThrow(() => assertDefectTransition("OPEN", "IN_PROGRESS"));
  assert.doesNotThrow(() => assertDefectTransition("FIXED", "VERIFIED"));
  assert.throws(() => assertDefectTransition("OPEN", "VERIFIED"), /DEFECT_STATUS_TRANSITION_INVALID/);
  assert.throws(() => assertDefectTransition("CLOSED", "OPEN"), /DEFECT_STATUS_TRANSITION_INVALID/);
  assert.doesNotThrow(() => assertDefectClosureConsistent("VERIFIED", "2026-08-01T00:00:00Z", null, null));
  assert.doesNotThrow(() => assertDefectClosureConsistent("CLOSED", "2026-08-01T00:00:00Z", "2026-08-05T00:00:00Z", null));
  assert.throws(() => assertDefectClosureConsistent("FIXED", null, null, null), /DEFECT_RESOLUTION_REQUIRED/);
  assert.throws(() => assertDefectClosureConsistent("CLOSED", "2026-08-01T00:00:00Z", null, null), /DEFECT_CLOSURE_REQUIRED/);
  assert.throws(() => assertDefectClosureConsistent("OPEN", null, "2026-08-01T00:00:00Z", null), /DEFECT_CLOSURE_NOT_ALLOWED/);
  assert.doesNotThrow(() => assertDefectClosureConsistent("DUPLICATE", null, "2026-08-01T00:00:00Z", "defect-9"));
  assert.throws(() => assertDefectClosureConsistent("DUPLICATE", null, "2026-08-01T00:00:00Z", null), /DEFECT_DUPLICATE_TARGET_REQUIRED/);
  assert.throws(() => assertDefectClosureConsistent("OPEN", null, null, "defect-9"), /DEFECT_DUPLICATE_TARGET_NOT_ALLOWED/);
});

test("release readiness is computed from evidence and never fabricated", async () => {
  const { calculateReleaseReadiness } = await import("../app/releases/stage4-contract.ts");

  const blockedByScope = calculateReleaseReadiness({
    scope: [{ backlogItemId: "b1", deliveryStatus: "DONE" }, { backlogItemId: "b2", deliveryStatus: "IN_PROGRESS" }],
    latestExecutionByTestCase: [],
    openCriticalDefectCount: 0,
    openDefectCount: 0,
    signoffStatus: null,
    openMandatorySignoffConditions: 0,
  });
  assert.equal(blockedByScope.readiness, "BLOCKED");

  const blockedByCriticalDefect = calculateReleaseReadiness({
    scope: [{ backlogItemId: "b1", deliveryStatus: "DONE" }],
    latestExecutionByTestCase: [{ testCaseId: "t1", result: "PASS" }],
    openCriticalDefectCount: 1,
    openDefectCount: 1,
    signoffStatus: "APPROVED",
    openMandatorySignoffConditions: 0,
  });
  assert.equal(blockedByCriticalDefect.readiness, "BLOCKED");

  const atRiskFromFailedUat = calculateReleaseReadiness({
    scope: [{ backlogItemId: "b1", deliveryStatus: "DONE" }],
    latestExecutionByTestCase: [{ testCaseId: "t1", result: "FAIL" }],
    openCriticalDefectCount: 0,
    openDefectCount: 1,
    signoffStatus: null,
    openMandatorySignoffConditions: 0,
  });
  assert.equal(atRiskFromFailedUat.readiness, "AT_RISK");

  const atRiskFromPendingSignoff = calculateReleaseReadiness({
    scope: [{ backlogItemId: "b1", deliveryStatus: "DONE" }],
    latestExecutionByTestCase: [{ testCaseId: "t1", result: "PASS" }],
    openCriticalDefectCount: 0,
    openDefectCount: 0,
    signoffStatus: "UNDER_REVIEW",
    openMandatorySignoffConditions: 0,
  });
  assert.equal(atRiskFromPendingSignoff.readiness, "AT_RISK");

  const ready = calculateReleaseReadiness({
    scope: [{ backlogItemId: "b1", deliveryStatus: "DONE" }],
    latestExecutionByTestCase: [{ testCaseId: "t1", result: "PASS" }],
    openCriticalDefectCount: 0,
    openDefectCount: 0,
    signoffStatus: "APPROVED",
    openMandatorySignoffConditions: 0,
  });
  assert.equal(ready.readiness, "READY");
  assert.equal(ready.scopeDoneCount, 1);
  assert.equal(ready.uatPassedCount, 1);
});

test("Stage 4 Release navigation is not yet exposed", async () => {
  const source = await read("app/command-center-shell.tsx");
  assert.doesNotMatch(source, /label: "Releases"/);
});
