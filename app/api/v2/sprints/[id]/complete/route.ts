import { authorizeApi, apiError, isResponse } from "../../../../v1/api-helpers";
import { validateCompletionInput } from "../../../../../delivery/sprint-lifecycle-contract";

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const context = await authorizeApi("sprint.complete"); if (isResponse(context)) return context;
  let body: unknown; try { body = await request.json(); } catch { return apiError(400, "INVALID_JSON", "Request body must be valid JSON.", context.correlationId, context.timestamp); }
  const validation = validateCompletionInput(body); if (!validation.ok) return apiError(422, "VALIDATION_FAILED", "Complete every Sprint item disposition.", context.correlationId, context.timestamp, validation.details);
  const { id } = await params, { completeSprint } = await import("../../../../../../db/sprint-lifecycle"), result = await completeSprint(id, validation.value.version, validation.value.dispositions, context.principal.user.userId, context.correlationId);
  const map = { not_found: [404, "SPRINT_NOT_FOUND", "Sprint was not found."], read_only: [409, "AZURE_ORIGIN_READ_ONLY", "Azure-origin Sprints are read-only."], wrong_status: [409, "SPRINT_NOT_ACTIVE", "Only an Active Sprint can be completed."], conflict: [409, "VERSION_CONFLICT", "This Sprint changed. Refresh and try again."], incomplete_dispositions: [422, "INCOMPLETE_DISPOSITIONS", "Every current Sprint item needs exactly one disposition."], completed_mismatch: [422, "COMPLETED_ITEM_DISPOSITION", "Done items must use the Completed disposition."], incomplete_mismatch: [422, "INCOMPLETE_ITEM_DISPOSITION", "Unfinished items must be carried over, returned to Backlog, or removed."], invalid_target: [422, "INVALID_CARRYOVER_TARGET", "Choose a Planned local Sprint in the same Project."] } as const;
  if (result.kind !== "ok") { const error = map[result.kind]; return apiError(error[0], error[1], error[2], context.correlationId, context.timestamp); }
  return Response.json({ data: result });
}
