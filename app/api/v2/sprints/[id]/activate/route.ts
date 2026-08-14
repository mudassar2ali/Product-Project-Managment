import { authorizeApi, apiError, isResponse } from "../../../../v1/api-helpers";

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const context = await authorizeApi("sprint.activate"); if (isResponse(context)) return context;
  let body: Record<string, unknown>; try { body = await request.json() as Record<string, unknown>; } catch { return apiError(400, "INVALID_JSON", "Request body must be valid JSON.", context.correlationId, context.timestamp); }
  const { id } = await params, { activateSprint } = await import("../../../../../../db/sprint-lifecycle"), result = await activateSprint(id, Number(body.version), context.principal.user.userId, context.correlationId);
  const map = { not_found: [404, "SPRINT_NOT_FOUND", "Sprint was not found."], read_only: [409, "AZURE_ORIGIN_READ_ONLY", "Azure-origin Sprints are read-only."], wrong_status: [409, "SPRINT_NOT_PLANNED", "Only a Planned Sprint can be activated."], conflict: [409, "VERSION_CONFLICT", "This Sprint changed. Refresh and try again."], active_exists: [409, "ACTIVE_SPRINT_EXISTS", "This Project already has an Active Sprint."], empty: [422, "SPRINT_EMPTY", "Add at least one Ready item before activation."], items_not_ready: [422, "SPRINT_ITEMS_NOT_READY", "Resolve blockers and dependencies and ensure every item is Ready."], over_capacity: [422, "SPRINT_OVER_CAPACITY", "Reduce planned hours or increase capacity before activation."] } as const;
  if (result.kind !== "ok") { const error = map[result.kind]; return apiError(error[0], error[1], error[2], context.correlationId, context.timestamp); }
  return Response.json({ data: result });
}
