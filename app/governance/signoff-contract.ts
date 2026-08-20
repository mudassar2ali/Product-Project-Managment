import { signoffLaneTypes } from "./stage3-contract";

export type SignoffSubjectType = "DOCUMENT_VERSION" | "REQUIREMENT_REVISION" | "FEASIBILITY_REVISION" | "RELEASE";
export type SignoffLaneType = (typeof signoffLaneTypes)[number];
export type SignoffDecisionValue = "APPROVED" | "APPROVED_WITH_CONDITIONS" | "REJECTED";
export type SignoffConditionTargetStatus = "IN_PROGRESS" | "SATISFIED" | "WAIVED";

export type SignoffLaneRequestInput = {
  laneType: SignoffLaneType;
  required: boolean;
  assignedApproverUserId: string;
};

export type SignoffRequestInput = {
  subjectType: SignoffSubjectType;
  subjectId: string;
  lanes: SignoffLaneRequestInput[];
};

export type SignoffDecisionConditionInput = {
  description: string;
  ownerUserId: string | null;
  dueAt: string | null;
};

export type SignoffDecisionInput = {
  decision: SignoffDecisionValue;
  comment: string;
  conditions: SignoffDecisionConditionInput[];
};

export type SignoffConditionUpdateInput = {
  status: SignoffConditionTargetStatus;
  closureEvidence: string;
};

type Result<T> = { ok: true; value: T } | { ok: false; details: Record<string, string> };

const text = (value: unknown) => (typeof value === "string" ? value.trim() : "");
const identifier = (value: unknown) => {
  const candidate = text(value);
  return /^[A-Za-z0-9_-]{1,128}$/.test(candidate) ? candidate : "";
};

export function validateSignoffRequestInput(body: unknown): Result<SignoffRequestInput> {
  const source = body && typeof body === "object" ? (body as Record<string, unknown>) : {};
  const requestedSubjectType = text(source.subjectType).toUpperCase();
  const subjectType =
    requestedSubjectType === "DOCUMENT_VERSION" || requestedSubjectType === "REQUIREMENT_REVISION" || requestedSubjectType === "FEASIBILITY_REVISION" || requestedSubjectType === "RELEASE"
      ? (requestedSubjectType as SignoffSubjectType)
      : null;
  const subjectId = identifier(source.subjectId);
  const rawLanes = Array.isArray(source.lanes) ? source.lanes : [];
  const seenTypes = new Set<string>();
  const lanes: SignoffLaneRequestInput[] = [];
  let laneInvalid = false;
  for (const rawLane of rawLanes) {
    const laneSource = rawLane && typeof rawLane === "object" ? (rawLane as Record<string, unknown>) : {};
    const requestedLaneType = text(laneSource.laneType).toUpperCase();
    const laneType = (signoffLaneTypes as readonly string[]).includes(requestedLaneType) ? (requestedLaneType as SignoffLaneType) : null;
    const assignedApproverUserId = identifier(laneSource.assignedApproverUserId);
    if (!laneType || !assignedApproverUserId || seenTypes.has(laneType)) { laneInvalid = true; continue; }
    seenTypes.add(laneType);
    lanes.push({ laneType, required: laneSource.required !== false, assignedApproverUserId });
  }
  const value: SignoffRequestInput = { subjectType: subjectType ?? "DOCUMENT_VERSION", subjectId, lanes };
  const details: Record<string, string> = {};
  if (!subjectType) details.subjectType = "Select a valid sign-off subject type.";
  if (!subjectId) details.subjectId = "Select a valid subject.";
  if (!lanes.length) details.lanes = "Provide at least one approver lane.";
  else if (laneInvalid) details.lanes = "Each lane requires a valid, unique type and an assigned approver.";
  else if (!lanes.some((lane) => lane.required)) details.lanes = "At least one lane must be required.";
  return Object.keys(details).length ? { ok: false, details } : { ok: true, value };
}

export function validateSignoffDecisionInput(body: unknown): Result<SignoffDecisionInput> {
  const source = body && typeof body === "object" ? (body as Record<string, unknown>) : {};
  const requested = text(source.decision).toUpperCase();
  const decision = requested === "APPROVED" || requested === "APPROVED_WITH_CONDITIONS" || requested === "REJECTED" ? (requested as SignoffDecisionValue) : null;
  const comment = text(source.comment);
  const rawConditions = Array.isArray(source.conditions) ? source.conditions : [];
  const conditions: SignoffDecisionConditionInput[] = [];
  let conditionInvalid = false;
  for (const rawCondition of rawConditions) {
    const conditionSource = rawCondition && typeof rawCondition === "object" ? (rawCondition as Record<string, unknown>) : {};
    const description = text(conditionSource.description);
    if (!description || description.length > 2000) { conditionInvalid = true; continue; }
    const ownerUserId = identifier(conditionSource.ownerUserId) || null;
    const dueAtRaw = text(conditionSource.dueAt);
    const dueAt = dueAtRaw && !Number.isNaN(Date.parse(dueAtRaw)) ? new Date(dueAtRaw).toISOString() : null;
    conditions.push({ description, ownerUserId, dueAt });
  }
  const details: Record<string, string> = {};
  if (!decision) details.decision = "Select Approved, Approved with Conditions, or Rejected.";
  if (comment.length > 4000) details.comment = "Comment cannot exceed 4,000 characters.";
  if (conditionInvalid) details.conditions = "Each condition requires a description of 1–2,000 characters.";
  if (decision === "APPROVED_WITH_CONDITIONS" && !conditions.length) details.conditions = "Approved with Conditions requires at least one tracked condition.";
  if (decision && decision !== "APPROVED_WITH_CONDITIONS" && rawConditions.length) details.conditions = "Conditions only apply to an Approved with Conditions decision.";
  return Object.keys(details).length ? { ok: false, details } : { ok: true, value: { decision: decision as SignoffDecisionValue, comment, conditions } };
}

export function validateSignoffConditionUpdateInput(body: unknown): Result<SignoffConditionUpdateInput> {
  const source = body && typeof body === "object" ? (body as Record<string, unknown>) : {};
  const requested = text(source.status).toUpperCase();
  const status = requested === "IN_PROGRESS" || requested === "SATISFIED" || requested === "WAIVED" ? (requested as SignoffConditionTargetStatus) : null;
  const closureEvidence = text(source.closureEvidence);
  const details: Record<string, string> = {};
  if (!status) details.status = "Select In Progress, Satisfied, or Waived.";
  if ((status === "SATISFIED" || status === "WAIVED") && !closureEvidence) details.closureEvidence = status === "WAIVED" ? "Provide a waiver reason." : "Provide closure evidence.";
  if (closureEvidence.length > 2000) details.closureEvidence = "Closure evidence cannot exceed 2,000 characters.";
  return Object.keys(details).length ? { ok: false, details } : { ok: true, value: { status: status as SignoffConditionTargetStatus, closureEvidence } };
}
