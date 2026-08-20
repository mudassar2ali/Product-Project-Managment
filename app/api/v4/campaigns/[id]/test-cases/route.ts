import { authorizeApi, apiError, apiHeaders, isResponse } from "../../../../v1/api-helpers";
import { validateTestCaseRegistrationInput } from "../../../../../releases/uat-contract";

export const dynamic = "force-dynamic";

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const context = await authorizeApi("uat.view");
  if (isResponse(context)) return context;
  const { id } = await params;
  const { listTestCases } = await import("../../../../../../db/uat");
  const items = await listTestCases(id);
  return Response.json({ data: items, meta: { correlationId: context.correlationId, timestamp: context.timestamp } }, { headers: apiHeaders(context.correlationId) });
}

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const context = await authorizeApi("uat.create");
  if (isResponse(context)) return context;
  let body: unknown;
  try { body = await request.json(); }
  catch { return apiError(400, "INVALID_JSON", "Request body must be valid JSON.", context.correlationId, context.timestamp); }
  const validation = validateTestCaseRegistrationInput(body);
  if (!validation.ok) return apiError(422, "VALIDATION_FAILED", "Review the highlighted fields.", context.correlationId, context.timestamp, validation.details);
  const { id } = await params;
  const { createTestCase } = await import("../../../../../../db/uat");
  const result = await createTestCase(id, validation.value, context.principal.user.userId, context.correlationId);
  const errors = {
    not_found: [404, "CAMPAIGN_NOT_FOUND", "UAT campaign was not found."],
    invalid_requirement: [422, "INVALID_REQUIREMENT", "Select a Requirement that belongs to this Release's Project."],
    invalid_backlog_item: [422, "INVALID_BACKLOG_ITEM", "Select a Backlog item that belongs to this Release's Project."],
  } as const;
  if (result.kind !== "ok") { const error = errors[result.kind]; return apiError(error[0], error[1], error[2], context.correlationId, context.timestamp); }
  return Response.json({ data: result.items, meta: { correlationId: context.correlationId, timestamp: context.timestamp } }, { status: 201, headers: apiHeaders(context.correlationId) });
}
