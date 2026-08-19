import { authorizeApi, apiError, apiHeaders, isResponse } from "../../v1/api-helpers";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const context = await authorizeApi("traceability.view");
  if (isResponse(context)) return context;
  const { consumeRateLimit, rateLimitHeaders, recordOperationalEvent } = await import("../../../../db/operations");
  const rateLimit = await consumeRateLimit("TRACEABILITY_QUERY", context.principal.user.userId);
  if (!rateLimit.allowed) {
    await recordOperationalEvent({ operation: "TRACEABILITY_QUERY", outcome: "RATE_LIMITED", statusCode: 429, durationMs: 0, actorUserId: context.principal.user.userId, correlationId: context.correlationId });
    return apiError(429, "OPERATION_RATE_LIMITED", "Traceability queries are temporarily limited. Try again after the stated interval.", context.correlationId, context.timestamp, [], rateLimitHeaders(rateLimit));
  }
  const url = new URL(request.url);
  const { getPortfolioTraceability } = await import("../../../../db/requirement-coverage");
  const result = await getPortfolioTraceability({
    productId: (url.searchParams.get("productId") ?? "").slice(0, 128),
    projectId: (url.searchParams.get("projectId") ?? "").slice(0, 128),
  });
  await recordOperationalEvent({ operation: "TRACEABILITY_QUERY", outcome: "SUCCESS", statusCode: 200, durationMs: 0, actorUserId: context.principal.user.userId, correlationId: context.correlationId, details: { items: result.items.length, gaps: result.gaps.length } });
  return Response.json(
    {
      data: { items: result.items, gaps: result.gaps, coverage: result.coverage },
      meta: { total: result.items.length, gapCount: result.gaps.length, calculatedAt: result.calculatedAt, correlationId: context.correlationId, timestamp: context.timestamp },
    },
    { headers: apiHeaders(context.correlationId, rateLimitHeaders(rateLimit)) },
  );
}
