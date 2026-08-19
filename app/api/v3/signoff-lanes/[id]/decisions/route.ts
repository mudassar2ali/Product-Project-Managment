import { authorizeApi, apiError, apiHeaders, isResponse } from "../../../../v1/api-helpers";
import { validateSignoffDecisionInput } from "../../../../../governance/signoff-contract";

export const dynamic = "force-dynamic";

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const context = await authorizeApi("signoff.decide");
  if (isResponse(context)) return context;
  const { consumeRateLimit, rateLimitHeaders, recordOperationalEvent } = await import("../../../../../../db/operations");
  const rateLimit = await consumeRateLimit("SIGNOFF_DECISION", context.principal.user.userId);
  if (!rateLimit.allowed) return apiError(429, "OPERATION_RATE_LIMITED", "Sign-off decisions are temporarily limited. Try again after the stated interval.", context.correlationId, context.timestamp, [], rateLimitHeaders(rateLimit));
  let body: unknown;
  try { body = await request.json(); }
  catch { return apiError(400, "INVALID_JSON", "Request body must be valid JSON.", context.correlationId, context.timestamp); }
  const validation = validateSignoffDecisionInput(body);
  if (!validation.ok) return apiError(422, "VALIDATION_FAILED", "Review the highlighted fields.", context.correlationId, context.timestamp, validation.details);
  const { id } = await params;
  const { recordSignoffDecision } = await import("../../../../../../db/signoffs");
  const result = await recordSignoffDecision(id, validation.value, context.principal.user.userId, context.correlationId);
  const errors = {
    not_found: [404, "SIGNOFF_LANE_NOT_FOUND", "The sign-off lane was not found."],
    not_assigned: [403, "NOT_ASSIGNED_APPROVER", "Only the assigned approver may record this lane's decision."],
    already_decided: [409, "LANE_ALREADY_DECIDED", "This lane has already recorded a decision."],
    request_closed: [409, "SIGNOFF_REQUEST_CLOSED", "This sign-off request is already closed."],
    self_approval_forbidden: [403, "SELF_APPROVAL_FORBIDDEN", "You cannot approve a subject you authored."],
    conflict: [409, "SIGNOFF_LANE_CONFLICT", "This lane changed since you loaded it. Reload and try again."],
  } as const;
  if (result.kind !== "ok") {
    const error = errors[result.kind];
    await recordOperationalEvent({ operation: "SIGNOFF_DECISION", outcome: "REJECTED", statusCode: error[0], durationMs: 0, actorUserId: context.principal.user.userId, correlationId: context.correlationId, entityType: "SignoffLane", entityId: id, details: { errorCode: error[1] } });
    return apiError(error[0], error[1], error[2], context.correlationId, context.timestamp);
  }
  await recordOperationalEvent({ operation: "SIGNOFF_DECISION", outcome: "SUCCESS", statusCode: 201, durationMs: 0, actorUserId: context.principal.user.userId, correlationId: context.correlationId, entityType: "SignoffLane", entityId: id });
  return Response.json({ data: result, meta: { correlationId: context.correlationId, timestamp: context.timestamp } }, { status: 201, headers: apiHeaders(context.correlationId, rateLimitHeaders(rateLimit)) });
}
