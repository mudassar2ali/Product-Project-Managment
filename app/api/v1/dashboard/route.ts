import { authorizeApi, apiError, apiHeaders, isResponse } from "../api-helpers";

// All responses use cache-control: no-store through the shared API headers.
export const dynamic = "force-dynamic";

export async function GET() {
  const startedAt = Date.now();
  const context = await authorizeApi("dashboard.view");
  if (isResponse(context)) return context;
  try {
    const { getDashboard } = await import("../../../../db/dashboard");
    const data = await getDashboard({
      backlog: context.principal.permissions.includes("backlog.view"),
      sprints: context.principal.permissions.includes("sprint.view"),
      metrics: context.principal.permissions.includes("delivery.metrics.view"),
    });
    const { recordOperationalEvent } = await import("../../../../db/operations");
    await recordOperationalEvent({ operation:"DASHBOARD_QUERY",outcome:"SUCCESS",statusCode:200,durationMs:Date.now()-startedAt,actorUserId:context.principal.user.userId,correlationId:context.correlationId,entityType:"Dashboard",details:{ attentionItems:data.attention.length } });
    return Response.json({ data, meta: { correlationId: context.correlationId, timestamp: context.timestamp } }, { headers: apiHeaders(context.correlationId) });
  } catch {
    const { recordOperationalEvent } = await import("../../../../db/operations");
    await recordOperationalEvent({ operation:"DASHBOARD_QUERY",outcome:"ERROR",statusCode:500,durationMs:Date.now()-startedAt,actorUserId:context.principal.user.userId,correlationId:context.correlationId,entityType:"Dashboard",details:{ errorCode:"DASHBOARD_QUERY_FAILED" } });
    return apiError(500, "DASHBOARD_QUERY_FAILED", "The management dashboard could not be calculated from persisted evidence.", context.correlationId, new Date().toISOString());
  }
}
