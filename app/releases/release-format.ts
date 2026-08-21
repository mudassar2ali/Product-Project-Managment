// Shared formatting helpers for the Release Center UI (Stage 4 Step 10). Pure functions only — no
// "use client" needed — so both the top-level release-center.tsx and the nested uat-workspace.tsx
// can import the same tone mapping instead of re-deriving it per file.

export type Tone = "neutral" | "positive" | "warning" | "critical";

const releaseStatusTone: Record<string, Tone> = {
  PLANNING: "neutral", SCOPE_LOCKED: "neutral", IN_UAT: "warning", READY_FOR_SIGNOFF: "warning",
  APPROVED: "positive", APPROVED_WITH_CONDITIONS: "positive", REJECTED: "critical",
  RELEASED: "positive", ROLLED_BACK: "critical", CANCELLED: "neutral",
};

const readinessTone: Record<string, Tone> = { READY: "positive", AT_RISK: "warning", BLOCKED: "critical", NOT_READY: "neutral" };

const campaignStatusTone: Record<string, Tone> = { DRAFT: "neutral", PLANNED: "neutral", IN_PROGRESS: "warning", COMPLETED: "positive", CANCELLED: "critical" };

const testCaseStatusTone: Record<string, Tone> = { DRAFT: "neutral", READY: "positive", RETIRED: "neutral" };

const executionResultTone: Record<string, Tone> = { PASS: "positive", FAIL: "critical", BLOCKED: "warning", NOT_EXECUTED: "neutral" };

const deploymentStatusTone: Record<string, Tone> = { PLANNED: "neutral", IN_PROGRESS: "warning", SUCCEEDED: "positive", FAILED: "critical", ROLLED_BACK: "critical" };

const defectSeverityTone: Record<string, Tone> = { LOW: "neutral", MEDIUM: "warning", HIGH: "warning", CRITICAL: "critical" };

const defectStatusTone: Record<string, Tone> = { OPEN: "critical", IN_PROGRESS: "warning", FIXED: "warning", VERIFIED: "positive", CLOSED: "positive", DEFERRED: "neutral", DUPLICATE: "neutral" };

function tone(map: Record<string, Tone>, value: string | null | undefined): Tone {
  return (value && map[value]) ?? "neutral";
}

export const toneForReleaseStatus = (value: string | null | undefined) => tone(releaseStatusTone, value);
export const toneForReadiness = (value: string | null | undefined) => tone(readinessTone, value);
export const toneForCampaignStatus = (value: string | null | undefined) => tone(campaignStatusTone, value);
export const toneForTestCaseStatus = (value: string | null | undefined) => tone(testCaseStatusTone, value);
export const toneForExecutionResult = (value: string | null | undefined) => tone(executionResultTone, value);
export const toneForDeploymentStatus = (value: string | null | undefined) => tone(deploymentStatusTone, value);
export const toneForDefectSeverity = (value: string | null | undefined) => tone(defectSeverityTone, value);
export const toneForDefectStatus = (value: string | null | undefined) => tone(defectStatusTone, value);

export const titleCase = (value: string | null | undefined) => (value ?? "").replaceAll("_", " ");

export const formatDate = (value: string | null | undefined) =>
  value ? new Date(value).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" }) : "—";

export const formatDateTime = (value: string | null | undefined) =>
  value ? new Date(value).toLocaleString(undefined, { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" }) : "—";
