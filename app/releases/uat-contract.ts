import { testCasePriorities, testCaseStatuses, type TestCaseStatus } from "./stage4-contract";

export type CampaignRegistrationInput = {
  name: string;
  entryCriteria: string;
  exitCriteria: string;
  plannedStartDate: string | null;
  plannedEndDate: string | null;
  ownerUserId: string | null;
};

export type TestCasePriority = (typeof testCasePriorities)[number];

export type TestCaseRegistrationInput = {
  requirementId: string | null;
  backlogItemId: string | null;
  title: string;
  preconditions: string;
  steps: string;
  expectedResult: string;
  priority: TestCasePriority;
  status: TestCaseStatus;
};

type Result<T> = { ok: true; value: T } | { ok: false; details: Record<string, string> };

const text = (value: unknown) => (typeof value === "string" ? value.trim() : "");
const identifier = (value: unknown) => {
  const candidate = text(value);
  return /^[A-Za-z0-9_-]{1,128}$/.test(candidate) ? candidate : "";
};
const isoDate = /^\d{4}-\d{2}-\d{2}$/;

export function parseTestCasePriority(value: unknown): TestCasePriority | null {
  const candidate = text(value).toUpperCase();
  return (testCasePriorities as readonly string[]).includes(candidate) ? (candidate as TestCasePriority) : null;
}

export function parseTestCaseStatus(value: unknown): TestCaseStatus | null {
  const candidate = text(value).toUpperCase();
  return (testCaseStatuses as readonly string[]).includes(candidate) ? (candidate as TestCaseStatus) : null;
}

export function validateCampaignRegistrationInput(body: unknown): Result<CampaignRegistrationInput> {
  const source = body && typeof body === "object" ? (body as Record<string, unknown>) : {};
  const name = text(source.name).slice(0, 200);
  const entryCriteria = text(source.entryCriteria).slice(0, 4000);
  const exitCriteria = text(source.exitCriteria).slice(0, 4000);
  const plannedStartDateRaw = text(source.plannedStartDate);
  const plannedEndDateRaw = text(source.plannedEndDate);
  const ownerUserIdRaw = text(source.ownerUserId);
  const ownerUserId = ownerUserIdRaw ? identifier(ownerUserIdRaw) || "INVALID" : null;

  const details: Record<string, string> = {};
  if (!name) details.name = "Enter a UAT campaign name.";
  if (plannedStartDateRaw && !isoDate.test(plannedStartDateRaw)) details.plannedStartDate = "Enter a valid planned start date.";
  if (plannedEndDateRaw && !isoDate.test(plannedEndDateRaw)) details.plannedEndDate = "Enter a valid planned end date.";
  if (plannedStartDateRaw && plannedEndDateRaw && isoDate.test(plannedStartDateRaw) && isoDate.test(plannedEndDateRaw) && plannedEndDateRaw < plannedStartDateRaw) details.plannedEndDate = "Planned end date must be on or after the planned start date.";
  if (ownerUserId === "INVALID") details.ownerUserId = "Select a valid owner.";

  return Object.keys(details).length
    ? { ok: false, details }
    : {
      ok: true,
      value: {
        name,
        entryCriteria,
        exitCriteria,
        plannedStartDate: plannedStartDateRaw || null,
        plannedEndDate: plannedEndDateRaw || null,
        ownerUserId: ownerUserId === "INVALID" ? null : ownerUserId,
      },
    };
}

export function validateTestCaseRegistrationInput(body: unknown): Result<TestCaseRegistrationInput> {
  const source = body && typeof body === "object" ? (body as Record<string, unknown>) : {};
  const requirementIdRaw = text(source.requirementId);
  const requirementId = requirementIdRaw ? identifier(requirementIdRaw) || "INVALID" : null;
  const backlogItemIdRaw = text(source.backlogItemId);
  const backlogItemId = backlogItemIdRaw ? identifier(backlogItemIdRaw) || "INVALID" : null;
  const title = text(source.title).slice(0, 200);
  const preconditions = text(source.preconditions).slice(0, 2000);
  const steps = text(source.steps).slice(0, 8000);
  const expectedResult = text(source.expectedResult).slice(0, 4000);
  const requestedPriority = text(source.priority).toUpperCase();
  const priority = requestedPriority ? parseTestCasePriority(requestedPriority) : "MEDIUM";
  const requestedStatus = text(source.status).toUpperCase();
  const status = requestedStatus ? parseTestCaseStatus(requestedStatus) : "DRAFT";

  const details: Record<string, string> = {};
  if (!title) details.title = "Enter a test case title.";
  if (!steps) details.steps = "Enter the test steps.";
  if (!expectedResult) details.expectedResult = "Enter the expected result.";
  if (!priority) details.priority = "Select a valid priority.";
  if (!status) details.status = "Select a valid status.";
  if (requirementId === "INVALID") details.requirementId = "Select a valid Requirement.";
  if (backlogItemId === "INVALID") details.backlogItemId = "Select a valid Backlog item.";

  return Object.keys(details).length
    ? { ok: false, details }
    : {
      ok: true,
      value: {
        requirementId: requirementId === "INVALID" ? null : requirementId,
        backlogItemId: backlogItemId === "INVALID" ? null : backlogItemId,
        title,
        preconditions,
        steps,
        expectedResult,
        priority: priority ?? ("MEDIUM" as TestCasePriority),
        status: status ?? ("DRAFT" as TestCaseStatus),
      },
    };
}
