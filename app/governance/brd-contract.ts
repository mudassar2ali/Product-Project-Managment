import {
  brdSectionKeys,
  governanceDocumentTypes,
  prdSectionKeys,
  type BrdSectionKey,
  type GovernanceDocumentType,
  type GovernanceSectionKey,
  type PrdSectionKey,
} from "./stage3-contract";

export const brdSectionTemplates: readonly { key: BrdSectionKey; heading: string; required: true }[] = [
  { key: "DOCUMENT_INFORMATION", heading: "Document Information", required: true },
  { key: "EXECUTIVE_SUMMARY", heading: "Executive Summary", required: true },
  { key: "BUSINESS_CONTEXT", heading: "Business Context", required: true },
  { key: "PROBLEM_STATEMENT", heading: "Problem Statement", required: true },
  { key: "BUSINESS_OBJECTIVES", heading: "Business Objectives", required: true },
  { key: "BUSINESS_REQUIREMENTS", heading: "Business Requirements", required: true },
  { key: "SCOPE", heading: "Scope", required: true },
  { key: "OUT_OF_SCOPE", heading: "Out of Scope", required: true },
  { key: "STAKEHOLDERS", heading: "Stakeholders", required: true },
  { key: "CURRENT_STATE", heading: "Current State", required: true },
  { key: "FUTURE_STATE", heading: "Future State", required: true },
  { key: "BUSINESS_PROCESSES", heading: "Business Processes", required: true },
  { key: "FUNCTIONAL_REQUIREMENTS", heading: "Functional Requirements", required: true },
  { key: "NON_FUNCTIONAL_REQUIREMENTS", heading: "Non-Functional Requirements", required: true },
  { key: "BUSINESS_RULES", heading: "Business Rules", required: true },
  { key: "DEPENDENCIES", heading: "Dependencies", required: true },
  { key: "ASSUMPTIONS", heading: "Assumptions", required: true },
  { key: "RISKS", heading: "Risks", required: true },
  { key: "COMPLIANCE_REQUIREMENTS", heading: "Compliance Requirements", required: true },
  { key: "KPIS", heading: "KPIs", required: true },
  { key: "SUCCESS_METRICS", heading: "Success Metrics", required: true },
  { key: "USER_STORIES", heading: "User Stories", required: true },
  { key: "ACCEPTANCE_CRITERIA", heading: "Acceptance Criteria", required: true },
  { key: "UAT_CRITERIA", heading: "UAT Criteria", required: true },
  { key: "SIGN_OFF", heading: "Sign-Off", required: true },
];

export const prdSectionTemplates: readonly { key: PrdSectionKey; heading: string; required: true }[] = [
  { key: "PRODUCT_OVERVIEW", heading: "Product Overview", required: true },
  { key: "PROBLEM", heading: "Problem", required: true },
  { key: "OPPORTUNITY", heading: "Opportunity", required: true },
  { key: "TARGET_USERS", heading: "Target Users", required: true },
  { key: "PERSONAS", heading: "Personas", required: true },
  { key: "USE_CASES", heading: "Use Cases", required: true },
  { key: "OBJECTIVES", heading: "Objectives", required: true },
  { key: "SUCCESS_METRICS", heading: "Success Metrics", required: true },
  { key: "FEATURES", heading: "Features", required: true },
  { key: "FUNCTIONAL_REQUIREMENTS", heading: "Functional Requirements", required: true },
  { key: "NON_FUNCTIONAL_REQUIREMENTS", heading: "Non-Functional Requirements", required: true },
  { key: "USER_STORIES", heading: "User Stories", required: true },
  { key: "ACCEPTANCE_CRITERIA", heading: "Acceptance Criteria", required: true },
  { key: "UX_REQUIREMENTS", heading: "UX Requirements", required: true },
  { key: "ANALYTICS_REQUIREMENTS", heading: "Analytics Requirements", required: true },
  { key: "DEPENDENCIES", heading: "Dependencies", required: true },
  { key: "RISKS", heading: "Risks", required: true },
  { key: "RELEASE_STRATEGY", heading: "Release Strategy", required: true },
  { key: "OUT_OF_SCOPE", heading: "Out of Scope", required: true },
];

export const documentSectionTemplates: Record<GovernanceDocumentType, readonly { key: GovernanceSectionKey; heading: string; required: true }[]> = {
  BRD: brdSectionTemplates,
  PRD: prdSectionTemplates,
};
export const governanceLifecycleFilters = ["DRAFT", "IN_REVIEW", "APPROVED", "APPROVED_WITH_CONDITIONS", "REJECTED", "SUPERSEDED", "RETIRED"] as const;
export const brdLifecycleFilters = governanceLifecycleFilters;
export type GovernanceCompletionStatus = "EMPTY" | "IN_PROGRESS" | "COMPLETE";
export type GovernanceDocumentInput = { productId: string; projectId: string | null; title: string; purpose: string };
export type GovernanceSectionInput = { sectionKey: GovernanceSectionKey; heading: string; sequence: number; contentText: string; required: true; completionStatus: GovernanceCompletionStatus };
export type BrdCompletionStatus = GovernanceCompletionStatus;
export type BrdDocumentInput = GovernanceDocumentInput;
export type BrdSectionInput = GovernanceSectionInput & { sectionKey: BrdSectionKey };
export type PrdDocumentInput = GovernanceDocumentInput;
export type PrdSectionInput = GovernanceSectionInput & { sectionKey: PrdSectionKey };

