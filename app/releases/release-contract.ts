import { releaseStatuses, releaseTypes, type ReleaseStatus, type ReleaseType } from "./stage4-contract";

// The manual-transition targets a person may request through PATCH /api/v4/releases/:id.
// SCOPE_LOCKED has its own dedicated lock-scope endpoint (which also requires non-empty scope);
// RELEASED and ROLLED_BACK are automatic side effects of deployment evidence (db/deployments.ts);
// APPROVED/APPROVED_WITH_CONDITIONS/REJECTED are automatic side effects of sign-off decisions
// (db/signoffs.ts). None of those five are reachable through this free-form status field — only
// the four transitions that Section 13 describes as genuine user actions are.
export const manualReleaseStatusTargets = ["CANCELLED", "PLANNING", "IN_UAT", "READY_FOR_SIGNOFF"] as const;

export type ReleaseStatusTransitionInput = { status: ReleaseStatus };

export type ReleaseRegistrationInput = {
  projectId: string;
  name: string;
  releaseType: ReleaseType;
  targetVersion: string;
  plannedDate: string | null;
  ownerUserId: string | null;
};

export type ReleaseMetadataInput = Omit<ReleaseRegistrationInput, "projectId">;

export type ScopeItemInput = { backlogItemId: string };

type Result<T> = { ok: true; value: T } | { ok: false; details: Record<string, string> };

const text = (value: unknown) => (typeof value === "string" ? value.trim() : "");
const identifier = (value: unknown) => {
  const candidate = text(value);
  return /^[A-Za-z0-9_-]{1,128}$/.test(candidate) ? candidate : "";
};
const isoDate = /^\d{4}-\d{2}-\d{2}$/;

export function parseReleaseType(value: unknown): ReleaseType | null {
  const candidate = text(value).toUpperCase();
  return (releaseTypes as readonly string[]).includes(candidate) ? (candidate as ReleaseType) : null;
}

function readMetadataFields(source: Record<string, unknown>) {
  const requestedType = text(source.releaseType).toUpperCase();
  const releaseType = requestedType ? parseReleaseType(requestedType) : "MINOR";
  const name = text(source.name).slice(0, 200);
  const targetVersion = text(source.targetVersion).slice(0, 40);
  const plannedDateRaw = text(source.plannedDate);
  const plannedDate = plannedDateRaw ? plannedDateRaw : null;
  const ownerUserIdRaw = text(source.ownerUserId);
  const ownerUserId = ownerUserIdRaw ? identifier(ownerUserIdRaw) || "INVALID" : null;

  const details: Record<string, string> = {};
  if (!name) details.name = "Enter a Release name.";
  if (!releaseType) details.releaseType = "Select a valid Release type.";
  if (plannedDate !== null && !isoDate.test(plannedDate)) details.plannedDate = "Enter a valid planned date.";
  if (ownerUserId === "INVALID") details.ownerUserId = "Select a valid owner.";

  return {
    details,
    value: {
      name,
      releaseType: releaseType ?? ("MINOR" as ReleaseType),
      targetVersion,
      plannedDate,
      ownerUserId: ownerUserId === "INVALID" ? null : ownerUserId,
    },
  };
}

export function validateReleaseRegistrationInput(body: unknown): Result<ReleaseRegistrationInput> {
  const source = body && typeof body === "object" ? (body as Record<string, unknown>) : {};
  const projectId = identifier(source.projectId);
  const { details, value } = readMetadataFields(source);
  if (!projectId) details.projectId = "Select an active Project.";
  return Object.keys(details).length ? { ok: false, details } : { ok: true, value: { projectId, ...value } };
}

export function validateReleaseMetadataInput(body: unknown): Result<ReleaseMetadataInput> {
  const source = body && typeof body === "object" ? (body as Record<string, unknown>) : {};
  const { details, value } = readMetadataFields(source);
  return Object.keys(details).length ? { ok: false, details } : { ok: true, value };
}

export function validateScopeItemInput(body: unknown): Result<ScopeItemInput> {
  const source = body && typeof body === "object" ? (body as Record<string, unknown>) : {};
  const backlogItemId = identifier(source.backlogItemId);
  const details: Record<string, string> = {};
  if (!backlogItemId) details.backlogItemId = "Select a Backlog item.";
  return Object.keys(details).length ? { ok: false, details } : { ok: true, value: { backlogItemId } };
}

export function parseReleaseStatus(value: unknown): ReleaseStatus | null {
  const candidate = text(value).toUpperCase();
  return (releaseStatuses as readonly string[]).includes(candidate) ? (candidate as ReleaseStatus) : null;
}

export function validateReleaseStatusTransitionInput(body: unknown): Result<ReleaseStatusTransitionInput> {
  const source = body && typeof body === "object" ? (body as Record<string, unknown>) : {};
  const status = parseReleaseStatus(source.status);
  const details: Record<string, string> = {};
  if (!status || !(manualReleaseStatusTargets as readonly string[]).includes(status)) details.status = "Select a valid Release status to move to.";
  return Object.keys(details).length ? { ok: false, details } : { ok: true, value: { status: status as ReleaseStatus } };
}
