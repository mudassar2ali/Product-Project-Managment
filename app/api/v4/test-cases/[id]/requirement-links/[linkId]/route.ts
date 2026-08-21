import { authorizeApi, apiError, apiHeaders, isResponse } from "../../../../../v1/api-helpers";

export const dynamic = "force-dynamic";

export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string; linkId: string }> }) {
  const context = await authorizeApi("traceability.manage");
  if (isResponse(context)) return context;
  const { id, linkId } = await params;
  const { removeRequirementUatLink } = await import("../../../../../../../db/requirement-uat-links");
  const result = await removeRequirementUatLink(id, linkId, context.principal.user.userId, context.correlationId);
  if (result.kind === "not_found") return apiError(404, "REQUIREMENT_LINK_NOT_FOUND", "Link was not found.", context.correlationId, context.timestamp);
  return new Response(null, { status: 204, headers: apiHeaders(context.correlationId) });
}
