import { authorizeApi, apiError, apiHeaders, isResponse } from "../../../v1/api-helpers";
import { hasPermission } from "../../../../authorization";
import { validateSignoffConditionUpdateInput } from "../../../../governance/signoff-contract";

export const dynamic = "force-dynamic";

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const context = await authorizeApi("signoff.manage");
  if (isResponse(context)) return context;
  let body: unknown;
  try { body = await request.json(); }
  catch { return apiError(400, "INVALID_JSON", "Request body must be valid JSON.", context.correlationId, context.timestamp); }
  const validation = validateSignoffConditionUpdateInput(body);
  if (!validation.ok) return apiError(422, "VALIDATION_FAILED", "Review the highlighted fields.", context.correlationId, context.timestamp, validation.details);
  const expectedVersion = Number((body as Record<string, unknown>).version);
  if (!Number.isInteger(expectedVersion) || expectedVersion < 1) return apiError(422, "VERSION_REQUIRED", "Refresh the condition and try again.", context.correlationId, context.timestamp, { version: "A current record version is required." });
  const { id } = await params;
  const canWaive = hasPermission(context.principal, "signoff.waive_condition");
  const { updateSignoffCondition } = await import("../../../../../db/signoffs");
  const result = await updateSignoffCondition(id, validation.value, expectedVersion, context.principal.user.userId, canWaive, context.correlationId);
  if (result.kind === "not_found") return apiError(404, "SIGNOFF_CONDITION_NOT_FOUND", "The condition was not found.", context.correlationId, context.timestamp);
  if (result.kind === "locked") return apiError(409, "SIGNOFF_CONDITION_LOCKED", "This condition is already closed.", context.correlationId, context.timestamp);
  if (result.kind === "waiver_forbidden") return apiError(403, "WAIVER_FORBIDDEN", "Waiving a condition requires elevated permission.", context.correlationId, context.timestamp);
  if (result.kind === "not_owner") return apiError(403, "NOT_CONDITION_OWNER", "Only the assigned owner can progress or close this condition.", context.correlationId, context.timestamp);
  if (result.kind === "conflict") return apiError(409, "VERSION_CONFLICT", "This condition changed after you opened it. Refresh and try again.", context.correlationId, context.timestamp);
  return Response.json({ data: result, meta: { correlationId: context.correlationId, timestamp: context.timestamp } }, { headers: apiHeaders(context.correlationId) });
}