type Result<T> = { ok: true; value: T } | { ok: false; details: Record<string, string> };
const text = (value: unknown) => typeof value === "string" ? value.trim() : "";
const identifier = (value: unknown) => {
  const candidate = text(value);
  return /^[A-Za-z0-9_-]{1,128}$/.test(candidate) ? candidate : "";
};

export function validateBrdDocumentInput(body: unknown): Result<BrdDocumentInput> {
  const source = body && typeof body === "object" ? body as Record<string, unknown> : {};
  const value: BrdDocumentInput = {
    productId: identifier(source.productId),
    projectId: text(source.projectId) ? identifier(source.projectId) || "INVALID" : null,
    title: text(source.title),
    purpose: text(source.purpose),
  };
  const details: Record<string, string> = {};
  if (!value.productId) details.productId = "Select an active Product.";
  if (value.projectId === "INVALID") details.projectId = "Select a valid Project.";
  if (value.title.length < 3 || value.title.length > 240) details.title = "Title must contain 3–240 characters.";
  if (value.purpose.length > 2000) details.purpose = "Purpose cannot exceed 2,000 characters.";
  return Object.keys(details).length ? { ok: false, details } : { ok: true, value };
}

export const validatePrdDocumentInput = validateBrdDocumentInput;
export const validateGovernanceDocumentInput = validateBrdDocumentInput;

export function parseGovernanceDocumentType(value: unknown, fallback: GovernanceDocumentType | null = null) {
  const candidate = text(value).toUpperCase();
  return governanceDocumentTypes.includes(candidate as GovernanceDocumentType) ? candidate as GovernanceDocumentType : fallback;
}

export function validateGovernanceSections(body: unknown, documentType: GovernanceDocumentType): Result<{ version: number; sections: GovernanceSectionInput[] }> {
  const source = body && typeof body === "object" ? body as Record<string, unknown> : {};
  const version = Number(source.version);
  const input = Array.isArray(source.sections) ? source.sections : [];
  const templates = documentSectionTemplates[documentType];
  const allowedKeys = documentType === "BRD" ? brdSectionKeys : prdSectionKeys;
  const details: Record<string, string> = {};
  if (!Number.isInteger(version) || version < 1) details.version = `Refresh the ${documentType} and try again.`;
  if (input.length !== templates.length) details.sections = `Every ${documentType} section must be supplied exactly once.`;
  const byKey = new Map<string, Record<string, unknown>>();
  input.forEach((item, index) => {
    if (!item || typeof item !== "object") { details[`sections.${index}`] = "Section data is invalid."; return; }
    const record = item as Record<string, unknown>;
    const key = text(record.sectionKey);
    if (!(allowedKeys as readonly string[]).includes(key)) details[`sections.${index}.sectionKey`] = `Section is not allowed for a ${documentType}.`;
    else if (byKey.has(key)) details[`sections.${index}.sectionKey`] = "Section is duplicated.";
    else byKey.set(key, record);
  });
  let totalLength = 0;
  const sections = templates.map((template, index): GovernanceSectionInput => {
    const record = byKey.get(template.key) ?? {};
    const contentText = typeof record.contentText === "string" ? record.contentText.trim() : "";
    const requested = text(record.completionStatus);
    const completionStatus: GovernanceCompletionStatus = contentText
      ? requested === "COMPLETE" ? "COMPLETE" : "IN_PROGRESS"
      : "EMPTY";
    totalLength += contentText.length;
    if (contentText.length > 20_000) details[`sections.${index}.contentText`] = "Section content cannot exceed 20,000 characters.";
    return { sectionKey: template.key, heading: template.heading, sequence: index + 1, contentText, required: true, completionStatus };
  });
  if (totalLength > 250_000) details.sections = `Combined ${documentType} content cannot exceed 250,000 characters.`;
  return Object.keys(details).length ? { ok: false, details } : { ok: true, value: { version, sections } };
}

export function validateBrdSections(body: unknown): Result<{ version: number; sections: BrdSectionInput[] }> {
  return validateGovernanceSections(body, "BRD") as Result<{ version: number; sections: BrdSectionInput[] }>;
}

export function validatePrdSections(body: unknown): Result<{ version: number; sections: PrdSectionInput[] }> {
  return validateGovernanceSections(body, "PRD") as Result<{ version: number; sections: PrdSectionInput[] }>;
}

export function incompleteRequiredSections(sections: readonly GovernanceSectionInput[]) {
  return sections.filter((section) => section.required && (section.completionStatus !== "COMPLETE" || !section.contentText.trim()));
}
