import { authorizeApi, apiError, apiHeaders, isResponse } from "../../../../v1/api-helpers";

export const dynamic = "force-dynamic";

export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const context = await authorizeApi("release.readiness");
  if (isResponse(context)) return context;
  const { id } = await params;
  const { consumeRateLimit, rateLimitHeaders, recordOperationalEvent } = await import("../../../../../../db/operations");
  const rateLimit = await consumeRateLimit("READINESS_RECALCULATE", context.principal.user.userId);
  if (!rateLimit.allowed) return apiError(429, "OPERATION_RATE_LIMITED", "Too many readiness recalculations. Try again shortly.", context.correlationId, context.timestamp, [], rateLimitHeaders(rateLimit));
  const { calculateAndPersistReadiness } = await import("../../../../../../db/release-readiness");
  const result = await calculateAndPersistReadiness(id, context.principal.user.userId, context.correlationId);
  if (result.kind !== "ok") {
    await recordOperationalEvent({ operation: "READINESS_RECALCULATE", outcome: "ERROR", statusCode: 404, durationMs: 0, actorUserId: context.principal.user.userId, correlationId: context.correlationId, entityType: "Release", entityId: id });
    return apiError(404, "RELEASE_NOT_FOUND", "Release was not found.", context.correlationId, context.timestamp);
  }
  await recordOperationalEvent({ operation: "READINESS_RECALCULATE", outcome: "SUCCESS", statusCode: 200, durationMs: 0, actorUserId: context.principal.user.userId, correlationId: context.correlationId, entityType: "Release", entityId: id });
  return Response.json({ data: result.snapshot, meta: { correlationId: context.correlationId, timestamp: context.timestamp } }, { headers: apiHeaders(context.correlationId, rateLimitHeaders(rateLimit)) });
}
