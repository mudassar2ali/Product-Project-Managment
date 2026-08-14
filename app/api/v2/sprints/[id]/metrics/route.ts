import { authorizeApi, apiError, isResponse } from "../../../../v1/api-helpers";

export const dynamic = "force-dynamic";

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const context = await authorizeApi("delivery.metrics.view");
  if (isResponse(context)) return context;
  const { id } = await params, { getSprintMetricEvidence } = await import("../../../../../../db/sprint-metrics"), result = await getSprintMetricEvidence(id);
  if (result.kind === "not_found") return apiError(404, "SPRINT_NOT_FOUND", "Sprint was not found.", context.correlationId, context.timestamp);
  if (result.kind === "no_evidence") return apiError(404, "SPRINT_METRICS_NOT_AVAILABLE", "No calculated delivery evidence is available for this Sprint yet.", context.correlationId, context.timestamp);
  return Response.json({ data: result, meta: { correlationId: context.correlationId, timestamp: result.current.calculatedAt } }, { headers: { "cache-control": "no-store" } });
}
