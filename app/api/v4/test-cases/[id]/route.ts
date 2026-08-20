import { authorizeApi, apiError, apiHeaders, isResponse } from "../../../v1/api-helpers";
import { validateTestCaseRegistrationInput } from "../../../../releases/uat-contract";

export const dynamic = "force-dynamic";

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const context = await authorizeApi("uat.edit");
  if (isResponse(context)) return context;
  let body: unknown;
  try { body = await request.json(); }
  catch { return apiError(400, "INVALID_JSON", "Request body must be valid JSON.", context.correlationId, context.timestamp); }
  const validation = validateTestCaseRegistrationInput(body);
  if (!validation.ok) return apiError(422, "VALIDATION_FAILED", "Review the highlighted fields.", context.correlationId, context.timestamp, validation.details);
  const version = Number((body as Record<string, unknown>).version);
  if (!Number.isInteger(version) || version < 1) return apiError(422, "VERSION_REQUIRED", "Refresh the test case and try again.", context.correlationId, context.timestamp, { version: "A current record version is required." });
  const { id } = await params;
  const { updateTestCase } = await import("../../../../../db/uat");
  const result = await updateTestCase(id, validation.value, version, context.principal.user.userId, context.correlationId);
  const errors = {
    not_found: [404, "TEST_CASE_NOT_FOUND", "Test case was not found."],
    locked: [409, "TEST_CASE_LOCKED", "Only a Draft test case can be edited."],
    conflict: [409, "VERSION_CONFLICT", "This test case changed after you opened it. Refresh and try again."],
    invalid_requirement: [422, "INVALID_REQUIREMENT", "Select a Requirement that belongs to this Release's Project."],
    invalid_backlog_item: [422, "INVALID_BACKLOG_ITEM", "Select a Backlog item that belongs to this Release's Project."],
  } as const;
  if (result.kind !== "ok") { const error = errors[result.kind]; return apiError(error[0], error[1], error[2], context.correlationId, context.timestamp); }
  return Response.json({ data: result.items, meta: { correlationId: context.correlationId, timestamp: context.timestamp } }, { headers: apiHeaders(context.correlationId) });
}
