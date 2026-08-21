import { authorizeApi, apiError, apiHeaders, isResponse } from "../../../../v1/api-helpers";
import { validateExecutionInput } from "../../../../../releases/uat-execution-contract";

export const dynamic = "force-dynamic";

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const context = await authorizeApi("uat.view");
  if (isResponse(context)) return context;
  const { id } = await params;
  const { listExecutions } = await import("../../../../../../db/uat-executions");
  const items = await listExecutions(id);
  return Response.json({ data: items, meta: { correlationId: context.correlationId, timestamp: context.timestamp } }, { headers: apiHeaders(context.correlationId) });
}

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const context = await authorizeApi("uat.execute");
  if (isResponse(context)) return context;
  let body: unknown;
  try { body = await request.json(); }
  catch { return apiError(400, "INVALID_JSON", "Request body must be valid JSON.", context.correlationId, context.timestamp); }
  const validation = validateExecutionInput(body);
  if (!validation.ok) return apiError(422, "VALIDATION_FAILED", "Review the highlighted fields.", context.correlationId, context.timestamp, validation.details);
  const { id } = await params;
  const { recordExecution } = await import("../../../../../../db/uat-executions");
  const result = await recordExecution(id, validation.value, context.principal.user.userId, context.correlationId);
  const errors = {
    not_found: [404, "TEST_CASE_NOT_FOUND", "Test case was not found."],
    test_case_not_ready: [409, "TEST_CASE_NOT_READY", "Only a Ready test case can record an execution."],
    evidence_invalid: [422, "EXECUTION_EVIDENCE_INVALID", "Executor and execution time are required for a recorded result and not allowed for Not Executed."],
  } as const;
  if (result.kind !== "ok") { const error = errors[result.kind]; return apiError(error[0], error[1], error[2], context.correlationId, context.timestamp); }
  return Response.json({ data: result, meta: { correlationId: context.correlationId, timestamp: context.timestamp } }, { status: 201, headers: apiHeaders(context.correlationId) });
}
