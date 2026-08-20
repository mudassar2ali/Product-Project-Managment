import { defectSeverities, defectSources, defectStatuses, type DefectSeverity, type DefectSource, type DefectStatus } from "./stage4-contract";

export type DefectCreationInput = {
  projectId: string;
  releaseId: string | null;
  source: DefectSource;
  severity: DefectSeverity;
  title: string;
  description: string;
  stepsToReproduce: string;
  backlogItemId: string | null;
  assignedToUserId: string | null;
};

export type DefectProgressInput = {
  status: DefectStatus;
  assignedToUserId: string | null;
  backlogItemId: string | null;
};

export type DefectClosureInput = {
  status: DefectStatus;
  duplicateOfId: string | null;
};

type Result<T> = { ok: true; value: T } | { ok: false; details: Record<string, string> };

const closingStatuses = new Set(["CLOSED", "DEFERRED", "DUPLICATE"]);

const text = (value: unknown) => (typeof value === "string" ? value.trim() : "");
const identifier = (value: unknown) => {
  const candidate = text(value);
  return /^[A-Za-z0-9_-]{1,128}$/.test(candidate) ? candidate : "";
};

export function parseDefectSeverity(value: unknown): DefectSeverity | null {
  const candidate = text(value).toUpperCase();
  return (defectSeverities as readonly string[]).includes(candidate) ? (candidate as DefectSeverity) : null;
}

export function parseDefectSource(value: unknown): DefectSource | null {
  const candidate = text(value).toUpperCase();
  return (defectSources as readonly string[]).includes(candidate) ? (candidate as DefectSource) : null;
}

export function parseDefectStatus(value: unknown): DefectStatus | null {
  const candidate = text(value).toUpperCase();
  return (defectStatuses as readonly string[]).includes(candidate) ? (candidate as DefectStatus) : null;
}

export function validateDefectCreationInput(body: unknown): Result<DefectCreationInput> {
  const source = body && typeof body === "object" ? (body as Record<string, unknown>) : {};
  const projectId = identifier(source.projectId);
  const releaseIdRaw = text(source.releaseId);
  const releaseId = releaseIdRaw ? identifier(releaseIdRaw) || "INVALID" : null;
  const requestedSource = text(source.source).toUpperCase();
  const defectSource = requestedSource ? parseDefectSource(requestedSource) : "INTERNAL";
  const requestedSeverity = text(source.severity).toUpperCase();
  const severity = requestedSeverity ? parseDefectSeverity(requestedSeverity) : "MEDIUM";
  const title = text(source.title).slice(0, 200);
  const description = text(source.description).slice(0, 4000);
  const stepsToReproduce = text(source.stepsToReproduce).slice(0, 4000);
  const backlogItemIdRaw = text(source.backlogItemId);
  const backlogItemId = backlogItemIdRaw ? identifier(backlogItemIdRaw) || "INVALID" : null;
  const assignedToUserIdRaw = text(source.assignedToUserId);
  const assignedToUserId = assignedToUserIdRaw ? identifier(assignedToUserIdRaw) || "INVALID" : null;

  const details: Record<string, string> = {};
  if (!projectId) details.projectId = "Select a Project.";
  if (releaseId === "INVALID") details.releaseId = "Select a valid Release.";
  if (!defectSource) details.source = "Select a valid defect source.";
  if (!severity) details.severity = "Select a valid defect severity.";
  if (!title) details.title = "Enter a defect title.";
  if (backlogItemId === "INVALID") details.backlogItemId = "Select a valid Backlog item.";
  if (assignedToUserId === "INVALID") details.assignedToUserId = "Select a valid assignee.";

  return Object.keys(details).length
    ? { ok: false, details }
    : {
      ok: true,
      value: {
        projectId,
        releaseId: releaseId === "INVALID" ? null : releaseId,
        source: defectSource ?? ("INTERNAL" as DefectSource),
        severity: severity ?? ("MEDIUM" as DefectSeverity),
        title,
        description,
        stepsToReproduce,
        backlogItemId: backlogItemId === "INVALID" ? null : backlogItemId,
        assignedToUserId: assignedToUserId === "INVALID" ? null : assignedToUserId,
      },
    };
}

export function validateDefectProgressInput(body: unknown): Result<DefectProgressInput> {
  const source = body && typeof body === "object" ? (body as Record<string, unknown>) : {};
  const requestedStatus = text(source.status).toUpperCase();
  const status = requestedStatus ? parseDefectStatus(requestedStatus) : null;
  const assignedToUserIdRaw = text(source.assignedToUserId);
  const assignedToUserId = assignedToUserIdRaw ? identifier(assignedToUserIdRaw) || "INVALID" : null;
  const backlogItemIdRaw = text(source.backlogItemId);
  const backlogItemId = backlogItemIdRaw ? identifier(backlogItemIdRaw) || "INVALID" : null;

  const details: Record<string, string> = {};
  if (!status) details.status = "Select a valid defect status.";
  else if (closingStatuses.has(status)) details.status = "Use the close action for Closed, Deferred or Duplicate.";
  if (assignedToUserId === "INVALID") details.assignedToUserId = "Select a valid assignee.";
  if (backlogItemId === "INVALID") details.backlogItemId = "Select a valid Backlog item.";

  return Object.keys(details).length
    ? { ok: false, details }
    : {
      ok: true,
      value: {
        status: status ?? ("OPEN" as DefectStatus),
        assignedToUserId: assignedToUserId === "INVALID" ? null : assignedToUserId,
        backlogItemId: backlogItemId === "INVALID" ? null : backlogItemId,
      },
    };
}

export function validateDefectClosureInput(body: unknown): Result<DefectClosureInput> {
  const source = body && typeof body === "object" ? (body as Record<string, unknown>) : {};
  const requestedStatus = text(source.status).toUpperCase();
  const status = requestedStatus ? parseDefectStatus(requestedStatus) : null;
  const duplicateOfIdRaw = text(source.duplicateOfId);
  const duplicateOfId = duplicateOfIdRaw ? identifier(duplicateOfIdRaw) || "INVALID" : null;

  const details: Record<string, string> = {};
  if (!status || !closingStatuses.has(status)) details.status = "Select Closed, Deferred or Duplicate.";
  if (duplicateOfId === "INVALID") details.duplicateOfId = "Select a valid defect to mark as the duplicate target.";
  if (status === "DUPLICATE" && !duplicateOfId) details.duplicateOfId = "A duplicate requires the defect it duplicates.";
  if (status !== "DUPLICATE" && duplicateOfId && duplicateOfId !== "INVALID") details.duplicateOfId = "A duplicate target is only allowed when marking Duplicate.";

  return Object.keys(details).length
    ? { ok: false, details }
    : { ok: true, value: { status: status ?? ("CLOSED" as DefectStatus), duplicateOfId: duplicateOfId === "INVALID" ? null : duplicateOfId } };
}
