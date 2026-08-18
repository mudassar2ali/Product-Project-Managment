export const governanceDocumentTypes = ["BRD", "PRD"] as const;
export type GovernanceDocumentType = (typeof governanceDocumentTypes)[number];

export const governanceLifecycleStatuses = [
  "DRAFT",
  "IN_REVIEW",
  "APPROVED",
  "APPROVED_WITH_CONDITIONS",
  "REJECTED",
  "SUPERSEDED",
  "RETIRED",
] as const;
export type GovernanceLifecycleStatus = (typeof governanceLifecycleStatuses)[number];

export const brdSectionKeys = [
  "DOCUMENT_INFORMATION",
  "EXECUTIVE_SUMMARY",
  "BUSINESS_CONTEXT",
  "PROBLEM_STATEMENT",
  "BUSINESS_OBJECTIVES",
  "BUSINESS_REQUIREMENTS",
  "SCOPE",
  "OUT_OF_SCOPE",
  "STAKEHOLDERS",
  "CURRENT_STATE",
  "FUTURE_STATE",
  "BUSINESS_PROCESSES",
  "FUNCTIONAL_REQUIREMENTS",
  "NON_FUNCTIONAL_REQUIREMENTS",
  "BUSINESS_RULES",
  "DEPENDENCIES",
  "ASSUMPTIONS",
  "RISKS",
  "COMPLIANCE_REQUIREMENTS",
  "KPIS",
  "SUCCESS_METRICS",
  "USER_STORIES",
  "ACCEPTANCE_CRITERIA",
  "UAT_CRITERIA",
  "SIGN_OFF",
] as const;

export const prdSectionKeys = [
  "PRODUCT_OVERVIEW",
  "PROBLEM",
  "OPPORTUNITY",
  "TARGET_USERS",
  "PERSONAS",
  "USE_CASES",
  "OBJECTIVES",
  "SUCCESS_METRICS",
  "FEATURES",
  "FUNCTIONAL_REQUIREMENTS",
  "NON_FUNCTIONAL_REQUIREMENTS",
  "USER_STORIES",
  "ACCEPTANCE_CRITERIA",
  "UX_REQUIREMENTS",
  "ANALYTICS_REQUIREMENTS",
  "DEPENDENCIES",
  "RISKS",
  "RELEASE_STRATEGY",
  "OUT_OF_SCOPE",
] as const;

export type BrdSectionKey = (typeof brdSectionKeys)[number];
export type PrdSectionKey = (typeof prdSectionKeys)[number];
export type GovernanceSectionKey = BrdSectionKey | PrdSectionKey;

export const requirementTypes = [
  "BUSINESS",
  "PRODUCT",
  "FUNCTIONAL",
  "NON_FUNCTIONAL",
  "COMPLIANCE",
  "BUSINESS_RULE",
  "UX",
  "ANALYTICS",
  "UAT",
] as const;
export type RequirementType = (typeof requirementTypes)[number];

export const requirementRelationshipTypes = ["DERIVES_FROM", "DEPENDS_ON", "CONFLICTS_WITH", "DUPLICATES"] as const;
export const requirementBacklogLinkTypes = ["IMPLEMENTS", "PARTIALLY_IMPLEMENTS", "VALIDATES"] as const;
export const requirementDeliveryStatuses = ["NOT_LINKED", "PLANNED", "IN_PROGRESS", "IMPLEMENTED", "PARTIAL", "SOURCE_UNAVAILABLE"] as const;
export const verificationEvidenceTypes = ["QA", "UAT", "RELEASE"] as const;
export const verificationEvidenceStatuses = ["NOT_AVAILABLE", "PENDING", "PASSED", "FAILED", "CONDITIONAL", "STALE"] as const;

export const signoffLaneTypes = [
  "PRODUCT",
  "BUSINESS",
  "ENGINEERING",
  "ARCHITECTURE",
  "QA",
  "COMPLIANCE",
  "LEGAL",
  "FINANCE",
  "OPERATIONS",
  "EXECUTIVE_SPONSOR",
] as const;
export const defaultRequiredSignoffLanes = ["PRODUCT", "BUSINESS", "ENGINEERING"] as const;
export const signoffStatuses = ["PENDING", "UNDER_REVIEW", "APPROVED", "APPROVED_WITH_CONDITIONS", "REJECTED"] as const;
export type SignoffStatus = (typeof signoffStatuses)[number];
export const signoffConditionStatuses = ["OPEN", "IN_PROGRESS", "SATISFIED", "WAIVED"] as const;

export const raciResponsibilities = ["RESPONSIBLE", "ACCOUNTABLE", "CONSULTED", "INFORMED"] as const;
export type RaciResponsibility = (typeof raciResponsibilities)[number];

export const feasibilityStatuses = [
  "DRAFT",
  "IN_REVIEW",
  "FEASIBLE",
  "FEASIBLE_WITH_CONDITIONS",
  "NOT_FEASIBLE",
  "SUPERSEDED",
] as const;

export type RequirementDraft = {
  title: string;
  statement: string;
  verificationMethod: string;
};

export type RequirementCoverageEvidence = {
  value: number | null;
  numerator: number;
  denominator: number;
  method: "EXPLICIT_REQUIRED_LINKS";
  sourceRevision: string;
  calculatedAt: string;
};

export type SignoffLaneEvidence = {
  required: boolean;
  status: SignoffStatus;
  openMandatoryConditions: number;
};

