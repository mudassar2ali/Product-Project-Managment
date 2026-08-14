import { authorizeApi, apiError, isResponse } from "../../../../v1/api-helpers";
import { validateScopeChangeInput } from "../../../../../delivery/sprint-lifecycle-contract";

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const context = await authorizeApi("sprint.plan"); if (isResponse(context)) return context;
  let body: unknown; try { body = await request.json(); } catch { return apiError(400, "INVALID_JSON", "Request body must be valid JSON.", context.correlationId, context.timestamp); }
  const validation = validateScopeChangeInput(body); if (!validation.ok) return apiError(422, "VALIDATION_FAILED", "Explain and complete the active scope change.", context.correlationId, context.timestamp, validation.details);
  const { id } = await params, { changeActiveScope } = await import("../../../../../../db/sprint-lifecycle"), result = await changeActiveScope(id, validation.value, context.principal.user.userId, context.correlationId);
  const map = { not_found: [404, "SPRINT_NOT_FOUND", "Sprint was not found."], read_only: [409, "AZURE_ORIGIN_READ_ONLY", "Azure-origin Sprints are read-only."], wrong_status: [409, "SPRINT_NOT_ACTIVE", "Scope-change controls apply only to an Active Sprint."], conflict: [409, "VERSION_CONFLICT", "This Sprint changed. Refresh and try again."], item_not_found: [404, "BACKLOG_ITEM_NOT_FOUND", "Backlog item was not found."], scope: [422, "SPRINT_ITEM_SCOPE_MISMATCH", "The item must belong to this local Project."], item_not_ready: [422, "BACKLOG_ITEM_NOT_READY", "Only unblocked Ready Stories, Tasks and Bugs can be added."], already_assigned: [409, "BACKLOG_ITEM_ALREADY_ASSIGNED", "This item is already assigned to a Planned or Active Sprint."], unresolved: [409, "UNRESOLVED_DEPENDENCY", "Resolve blocking dependencies before adding this item."], membership_not_found: [404, "SPRINT_ITEM_NOT_FOUND", "Sprint item was not found."] } as const;
  if (result.kind !== "ok") { const error = map[result.kind]; return apiError(error[0], error[1], error[2], context.correlationId, context.timestamp); }
  return Response.json({ data: result });
}
