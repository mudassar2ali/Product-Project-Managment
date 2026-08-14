import { authorizeApi, apiError, isResponse } from "../../../v1/api-helpers";
import { validateBacklogInput } from "../../../../delivery/backlog-contract";

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const context = await authorizeApi("backlog.view");
  if (isResponse(context)) return context;
  const { id } = await params;
  const { getBacklogWorkspace } = await import("../../../../../db/backlog");
  const result = await getBacklogWorkspace(id);
  if (result.kind === "not_found") return apiError(404, "BACKLOG_ITEM_NOT_FOUND", "Backlog item was not found.", context.correlationId, context.timestamp);
  return Response.json({ data: result }, { headers: { "cache-control": "no-store" } });
}

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const context = await authorizeApi("backlog.edit");
  if (isResponse(context)) return context;
  let body: unknown;
  try { body = await request.json(); } catch { return apiError(400, "INVALID_JSON", "Request body must be valid JSON.", context.correlationId, context.timestamp); }
  const validation = validateBacklogInput(body);
  if (!validation.ok) return apiError(422, "VALIDATION_FAILED", "Review the highlighted fields.", context.correlationId, context.timestamp, validation.details);
  const { id } = await params;
  const { updateBacklog } = await import("../../../../../db/backlog");
  try {
    const version = Number((body as Record<string, unknown>).version);
    const result = await updateBacklog(id, validation.value, version, context.principal.user.userId, context.correlationId);
    const map = {
      not_found: [404, "BACKLOG_ITEM_NOT_FOUND", "Backlog item was not found."],
      read_only: [409, "AZURE_ORIGIN_READ_ONLY", "Azure-origin work is read-only."],
      invalid_parent: [422, "INVALID_PARENT", "Select a valid parent without creating a hierarchy cycle."],
      conflict: [409, "VERSION_CONFLICT", "This item changed. Refresh and try again."],
    } as const;
    if (result.kind !== "ok") { const error = map[result.kind]; return apiError(error[0], error[1], error[2], context.correlationId, context.timestamp); }
    return Response.json({ data: { ok: true } });
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    if (message.includes("STORY_NOT_READY")) return apiError(409, "STORY_NOT_READY", "Complete the Story narrative and Acceptance Criteria before marking it Ready.", context.correlationId, context.timestamp);
    if (message.includes("UNRESOLVED_DEPENDENCY") || message.includes("READY_SUCCESSOR_DEPENDS_ON_ITEM")) return apiError(409, "UNRESOLVED_DEPENDENCY", "Resolve blocking dependencies before changing readiness.", context.correlationId, context.timestamp);
    return apiError(500, "BACKLOG_UPDATE_FAILED", "The Backlog item could not be updated.", context.correlationId, context.timestamp);
  }
}

export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const context = await authorizeApi("backlog.archive");
  if (isResponse(context)) return context;
  const { id } = await params;
  const { archiveBacklog } = await import("../../../../../db/backlog");
  const result = await archiveBacklog(id, Number(new URL(request.url).searchParams.get("version")), context.principal.user.userId, context.correlationId);
  const map = {
    not_found: [404, "BACKLOG_ITEM_NOT_FOUND", "Backlog item was not found."],
    read_only: [409, "AZURE_ORIGIN_READ_ONLY", "Azure-origin work is read-only."],
    has_children: [409, "BACKLOG_HAS_CHILDREN", "Archive child items first."],
    conflict: [409, "VERSION_CONFLICT", "This item changed. Refresh and try again."],
  } as const;
  if (result.kind !== "ok") { const error = map[result.kind]; return apiError(error[0], error[1], error[2], context.correlationId, context.timestamp); }
  return new Response(null, { status: 204, headers: { "cache-control": "no-store" } });
}
