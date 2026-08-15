import { brdSectionKeys, type BrdSectionKey } from "./stage3-contract";

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

export const brdLifecycleFilters = ["DRAFT", "IN_REVIEW", "APPROVED", "APPROVED_WITH_CONDITIONS", "REJECTED", "SUPERSEDED", "RETIRED"] as const;
export type BrdCompletionStatus = "EMPTY" | "IN_PROGRESS" | "COMPLETE";
export type BrdDocumentInput = { productId: string; projectId: string | null; title: string; purpose: string };
export type BrdSectionInput = { sectionKey: BrdSectionKey; heading: string; sequence: number; contentText: string; required: true; completionStatus: BrdCompletionStatus };

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

export function validateBrdSections(body: unknown): Result<{ version: number; sections: BrdSectionInput[] }> {
  const source = body && typeof body === "object" ? body as Record<string, unknown> : {};
  const version = Number(source.version);
  const input = Array.isArray(source.sections) ? source.sections : [];
  const details: Record<string, string> = {};
  if (!Number.isInteger(version) || version < 1) details.version = "Refresh the BRD and try again.";
  if (input.length !== brdSectionTemplates.length) details.sections = "Every BRD section must be supplied exactly once.";
  const byKey = new Map<string, Record<string, unknown>>();
  input.forEach((item, index) => {
    if (!item || typeof item !== "object") { details[`sections.${index}`] = "Section data is invalid."; return; }
    const record = item as Record<string, unknown>;
    const key = text(record.sectionKey);
    if (!brdSectionKeys.includes(key as BrdSectionKey)) details[`sections.${index}.sectionKey`] = "Section is not allowed for a BRD.";
    else if (byKey.has(key)) details[`sections.${index}.sectionKey`] = "Section is duplicated.";
    else byKey.set(key, record);
  });
  let totalLength = 0;
  const sections = brdSectionTemplates.map((template, index): BrdSectionInput => {
    const record = byKey.get(template.key) ?? {};
    const contentText = typeof record.contentText === "string" ? record.contentText.trim() : "";
    const requested = text(record.completionStatus);
    const completionStatus: BrdCompletionStatus = contentText
      ? requested === "COMPLETE" ? "COMPLETE" : "IN_PROGRESS"
      : "EMPTY";
    totalLength += contentText.length;
    if (contentText.length > 20_000) details[`sections.${index}.contentText`] = "Section content cannot exceed 20,000 characters.";
    return { sectionKey: template.key, heading: template.heading, sequence: index + 1, contentText, required: true, completionStatus };
  });
  if (totalLength > 250_000) details.sections = "Combined BRD content cannot exceed 250,000 characters.";
  return Object.keys(details).length ? { ok: false, details } : { ok: true, value: { version, sections } };
}

export function incompleteRequiredSections(sections: readonly BrdSectionInput[]) {
  return sections.filter((section) => section.required && (section.completionStatus !== "COMPLETE" || !section.contentText.trim()));
}
