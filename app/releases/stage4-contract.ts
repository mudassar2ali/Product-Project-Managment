export const releaseTypes = ["MAJOR", "MINOR", "PATCH", "HOTFIX"] as const;
export type ReleaseType = (typeof releaseTypes)[number];

export const releaseStatuses = [
  "PLANNING",
  "SCOPE_LOCKED",
  "IN_UAT",
  "READY_FOR_SIGNOFF",
  "APPROVED",
  "APPROVED_WITH_CONDITIONS",
  "REJECTED",
  "RELEASED",
  "ROLLED_BACK",
  "CANCELLED",
] as const;
export type ReleaseStatus = (typeof releaseStatuses)[number];

const releaseTransitions: Record<ReleaseStatus, readonly ReleaseStatus[]> = {
  PLANNING: ["SCOPE_LOCKED", "CANCELLED"],
  SCOPE_LOCKED: ["IN_UAT", "PLANNING", "CANCELLED"],
  IN_UAT: ["READY_FOR_SIGNOFF", "SCOPE_LOCKED", "CANCELLED"],
  READY_FOR_SIGNOFF: ["APPROVED", "APPROVED_WITH_CONDITIONS", "REJECTED", "IN_UAT"],
  APPROVED: ["RELEASED"],
  APPROVED_WITH_CONDITIONS: ["RELEASED", "REJECTED"],
  REJECTED: ["SCOPE_LOCKED"],
  RELEASED: ["ROLLED_BACK"],
  ROLLED_BACK: ["SCOPE_LOCKED"],
  CANCELLED: [],
};

export function assertReleaseTransition(from: ReleaseStatus, to: ReleaseStatus): void {
  if (from === to) return;
  if (!releaseTransitions[from].includes(to)) throw new Error("RELEASE_STATUS_TRANSITION_INVALID");
}

export const environmentTiers = ["NON_PROD", "PROD"] as const;
export type EnvironmentTier = (typeof environmentTiers)[number];

export const deploymentStatuses = ["PLANNED", "IN_PROGRESS", "SUCCEEDED", "FAILED", "ROLLED_BACK"] as const;
export type DeploymentStatus = (typeof deploymentStatuses)[number];
const terminalDeploymentStatuses: readonly DeploymentStatus[] = ["SUCCEEDED", "FAILED", "ROLLED_BACK"];

export function assertDeploymentCompletionConsistent(status: DeploymentStatus, completedAt: string | null): void {
  const isTerminal = terminalDeploymentStatuses.includes(status);
  if (isTerminal && !completedAt) throw new Error("DEPLOYMENT_COMPLETION_REQUIRED");
  if (!isTerminal && completedAt) throw new Error("DEPLOYMENT_COMPLETION_NOT_ALLOWED");
}

export const uatCampaignStatuses = ["DRAFT", "PLANNED", "IN_PROGRESS", "COMPLETED", "CANCELLED"] as const;
export type UatCampaignStatus = (typeof uatCampaignStatuses)[number];

const campaignTransitions: Record<UatCampaignStatus, readonly UatCampaignStatus[]> = {
  DRAFT: ["PLANNED", "CANCELLED"],
  PLANNED: ["IN_PROGRESS", "DRAFT", "CANCELLED"],
  IN_PROGRESS: ["COMPLETED", "CANCELLED"],
  COMPLETED: [],
  CANCELLED: [],
};

export function assertCampaignTransition(from: UatCampaignStatus, to: UatCampaignStatus): void {
  if (from === to) return;
  if (!campaignTransitions[from].includes(to)) throw new Error("CAMPAIGN_STATUS_TRANSITION_INVALID");
}

export function assertCampaignTimestampConsistent(status: UatCampaignStatus, startedAt: string | null, completedAt: string | null): void {
  const needsStarted: readonly UatCampaignStatus[] = ["IN_PROGRESS", "COMPLETED"];
  const needsCompleted: readonly UatCampaignStatus[] = ["COMPLETED", "CANCELLED"];
  if (needsStarted.includes(status) !== Boolean(startedAt)) throw new Error("CAMPAIGN_START_EVIDENCE_INVALID");
  if (needsCompleted.includes(status) !== Boolean(completedAt)) throw new Error("CAMPAIGN_COMPLETION_EVIDENCE_INVALID");
}

export const testCasePriorities = ["LOW", "MEDIUM", "HIGH", "CRITICAL"] as const;
export const testCaseStatuses = ["DRAFT", "READY", "RETIRED"] as const;
export type TestCaseStatus = (typeof testCaseStatuses)[number];

export const executionResults = ["PASS", "FAIL", "BLOCKED", "NOT_EXECUTED"] as const;
export type ExecutionResult = (typeof executionResults)[number];

export function assertExecutionEvidenceConsistent(result: ExecutionResult, executedAt: string | null, executedByUserId: string | null): void {
  const executed = result !== "NOT_EXECUTED";
  if (executed && (!executedAt || !executedByUserId)) throw new Error("EXECUTION_EVIDENCE_REQUIRED");
  if (!executed && (executedAt || executedByUserId)) throw new Error("EXECUTION_EVIDENCE_NOT_ALLOWED");
}

export function assertTestCaseExecutable(status: TestCaseStatus): void {
  if (status !== "READY") throw new Error("TEST_CASE_NOT_READY");
}

export const defectSources = ["UAT", "QA", "PRODUCTION", "INTERNAL"] as const;
export const defectSeverities = ["CRITICAL", "HIGH", "MEDIUM", "LOW"] as const;
export type DefectSeverity = (typeof defectSeverities)[number];

export const defectStatuses = ["OPEN", "IN_PROGRESS", "FIXED", "VERIFIED", "CLOSED", "DEFERRED", "DUPLICATE"] as const;
export type DefectStatus = (typeof defectStatuses)[number];