export function requiredSectionsFor(type: GovernanceDocumentType): readonly GovernanceSectionKey[] {
  return type === "BRD" ? brdSectionKeys : prdSectionKeys;
}

export function assertGovernanceVersionMutable(status: GovernanceLifecycleStatus): void {
  if (status !== "DRAFT") throw new Error("GOVERNANCE_VERSION_LOCKED");
}

export function isGovernanceVersionLabel(value: string): boolean {
  return /^(Draft|Review|Approved|Revision) (?:0\.[1-9][0-9]*|[1-9][0-9]*\.[0-9]+)$/.test(value);
}

export function validateRequirementDraft(input: RequirementDraft) {
  const errors: Record<string, string> = {};
  if (!input.title.trim()) errors.title = "Requirement title is required.";
  if (!input.statement.trim()) errors.statement = "Requirement statement is required.";
  if (!input.verificationMethod.trim()) errors.verificationMethod = "Verification method is required.";
  return { ok: Object.keys(errors).length === 0, errors };
}

export type RequirementBacklogLinkEvidence = {
  linkType: (typeof requirementBacklogLinkTypes)[number];
  origin: "LOCAL" | "AZURE_DEVOPS";
  status: string;
  deliveryState: string;
  sourceMissingAt: string | null;
};

export function deriveRequirementDeliveryStatus(
  links: readonly RequirementBacklogLinkEvidence[],
): (typeof requirementDeliveryStatuses)[number] {
  const implementing = links.filter((link) => link.linkType === "IMPLEMENTS" || link.linkType === "PARTIALLY_IMPLEMENTS");
  if (!implementing.length) return "NOT_LINKED";
  if (implementing.some((link) => link.origin === "AZURE_DEVOPS" && link.sourceMissingAt)) return "SOURCE_UNAVAILABLE";
  const hasPartialLink = implementing.some((link) => link.linkType === "PARTIALLY_IMPLEMENTS");
  const states = implementing.map((link) => link.deliveryState);
  const allDone = states.every((state) => state === "DONE");
  if (allDone && !hasPartialLink) return "IMPLEMENTED";
  const anyDone = states.some((state) => state === "DONE");
  if (hasPartialLink || anyDone) return "PARTIAL";
  const anyActive = states.some((state) => state === "IN_PROGRESS" || state === "VALIDATION");
  return anyActive ? "IN_PROGRESS" : "PLANNED";
}

export const evidenceFreshnessStatuses = ["NOT_APPLICABLE", "FRESH", "AGING", "STALE"] as const;
export type EvidenceFreshnessStatus = (typeof evidenceFreshnessStatuses)[number];

const evidenceFreshWindowDays = 90;
const evidenceAgingWindowDays = 180;

export function deriveEvidenceFreshness(
  evidenceStatus: (typeof verificationEvidenceStatuses)[number],
  observedAt: string | null,
  nowIso: string,
): EvidenceFreshnessStatus {
  if (evidenceStatus === "NOT_AVAILABLE" || evidenceStatus === "PENDING") return "NOT_APPLICABLE";
  if (!observedAt) return "STALE";
  const observedMs = Date.parse(observedAt);
  const nowMs = Date.parse(nowIso);
  if (Number.isNaN(observedMs) || Number.isNaN(nowMs)) return "STALE";
  const ageDays = (nowMs - observedMs) / 86_400_000;
  if (ageDays <= evidenceFreshWindowDays) return "FRESH";
  if (ageDays <= evidenceAgingWindowDays) return "AGING";
  return "STALE";
}

export function requirementCoverageEvidence(
  numerator: number,
  denominator: number,
  sourceRevision: string,
  calculatedAt: string,
): RequirementCoverageEvidence {
  if (numerator < 0 || denominator < 0 || numerator > denominator) throw new Error("INVALID_COVERAGE_INPUT");
  return {
    value: denominator > 0 ? Math.round((numerator / denominator) * 100) : null,
    numerator,
    denominator,
    method: "EXPLICIT_REQUIRED_LINKS",
    sourceRevision,
    calculatedAt,
  };
}

export function aggregateSignoffStatus(lanes: readonly SignoffLaneEvidence[]): SignoffStatus {
  const required = lanes.filter((lane) => lane.required);
  if (!required.length) return "PENDING";
  if (required.some((lane) => lane.status === "REJECTED")) return "REJECTED";
  const decided = required.every((lane) => lane.status === "APPROVED" || lane.status === "APPROVED_WITH_CONDITIONS");
  if (decided) {
    return required.some((lane) => lane.status === "APPROVED_WITH_CONDITIONS" || lane.openMandatoryConditions > 0)
      ? "APPROVED_WITH_CONDITIONS"
      : "APPROVED";
  }
  return required.some((lane) => lane.status !== "PENDING") ? "UNDER_REVIEW" : "PENDING";
}

export function validateRaciForPublication(assignments: readonly RaciResponsibility[]) {
  const accountable = assignments.filter((assignment) => assignment === "ACCOUNTABLE").length;
  const responsible = assignments.filter((assignment) => assignment === "RESPONSIBLE").length;
  const errors: Record<string, string> = {};
  if (accountable !== 1) errors.accountable = "Exactly one Accountable assignment is required.";
  if (responsible < 1) errors.responsible = "At least one Responsible assignment is required.";
  return { ok: Object.keys(errors).length === 0, errors };
}

export const stage3ContractVersion = "3.0" as const;
