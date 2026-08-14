import { authorizeApi, apiError, isResponse } from "../../../../v1/api-helpers";

const errors = { not_found: [404, "SPRINT_NOT_FOUND", "Sprint was not found."], read_only: [409, "AZURE_ORIGIN_READ_ONLY", "Azure-origin Sprints are read-only."], locked: [409, "SPRINT_LOCKED", "Only Planned Sprints can be changed."], conflict: [409, "VERSION_CONFLICT", "This Sprint changed. Refresh and try again."], item_not_found: [404, "BACKLOG_ITEM_NOT_FOUND", "Backlog item was not found."], scope: [422, "SPRINT_ITEM_SCOPE_MISMATCH", "The work item must belong to the Sprint Project and local source."], not_ready: [422, "BACKLOG_ITEM_NOT_READY", "Only Ready Stories, Tasks and Bugs can be planned."], already_assigned: [409, "BACKLOG_ITEM_ALREADY_ASSIGNED", "This work item is already assigned to a Planned or Active Sprint."], unresolved: [409, "UNRESOLVED_DEPENDENCY", "Resolve blocking dependencies before Sprint assignment."], invalid_order: [422, "INVALID_SPRINT_ORDER", "The submitted order must contain every Sprint item exactly once."] } as const;

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const context = await authorizeApi("sprint.plan"); if (isResponse(context)) return context;
  let body: Record<string, unknown>; try { body = await request.json() as Record<string, unknown>; } catch { return apiError(400, "INVALID_JSON", "Request body must be valid JSON.", context.correlationId, context.timestamp); }
  const backlogItemId = typeof body.backlogItemId === "string" ? body.backlogItemId.trim().slice(0, 80) : "";
  if (!backlogItemId) return apiError(422, "VALIDATION_FAILED", "Select a Backlog item.", context.correlationId, context.timestamp, { backlogItemId: "Select a Backlog item." });
  const { id } = await params, { addSprintItem } = await import("../../../../../../db/sprints"), result = await addSprintItem(id, backlogItemId, Number(body.version), context.principal.user.userId, context.correlationId);
  if (result.kind !== "ok") { const error = errors[result.kind]; return apiError(error[0], error[1], error[2], context.correlationId, context.timestamp); }
  return Response.json({ data: result }, { status: 201 });
}

export async function PUT(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const context = await authorizeApi("sprint.plan"); if (isResponse(context)) return context;
  let body: Record<string, unknown>; try { body = await request.json() as Record<string, unknown>; } catch { return apiError(400, "INVALID_JSON", "Request body must be valid JSON.", context.correlationId, context.timestamp); }
  const membershipIds = Array.isArray(body.membershipIds) ? body.membershipIds.filter((value): value is string => typeof value === "string").slice(0, 100) : [];
  const { id } = await params, { reorderSprintItems } = await import("../../../../../../db/sprints"), result = await reorderSprintItems(id, membershipIds, Number(body.version), context.principal.user.userId, context.correlationId);
  if (result.kind !== "ok") { const error = errors[result.kind]; return apiError(error[0], error[1], error[2], context.correlationId, context.timestamp); }
  return Response.json({ data: result });
}
