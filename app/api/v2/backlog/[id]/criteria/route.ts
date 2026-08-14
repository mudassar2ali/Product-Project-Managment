import { authorizeApi, apiError, isResponse } from "../../../../v1/api-helpers";
import { validateCriteriaInput } from "../../../../../delivery/acceptance-criteria-contract";

export const dynamic = "force-dynamic";

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const context = await authorizeApi("backlog.view");
  if (isResponse(context)) return context;
  const { id } = await params;
  const { getStoryCriteria } = await import("../../../../../../db/acceptance-criteria");
  const result = await getStoryCriteria(id);
  if (result.kind === "not_found") return apiError(404, "BACKLOG_ITEM_NOT_FOUND", "Backlog item was not found.", context.correlationId, context.timestamp);
  if (result.kind === "not_story") return apiError(422, "NOT_A_STORY", "Acceptance Criteria belong only to Stories.", context.correlationId, context.timestamp);
  return Response.json({ data: result }, { headers: { "cache-control": "no-store" } });
}

export async function PUT(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const context = await authorizeApi("backlog.edit");
  if (isResponse(context)) return context;
  let body: unknown;
  try { body = await request.json(); } catch { return apiError(400, "INVALID_JSON", "Request body must be valid JSON.", context.correlationId, context.timestamp); }
  const validation = validateCriteriaInput(body);
  if (!validation.ok) return apiError(422, "VALIDATION_FAILED", "Complete every Given, When and Then branch.", context.correlationId, context.timestamp, validation.details);
  const { id } = await params;
  const { replaceStoryCriteria } = await import("../../../../../../db/acceptance-criteria");
  const result = await replaceStoryCriteria(id, validation.value, validation.version, context.principal.user.userId, context.correlationId);
  if (result.kind === "not_found") return apiError(404, "BACKLOG_ITEM_NOT_FOUND", "Backlog item was not found.", context.correlationId, context.timestamp);
  if (result.kind === "not_story") return apiError(422, "NOT_A_STORY", "Acceptance Criteria belong only to Stories.", context.correlationId, context.timestamp);
  if (result.kind === "read_only") return apiError(409, "AZURE_ORIGIN_READ_ONLY", "Azure-origin criteria are read-only.", context.correlationId, context.timestamp);
  if (result.kind === "conflict") return apiError(409, "VERSION_CONFLICT", "This Story changed. Refresh and try again.", context.correlationId, context.timestamp);
  return Response.json({ data: result }, { headers: { "cache-control": "no-store" } });
}
