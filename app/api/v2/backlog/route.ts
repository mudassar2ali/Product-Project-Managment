import { authorizeApi, apiError, apiHeaders, isResponse } from "../../v1/api-helpers";
import { validateBacklogInput } from "../../../delivery/backlog-contract";

// All responses use cache-control: no-store through the shared API headers.
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const startedAt = Date.now();
  const context = await authorizeApi("backlog.view");
  if (isResponse(context)) return context;
  const url = new URL(request.url);
  const page = Math.max(1, Number(url.searchParams.get("page") || 1));
  const pageSize = Math.min(100, Math.max(1, Number(url.searchParams.get("pageSize") || 50)));
  const { listBacklog } = await import("../../../../db/backlog");
  const result = await listBacklog({
    q: (url.searchParams.get("q") || "").slice(0, 140),
    projectId: url.searchParams.get("projectId") || "",
    itemType: url.searchParams.get("itemType") || "",
    status: url.searchParams.get("status") || "",
    origin: url.searchParams.get("origin") || "",
    attention: url.searchParams.get("attention") || "",
    sprintId: url.searchParams.get("sprintId") || "",
    page,
    pageSize,
  });
  const { recordOperationalEvent } = await import("../../../../db/operations");
  await recordOperationalEvent({ operation: "BACKLOG_QUERY", outcome: "SUCCESS", statusCode: 200, durationMs: Date.now() - startedAt, actorUserId: context.principal.user.userId, correlationId: context.correlationId, entityType: "Backlog", details: { pageSize, returnedRows: result.items.length, totalRows: result.total, filteredByProject: Boolean(url.searchParams.get("projectId")) } });
  return Response.json({ data: result.items, meta: { page, pageSize, total: result.total, correlationId: context.correlationId, timestamp: context.timestamp } }, { headers: apiHeaders(context.correlationId) });
}

export async function POST(request: Request) {
  const context = await authorizeApi("backlog.create");
  if (isResponse(context)) return context;
  let body: unknown;
  try { body = await request.json(); }
  catch { return apiError(400, "INVALID_JSON", "Request body must be valid JSON.", context.correlationId, context.timestamp); }
  const validation = validateBacklogInput(body);
  if (!validation.ok) return apiError(422, "VALIDATION_FAILED", "Review the highlighted fields.", context.correlationId, context.timestamp, validation.details);
  const { createBacklog } = await import("../../../../db/backlog");
  try {
    const result = await createBacklog(validation.value, context.principal.user.userId, context.correlationId);
    if (result.kind === "invalid_project") return apiError(422, "INVALID_PROJECT", "Select an active Project.", context.correlationId, context.timestamp, { projectId: "The selected Project is unavailable." });
    if (result.kind === "invalid_parent") return apiError(422, "INVALID_PARENT", "Select a valid parent in the same local Project hierarchy.", context.correlationId, context.timestamp, { parentId: "The selected parent is invalid." });
    return Response.json({ data: result, meta: { correlationId: context.correlationId, timestamp: context.timestamp } }, { status: 201, headers: apiHeaders(context.correlationId) });
  } catch (error) {
    const duplicate = error instanceof Error && /unique/i.test(error.message);
    return apiError(duplicate ? 409 : 500, duplicate ? "DUPLICATE_BACKLOG_ITEM" : "BACKLOG_CREATE_FAILED", duplicate ? "This Backlog item already exists." : "The Backlog item could not be created.", context.correlationId, context.timestamp);
  }
}
