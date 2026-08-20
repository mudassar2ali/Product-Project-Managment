import { authorizeApi, apiError, apiHeaders, isResponse } from "../../../../../v1/api-helpers";

export const dynamic = "force-dynamic";

export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string; backlogItemId: string }> }) {
  const context = await authorizeApi("release.scope");
  if (isResponse(context)) return context;
  const { id, backlogItemId } = await params;
  const { removeScopeItem } = await import("../../../../../../../db/releases");
  const result = await removeScopeItem(id, backlogItemId, context.principal.user.userId, context.correlationId);
  const errors = {
    not_found: [404, "SCOPE_ITEM_NOT_FOUND", "This Backlog item is not in the Release's active scope."],
    scope_locked: [409, "SCOPE_LOCKED", "This Release's scope is locked and can no longer be changed."],
  } as const;
  if (result.kind !== "ok") { const error = errors[result.kind]; return apiError(error[0], error[1], error[2], context.correlationId, context.timestamp); }
  return Response.json({ data: result, meta: { correlationId: context.correlationId, timestamp: context.timestamp } }, { headers: apiHeaders(context.correlationId) });
}
