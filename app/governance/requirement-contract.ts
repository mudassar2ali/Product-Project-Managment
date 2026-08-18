import { requirementBacklogLinkTypes, requirementRelationshipTypes, requirementTypes, type RequirementType } from "./stage3-contract";

export type RequirementRelationshipType = (typeof requirementRelationshipTypes)[number];
export type RequirementBacklogLinkType = (typeof requirementBacklogLinkTypes)[number];

export type RequirementRelationshipInput = {
  targetRequirementId: string;
  relationshipType: RequirementRelationshipType;
  rationale: string;
};

export type RequirementBacklogLinkInput = {
  backlogItemId: string;
  linkType: RequirementBacklogLinkType;
  coveragePercentage: number | null;
  rationale: string;
};

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

export function validateRequirementRelationshipInput(body: unknown): Result<RequirementRelationshipInput> {
  const source = body && typeof body === "object" ? (body as Record<string, unknown>) : {};
  const requestedType = text(source.relationshipType).toUpperCase();
  const relationshipType = (requirementRelationshipTypes as readonly string[]).includes(requestedType) ? (requestedType as RequirementRelationshipType) : null;
  const value: RequirementRelationshipInput = {
    targetRequirementId: identifier(source.targetRequirementId),
    relationshipType: relationshipType ?? ("DERIVES_FROM" as RequirementRelationshipType),
    rationale: text(source.rationale),
  };
  const details: Record<string, string> = {};
  if (!value.targetRequirementId) details.targetRequirementId = "Select a target Requirement.";
  if (!relationshipType) details.relationshipType = "Select a valid relationship type.";
  if (value.rationale.length > 2_000) details.rationale = "Rationale cannot exceed 2,000 characters.";
  return Object.keys(details).length ? { ok: false, details } : { ok: true, value };
}

export function validateRequirementBacklogLinkInput(body: unknown): Result<RequirementBacklogLinkInput> {
  const source = body && typeof body === "object" ? (body as Record<string, unknown>) : {};
  const requestedType = text(source.linkType).toUpperCase();
  const linkType = (requirementBacklogLinkTypes as readonly string[]).includes(requestedType) ? (requestedType as RequirementBacklogLinkType) : null;
  const rawCoverage = source.coveragePercentage;
  const coveragePercentage = rawCoverage === "" || rawCoverage === null || rawCoverage === undefined ? null : Number(rawCoverage);
  const value: RequirementBacklogLinkInput = {
    backlogItemId: identifier(source.backlogItemId),
    linkType: linkType ?? ("IMPLEMENTS" as RequirementBacklogLinkType),
    coveragePercentage: coveragePercentage === null || Number.isNaN(coveragePercentage) ? null : Math.round(coveragePercentage),
    rationale: text(source.rationale),
  };
  const details: Record<string, string> = {};
  if (!value.backlogItemId) details.backlogItemId = "Select a Backlog item.";
  if (!linkType) details.linkType = "Select a valid link type.";
  if (value.rationale.length > 2_000) details.rationale = "Rationale cannot exceed 2,000 characters.";
  if (linkType === "PARTIALLY_IMPLEMENTS") {
    if (value.coveragePercentage === null || value.coveragePercentage < 1 || value.coveragePercentage > 99) details.coveragePercentage = "Provide a coverage percentage between 1 and 99.";
    if (!value.rationale) details.rationale = "Explain the partial coverage.";
  } else if (value.coveragePercentage !== null) {
    details.coveragePercentage = "Coverage percentage only applies to partial implementation.";
  }
  return Object.keys(details).length ? { ok: false, details } : { ok: true, value };
}

export function incompleteRequirementRevision(revision: RequirementRevisionInput) {
  const missing: string[] = [];
  if (!revision.title.trim()) missing.push("title");
  if (!revision.statement.trim()) missing.push("statement");
  if (!revision.verificationMethod.trim()) missing.push("verificationMethod");
  return missing;
}
