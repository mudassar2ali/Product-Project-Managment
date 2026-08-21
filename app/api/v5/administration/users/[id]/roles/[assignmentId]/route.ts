import { authorizeApi, apiError, apiHeaders, isResponse } from "../../../../../../v1/api-helpers";

export const dynamic = "force-dynamic";

export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string; assignmentId: string }> }) {
  const context = await authorizeApi("admin.roles");
  if (isResponse(context)) return context;
  const { id, assignmentId } = await params;
  const { revokeRole } = await import("../../../../../../../../db/administration");
  const result = await revokeRole(id, assignmentId, context.principal.user.userId, context.correlationId);
  if (result.kind !== "ok") return apiError(404, "ASSIGNMENT_NOT_FOUND", "This role assignment was not found for this user.", context.correlationId, context.timestamp);
  return Response.json({ data: result.assignments, meta: { correlationId: context.correlationId, timestamp: context.timestamp } }, { headers: apiHeaders(context.correlationId) });
}
