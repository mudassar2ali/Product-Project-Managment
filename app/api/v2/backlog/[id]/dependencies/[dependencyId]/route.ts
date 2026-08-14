import { authorizeApi, apiError, isResponse } from "../../../../../v1/api-helpers";

export async function DELETE(request: Request, { params }: { params: Promise<{ id: string; dependencyId: string }> }) {
  const context = await authorizeApi("backlog.edit");
  if (isResponse(context)) return context;
  const { id, dependencyId } = await params;
  const version = Number(new URL(request.url).searchParams.get("version"));
  const { removeDependency } = await import("../../../../../../../db/backlog-dependencies");
  const result = await removeDependency(id, dependencyId, version, context.principal.user.userId, context.correlationId);
  const map = {
    not_found: [404, "BACKLOG_ITEM_NOT_FOUND", "Backlog item was not found."],
    dependency_not_found: [404, "DEPENDENCY_NOT_FOUND", "Dependency was not found."],
    read_only: [409, "AZURE_ORIGIN_READ_ONLY", "Azure-origin dependencies are read-only."],
    conflict: [409, "VERSION_CONFLICT", "This work item changed. Refresh and try again."],
  } as const;
  if (result.kind !== "ok") { const error = map[result.kind]; return apiError(error[0], error[1], error[2], context.correlationId, context.timestamp); }
  return Response.json({ data: result }, { headers: { "cache-control": "no-store" } });
}
