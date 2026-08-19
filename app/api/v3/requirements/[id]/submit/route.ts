import { authorizeApi, apiError, apiHeaders, isResponse } from "../../../../v1/api-helpers";

export const dynamic = "force-dynamic";

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const context = await authorizeApi("requirement.submit");
  if (isResponse(context)) return context;
  const { consumeRateLimit, rateLimitHeaders, recordOperationalEvent } = await import("../../../../../../db/operations");
  const rateLimit = await consumeRateLimit("GOVERNANCE_SUBMIT", context.principal.user.userId);
  if (!rateLimit.allowed) return apiError(429, "OPERATION_RATE_LIMITED", "Requirement submission is temporarily limited. Try again after the stated interval.", context.correlationId, context.timestamp, [], rateLimitHeaders(rateLimit));
  let body: unknown;
  try { body = await request.json(); }
  catch { return apiError(400, "INVALID_JSON", "Request body must be valid JSON.", context.correlationId, context.timestamp); }
  const expectedVersion = Number((body as Record<string, unknown>)?.version);
  if (!Number.isInteger(expectedVersion) || expectedVersion < 1) return apiError(422, "VERSION_REQUIRED", "Refresh the requirement and try again.", context.correlationId, context.timestamp, { version: "A current record version is required." });
  const { id } = await params;
  const { submitRequirementRevision } = await import("../../../../../../db/requirements");
  const result = await submitRequirementRevision(id, expectedVersion, context.principal.user.userId, context.correlationId);
  if (result.kind === "not_found") { await recordOperationalEvent({ operation: "GOVERNANCE_SUBMIT", outcome: "ERROR", statusCode: 404, durationMs: 0, actorUserId: context.principal.user.userId, correlationId: context.correlationId, entityType: "Requirement", entityId: id }); return apiError(404, "REQUIREMENT_NOT_FOUND", "Requirement was not found.", context.correlationId, context.timestamp); }
  if (result.kind === "locked") return apiError(409, "REQUIREMENT_REVISION_LOCKED", "The current revision is already submitted.", context.correlationId, context.timestamp);
  if (result.kind === "incomplete") return apiError(422, "REQUIREMENT_INCOMPLETE", "Complete the required fields before submitting.", context.correlationId, context.timestamp, Object.fromEntries(result.fields.map((field) => [field, "This field is required before submission."])));
  if (result.kind === "conflict") return apiError(409, "VERSION_CONFLICT", "This requirement changed after you opened it. Refresh and try again.", context.correlationId, context.timestamp);
  await recordOperationalEvent({ operation: "GOVERNANCE_SUBMIT", outcome: "SUCCESS", statusCode: 200, durationMs: 0, actorUserId: context.principal.user.userId, correlationId: context.correlationId, entityType: "Requirement", entityId: id });
  return Response.json({ data: result.workspace, meta: { correlationId: context.correlationId, timestamp: context.timestamp } }, { headers: apiHeaders(context.correlationId, rateLimitHeaders(rateLimit)) });
}
