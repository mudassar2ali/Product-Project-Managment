import { authorizeApi, apiError, apiHeaders, isResponse } from "../../../../v1/api-helpers";
import { validateScopeItemInput } from "../../../../../releases/release-contract";

export const dynamic = "force-dynamic";

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const context = await authorizeApi("release.scope");
  if (isResponse(context)) return context;
  let body: unknown;
  try { body = await request.json(); }
  catch { return apiError(400, "INVALID_JSON", "Request body must be valid JSON.", context.correlationId, context.timestamp); }
  const validation = validateScopeItemInput(body);
  if (!validation.ok) return apiError(422, "VALIDATION_FAILED", "Review the highlighted fields.", context.correlationId, context.timestamp, validation.details);
  const { id } = await params;
  const { addScopeItem } = await import("../../../../../../db/releases");
  const result = await addScopeItem(id, validation.value.backlogItemId, context.principal.user.userId, context.correlationId);
  const errors = {
    not_found: [404, "RELEASE_OR_BACKLOG_ITEM_NOT_FOUND", "The Release or Backlog item was not found, or the item does not belong to this Release's Project."],
    scope_locked: [409, "SCOPE_LOCKED", "This Release's scope is locked and can no longer be changed."],
    duplicate: [409, "DUPLICATE_SCOPE_ITEM", "This Backlog item is already in scope."],
    already_in_another_release: [409, "BACKLOG_ITEM_IN_ANOTHER_RELEASE", "This Backlog item is already in scope for another active Release."],
  } as const;
  if (result.kind !== "ok") { const error = errors[result.kind]; return apiError(error[0], error[1], error[2], context.correlationId, context.timestamp); }
  return Response.json({ data: result, meta: { correlationId: context.correlationId, timestamp: context.timestamp } }, { status: 201, headers: apiHeaders(context.correlationId) });
}
