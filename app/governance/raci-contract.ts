import { raciResponsibilities, validateRaciForPublication, type RaciResponsibility } from "./stage3-contract";

export const raciGovernedSubjectTypes = ["DOCUMENT", "REQUIREMENT", "REVIEW", "DELIVERY", "FEASIBILITY"] as const;
export type RaciGovernedSubjectType = (typeof raciGovernedSubjectTypes)[number];

export type RaciStakeholderInput = {
  key: string;
  id: string | null;
  displayName: string;
  function: string;
  organization: string;
  userId: string | null;
};

export type RaciAssignmentInput = {
  stakeholderKey: string;
  responsibility: RaciResponsibility;
};

export type RaciActivityInput = {
  activityKey: string;
  name: string;
  sequence: number;
  governedSubjectType: RaciGovernedSubjectType | null;
  governedSubjectId: string | null;
  assignments: RaciAssignmentInput[];
};

export type RaciMatrixPutInput = {
  title: string;
  expectedVersion: number;
  stakeholders: RaciStakeholderInput[];
  activities: RaciActivityInput[];
  publish: boolean;
};

type Result<T> = { ok: true; value: T } | { ok: false; details: Record<string, string> };

const text = (value: unknown) => (typeof value === "string" ? value.trim() : "");
const identifier = (value: unknown) => {
  const candidate = text(value);
  return /^[A-Za-z0-9_-]{1,128}$/.test(candidate) ? candidate : "";
};

export function validateRaciMatrixPutInput(body: unknown): Result<RaciMatrixPutInput> {
  const source = body && typeof body === "object" ? (body as Record<string, unknown>) : {};
  const title = text(source.title);
  const publish = source.publish === true;
  const expectedVersion = Number(source.version);
  const details: Record<string, string> = {};
  if (title.length < 1 || title.length > 240) details.title = "Title must contain 1–240 characters.";
  if (!Number.isInteger(expectedVersion) || expectedVersion < 0) details.version = "A current record version is required.";

  const rawStakeholders = Array.isArray(source.stakeholders) ? source.stakeholders : [];
  const stakeholders: RaciStakeholderInput[] = [];
  const stakeholderKeys = new Set<string>();
  let stakeholderInvalid = false;
  rawStakeholders.forEach((rawStakeholder, index) => {
    const stakeholderSource = rawStakeholder && typeof rawStakeholder === "object" ? (rawStakeholder as Record<string, unknown>) : {};
    const displayName = text(stakeholderSource.displayName);
    const key = identifier(stakeholderSource.key) || `stakeholder-${index}`;
    if (!displayName || displayName.length > 160 || stakeholderKeys.has(key)) { stakeholderInvalid = true; return; }
    stakeholderKeys.add(key);
    stakeholders.push({
      key,
      id: identifier(stakeholderSource.id) || null,
      displayName,
      function: text(stakeholderSource.function).slice(0, 160),
      organization: text(stakeholderSource.organization).slice(0, 160),
      userId: identifier(stakeholderSource.userId) || null,
    });
  });
  if (stakeholderInvalid) details.stakeholders = "Each stakeholder needs a unique reference and a display name of 1–160 characters.";

  const rawActivities = Array.isArray(source.activities) ? source.activities : [];
  const activities: RaciActivityInput[] = [];
  const activityKeys = new Set<string>();
  let activityInvalid = false;
  let assignmentInvalid = false;
  let publicationInvalid = false;
  rawActivities.forEach((rawActivity, index) => {
    const activitySource = rawActivity && typeof rawActivity === "object" ? (rawActivity as Record<string, unknown>) : {};
    const activityKey = identifier(activitySource.activityKey) || `activity-${index}`;
    const name = text(activitySource.name);
    if (!/^[A-Za-z0-9_-]{1,64}$/.test(activityKey) || !name || name.length > 200 || activityKeys.has(activityKey)) { activityInvalid = true; return; }
    activityKeys.add(activityKey);
    const requestedSubjectType = text(activitySource.governedSubjectType).toUpperCase();
    const governedSubjectType = (raciGovernedSubjectTypes as readonly string[]).includes(requestedSubjectType) ? (requestedSubjectType as RaciGovernedSubjectType) : null;
    const governedSubjectId = identifier(activitySource.governedSubjectId) || null;
    if (requestedSubjectType && !governedSubjectType) { activityInvalid = true; return; }
    if (governedSubjectType && !governedSubjectId) { activityInvalid = true; return; }

    const rawAssignments = Array.isArray(activitySource.assignments) ? activitySource.assignments : [];
    const assignments: RaciAssignmentInput[] = [];
    const assignmentStakeholders = new Set<string>();
    for (const rawAssignment of rawAssignments) {
      const assignmentSource = rawAssignment && typeof rawAssignment === "object" ? (rawAssignment as Record<string, unknown>) : {};
      const stakeholderKey = identifier(assignmentSource.stakeholderKey);
      const requestedResponsibility = text(assignmentSource.responsibility).toUpperCase();
      const responsibility = (raciResponsibilities as readonly string[]).includes(requestedResponsibility) ? (requestedResponsibility as RaciResponsibility) : null;
      if (!stakeholderKey || !responsibility || assignmentStakeholders.has(stakeholderKey)) { assignmentInvalid = true; continue; }
      assignmentStakeholders.add(stakeholderKey);
      assignments.push({ stakeholderKey, responsibility });
    }
    if (publish) {
      const publication = validateRaciForPublication(assignments.map((assignment) => assignment.responsibility));
      if (!publication.ok) publicationInvalid = true;
    }
    activities.push({
      activityKey,
      name,
      sequence: Number.isInteger(activitySource.sequence) ? Number(activitySource.sequence) : index + 1,
      governedSubjectType,
      governedSubjectId,
      assignments,
    });
  });
  if (activityInvalid) details.activities = "Each activity needs a unique key (1–64 characters), a name (1–200 characters), and a governed subject type only when a subject is referenced.";
  if (assignmentInvalid) details.assignments = "Each assignment needs a stakeholder and a valid responsibility, and a stakeholder may hold at most one responsibility per activity.";
  if (publish && !activities.length) details.activities = "At least one activity is required before publication.";
  if (publish && publicationInvalid) details.publication = "Every activity requires exactly one Accountable and at least one Responsible assignment before publication.";

  const value: RaciMatrixPutInput = { title, expectedVersion: Number.isInteger(expectedVersion) ? expectedVersion : 0, stakeholders, activities, publish };
  return Object.keys(details).length ? { ok: false, details } : { ok: true, value };
}