const defectTransitions: Record<DefectStatus, readonly DefectStatus[]> = {
  OPEN: ["IN_PROGRESS", "DEFERRED", "DUPLICATE"],
  IN_PROGRESS: ["FIXED", "OPEN", "DEFERRED", "DUPLICATE"],
  FIXED: ["VERIFIED", "OPEN"],
  VERIFIED: ["CLOSED"],
  CLOSED: [],
  DEFERRED: ["OPEN"],
  DUPLICATE: [],
};

export function assertDefectTransition(from: DefectStatus, to: DefectStatus): void {
  if (from === to) return;
  if (!defectTransitions[from].includes(to)) throw new Error("DEFECT_STATUS_TRANSITION_INVALID");
}

export function assertDefectClosureConsistent(status: DefectStatus, resolvedAt: string | null, closedAt: string | null, duplicateOfId: string | null): void {
  const resolvedFrom: readonly DefectStatus[] = ["FIXED", "VERIFIED", "CLOSED"];
  const closedFrom: readonly DefectStatus[] = ["CLOSED", "DUPLICATE", "DEFERRED"];
  if (resolvedFrom.includes(status) !== Boolean(resolvedAt) && status !== "DEFERRED" && status !== "DUPLICATE") {
    if (resolvedFrom.includes(status) && !resolvedAt) throw new Error("DEFECT_RESOLUTION_REQUIRED");
  }
  if (closedFrom.includes(status) && !closedAt) throw new Error("DEFECT_CLOSURE_REQUIRED");
  if (!closedFrom.includes(status) && closedAt) throw new Error("DEFECT_CLOSURE_NOT_ALLOWED");
  if (status === "DUPLICATE" && !duplicateOfId) throw new Error("DEFECT_DUPLICATE_TARGET_REQUIRED");
  if (status !== "DUPLICATE" && duplicateOfId) throw new Error("DEFECT_DUPLICATE_TARGET_NOT_ALLOWED");
}

export const releaseReadinessStates = ["READY", "AT_RISK", "BLOCKED", "NOT_READY"] as const;
export type ReleaseReadinessState = (typeof releaseReadinessStates)[number];

export type ReleaseScopeEvidence = {
  backlogItemId: string;
  deliveryStatus: string;
};

export type UatExecutionEvidence = {
  testCaseId: string;
  result: ExecutionResult;
};

export type ReleaseReadinessEvidence = {
  scope: readonly ReleaseScopeEvidence[];
  latestExecutionByTestCase: readonly UatExecutionEvidence[];
  openCriticalDefectCount: number;
  openDefectCount: number;
  signoffStatus: "PENDING" | "UNDER_REVIEW" | "APPROVED" | "APPROVED_WITH_CONDITIONS" | "REJECTED" | null;
  openMandatorySignoffConditions: number;
};

export type ReleaseReadinessResult = {
  readiness: ReleaseReadinessState;
  scopeItemCount: number;
  scopeDoneCount: number;
  uatTestCaseCount: number;
  uatPassedCount: number;
  uatFailedCount: number;
  uatBlockedCount: number;
  uatNotExecutedCount: number;
  openDefectCount: number;
  criticalOpenDefectCount: number;
};

export function calculateReleaseReadiness(evidence: ReleaseReadinessEvidence): ReleaseReadinessResult {
  const scopeItemCount = evidence.scope.length;
  const scopeDoneCount = evidence.scope.filter((item) => item.deliveryStatus === "DONE").length;
  const uatTestCaseCount = evidence.latestExecutionByTestCase.length;
  const uatPassedCount = evidence.latestExecutionByTestCase.filter((execution) => execution.result === "PASS").length;
  const uatFailedCount = evidence.latestExecutionByTestCase.filter((execution) => execution.result === "FAIL").length;
  const uatBlockedCount = evidence.latestExecutionByTestCase.filter((execution) => execution.result === "BLOCKED").length;
  const uatNotExecutedCount = evidence.latestExecutionByTestCase.filter((execution) => execution.result === "NOT_EXECUTED").length;

  const scopeIncomplete = scopeItemCount === 0 || scopeDoneCount < scopeItemCount;
  const hasOpenFailOrBlocked = uatFailedCount > 0 || uatBlockedCount > 0;
  const signoffDecided = evidence.signoffStatus === "APPROVED" || evidence.signoffStatus === "APPROVED_WITH_CONDITIONS";
  const signoffClean = evidence.signoffStatus === "APPROVED" || (evidence.signoffStatus === "APPROVED_WITH_CONDITIONS" && evidence.openMandatorySignoffConditions === 0);

  let readiness: ReleaseReadinessState;
  if (scopeIncomplete || evidence.openCriticalDefectCount > 0) {
    readiness = "BLOCKED";
  } else if (hasOpenFailOrBlocked || uatNotExecutedCount > 0 || !signoffDecided || evidence.openMandatorySignoffConditions > 0) {
    readiness = "AT_RISK";
  } else if (signoffClean && evidence.openDefectCount === 0) {
    readiness = "READY";
  } else {
    readiness = "NOT_READY";
  }

  return {
    readiness,
    scopeItemCount,
    scopeDoneCount,
    uatTestCaseCount,
    uatPassedCount,
    uatFailedCount,
    uatBlockedCount,
    uatNotExecutedCount,
    openDefectCount: evidence.openDefectCount,
    criticalOpenDefectCount: evidence.openCriticalDefectCount,
  };
}

export const signoffReleaseDefaultRequiredLanes = ["PRODUCT", "ENGINEERING", "QA"] as const;

export const stage4ContractVersion = "4.0" as const;
