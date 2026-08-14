import { authorizeApi, apiError, isResponse } from "../../../../../v1/api-helpers";

export async function DELETE(request: Request, { params }: { params: Promise<{ id: string; membershipId: string }> }) {
  const context = await authorizeApi("sprint.plan"); if (isResponse(context)) return context;
  const { id, membershipId } = await params, version = Number(new URL(request.url).searchParams.get("version")), { removeSprintItem } = await import("../../../../../../../db/sprints"), result = await removeSprintItem(id, membershipId, version, context.principal.user.userId, context.correlationId);
  const map = { not_found: [404, "SPRINT_NOT_FOUND", "Sprint was not found."], read_only: [409, "AZURE_ORIGIN_READ_ONLY", "Azure-origin Sprints are read-only."], locked: [409, "SPRINT_LOCKED", "Only Planned Sprints can be changed."], conflict: [409, "VERSION_CONFLICT", "This Sprint changed. Refresh and try again."], membership_not_found: [404, "SPRINT_ITEM_NOT_FOUND", "Sprint item was not found."] } as const;
  if (result.kind !== "ok") { const error = map[result.kind]; return apiError(error[0], error[1], error[2], context.correlationId, context.timestamp); }
  return Response.json({ data: result });
}
