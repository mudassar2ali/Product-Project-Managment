import { requirementTypes, type RequirementType } from "./stage3-contract";

export const requirementPriorities = ["LOW", "MEDIUM", "HIGH", "CRITICAL"] as const;
export type RequirementPriority = (typeof requirementPriorities)[number];

export const requirementGovernanceStatuses = ["DRAFT", "IN_REVIEW", "APPROVED", "REJECTED", "SUPERSEDED", "RETIRED"] as const;
export type RequirementGovernanceStatus = (typeof requirementGovernanceStatuses)[number];

export type RequirementRegistrationInput = {
  requirementType: RequirementType;
  productId: string;
  projectId: string | null;
  documentId: string | null;
};

export type RequirementRevisionInput = {
  title: string;
  statement: string;
  rationale: string;
  priority: RequirementPriority;
  verificationMethod: string;
};

type Result<T> = { ok: true; value: T } | { ok: false; details: Record<string, string> };

export function parseRequirementType(value: unknown): RequirementType | null {
  const candidate = (typeof value === "string" ? value.trim() : "").toUpperCase();
  return (requirementTypes as readonly string[]).includes(candidate) ? (candidate as RequirementType) : null;
}

const text = (value: unknown) => (typeof value === "string" ? value.trim() : "");
const identifier = (value: unknown) => {
  const candidate = text(value);
  return /^[A-Za-z0-9_-]{1,128}$/.test(candidate) ? candidate : "";
};

export function validateRequirementRegistrationInput(body: unknown): Result<RequirementRegistrationInput> {
  const source = body && typeof body === "object" ? (body as Record<string, unknown>) : {};
  const requestedType = text(source.requirementType).toUpperCase();
  const requirementType = (requirementTypes as readonly string[]).includes(requestedType) ? (requestedType as RequirementType) : null;
  const value: RequirementRegistrationInput = {
    requirementType: requirementType ?? ("BUSINESS" as RequirementType),
    productId: identifier(source.productId),
    projectId: text(source.projectId) ? identifier(source.projectId) || "INVALID" : null,
    documentId: text(source.documentId) ? identifier(source.documentId) || "INVALID" : null,
  };
  const details: Record<string, string> = {};
  if (!requirementType) details.requirementType = "Select a valid requirement type.";
  if (!value.productId) details.productId = "Select an active Product.";
  if (value.projectId === "INVALID") details.projectId = "Select a valid Project.";
  if (value.documentId === "INVALID") details.documentId = "Select a valid governing document.";
  return Object.keys(details).length ? { ok: false, details } : { ok: true, value };
}

export function validateRequirementRevisionInput(body: unknown): Result<RequirementRevisionInput> {
  const source = body && typeof body === "object" ? (body as Record<string, unknown>) : {};
  const requestedPriority = text(source.priority).toUpperCase();
  const priority = (requirementPriorities as readonly string[]).includes(requestedPriority) ? (requestedPriority as RequirementPriority) : null;
  const value: RequirementRevisionInput = {
    title: text(source.title),
    statement: text(source.statement),
    rationale: text(source.rationale),
    priority: priority ?? "MEDIUM",
    verificationMethod: text(source.verificationMethod),
  };
  const details: Record<string, string> = {};
  if (value.title.length < 3 || value.title.length > 240) details.title = "Title must contain 3–240 characters.";
  if (value.statement.length > 20_000) details.statement = "Statement cannot exceed 20,000 characters.";
  if (value.rationale.length > 20_000) details.rationale = "Rationale cannot exceed 20,000 characters.";
  if (value.verificationMethod.length > 4_000) details.verificationMethod = "Verification method cannot exceed 4,000 characters.";
  if (!priority) details.priority = "Select a valid priority.";
  return Object.keys(details).length ? { ok: false, details } : { ok: true, value };
}

export function incompleteRequirementRevision(revision: RequirementRevisionInput) {
  const missing: string[] = [];
  if (!revision.title.trim()) missing.push("title");
  if (!revision.statement.trim()) missing.push("statement");
  if (!revision.verificationMethod.trim()) missing.push("verificationMethod");
  return missing;
}
