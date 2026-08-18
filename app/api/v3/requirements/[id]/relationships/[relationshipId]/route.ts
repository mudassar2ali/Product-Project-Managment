import { authorizeApi, apiError, apiHeaders, isResponse } from "../../../../../v1/api-helpers";

export const dynamic = "force-dynamic";

export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string; relationshipId: string }> }) {
  const context = await authorizeApi("requirement.link");
  if (isResponse(context)) return context;
  const { id, relationshipId } = await params;
  const { removeRequirementRelationship } = await import("../../../../../../../db/requirement-traceability");
  const result = await removeRequirementRelationship(id, relationshipId, context.principal.user.userId, context.correlationId);
  if (result.kind === "not_found") return apiError(404, "RELATIONSHIP_NOT_FOUND", "Relationship was not found.", context.correlationId, context.timestamp);
  return new Response(null, { status: 204, headers: apiHeaders(context.correlationId) });
}
