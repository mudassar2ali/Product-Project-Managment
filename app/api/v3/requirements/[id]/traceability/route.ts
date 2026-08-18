import { authorizeApi, apiError, apiHeaders, isResponse } from "../../../../v1/api-helpers";

export const dynamic = "force-dynamic";

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const context = await authorizeApi("traceability.view");
  if (isResponse(context)) return context;
  const { id } = await params;
  const { getRequirementTraceability } = await import("../../../../../../db/requirement-traceability");
  const result = await getRequirementTraceability(id);
  if (result.kind === "not_found") return apiError(404, "REQUIREMENT_NOT_FOUND", "Requirement was not found.", context.correlationId, context.timestamp);
  return Response.json({ data: result, meta: { correlationId: context.correlationId, timestamp: context.timestamp } }, { headers: apiHeaders(context.correlationId) });
}
