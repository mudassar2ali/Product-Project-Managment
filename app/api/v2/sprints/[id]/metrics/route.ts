import { authorizeApi, apiError, apiHeaders, isResponse } from "../../../../v1/api-helpers";

// All responses use cache-control: no-store through the shared API headers.
export const dynamic = "force-dynamic";

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const startedAt = Date.now();
  const context = await authorizeApi("delivery.metrics.view");
  if (isResponse(context)) return context;
  const { id } = await params, { getSprintMetricEvidence } = await import("../../../../../../db/sprint-metrics"), result = await getSprintMetricEvidence(id);
  const { recordOperationalEvent } = await import("../../../../../../db/operations");
  if (result.kind === "not_found") { await recordOperationalEvent({ operation:"SPRINT_METRICS_QUERY",outcome:"REJECTED",statusCode:404,durationMs:Date.now()-startedAt,actorUserId:context.principal.user.userId,correlationId:context.correlationId,entityType:"Sprint",entityId:id,details:{ errorCode:"SPRINT_NOT_FOUND" } }); return apiError(404, "SPRINT_NOT_FOUND", "Sprint was not found.", context.correlationId, context.timestamp); }
  if (result.kind === "no_evidence") { await recordOperationalEvent({ operation:"SPRINT_METRICS_QUERY",outcome:"REJECTED",statusCode:404,durationMs:Date.now()-startedAt,actorUserId:context.principal.user.userId,correlationId:context.correlationId,entityType:"Sprint",entityId:id,details:{ errorCode:"SPRINT_METRICS_NOT_AVAILABLE" } }); return apiError(404, "SPRINT_METRICS_NOT_AVAILABLE", "No calculated delivery evidence is available for this Sprint yet.", context.correlationId, context.timestamp); }
  await recordOperationalEvent({ operation:"SPRINT_METRICS_QUERY",outcome:"SUCCESS",statusCode:200,durationMs:Date.now()-startedAt,actorUserId:context.principal.user.userId,correlationId:context.correlationId,entityType:"Sprint",entityId:id,details:{ velocityPoints:result.velocity.series.length,burndownPoints:result.burndown.length } });
  return Response.json({ data: result, meta: { correlationId: context.correlationId, timestamp: result.current.calculatedAt } }, { headers: apiHeaders(context.correlationId) });
}
