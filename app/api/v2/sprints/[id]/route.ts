import { authorizeApi, apiError, isResponse } from "../../../v1/api-helpers";
import { validateSprintInput } from "../../../../delivery/sprint-contract";

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const context = await authorizeApi("sprint.view"); if (isResponse(context)) return context;
  const { id } = await params, { getSprint } = await import("../../../../../db/sprints"), result = await getSprint(id);
  if (result.kind === "not_found") return apiError(404, "SPRINT_NOT_FOUND", "Sprint was not found.", context.correlationId, context.timestamp);
  return Response.json({ data: result }, { headers: { "cache-control": "no-store" } });
}

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const context = await authorizeApi("sprint.plan"); if (isResponse(context)) return context;
  let body: unknown; try { body = await request.json(); } catch { return apiError(400, "INVALID_JSON", "Request body must be valid JSON.", context.correlationId, context.timestamp); }
  const validation = validateSprintInput(body); if (!validation.ok) return apiError(422, "VALIDATION_FAILED", "Review the Sprint fields.", context.correlationId, context.timestamp, validation.details);
  const { id } = await params, { updateSprint } = await import("../../../../../db/sprints"), result = await updateSprint(id, validation.value, Number((body as Record<string, unknown>).version), context.principal.user.userId, context.correlationId);
  const map = { not_found: [404, "SPRINT_NOT_FOUND", "Sprint was not found."], read_only: [409, "AZURE_ORIGIN_READ_ONLY", "Azure-origin Sprints are read-only."], locked: [409, "SPRINT_LOCKED", "Only Planned Sprints can be edited."], invalid_project: [422, "INVALID_PROJECT", "Select an active Project."], has_items: [409, "SPRINT_PROJECT_LOCKED", "Remove Sprint items before changing the Project."], conflict: [409, "VERSION_CONFLICT", "This Sprint changed. Refresh and try again."] } as const;
  if (result.kind !== "ok") { const error = map[result.kind]; return apiError(error[0], error[1], error[2], context.correlationId, context.timestamp); }
  return Response.json({ data: result });
}
