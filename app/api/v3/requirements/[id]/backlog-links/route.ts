import { authorizeApi, apiError, apiHeaders, isResponse } from "../../../../v1/api-helpers";
import { validateRequirementBacklogLinkInput } from "../../../../../governance/requirement-contract";

export const dynamic = "force-dynamic";

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const context = await authorizeApi("traceability.manage");
  if (isResponse(context)) return context;
  let body: unknown;
  try { body = await request.json(); }
  catch { return apiError(400, "INVALID_JSON", "Request body must be valid JSON.", context.correlationId, context.timestamp); }
  const validation = validateRequirementBacklogLinkInput(body);
  if (!validation.ok) return apiError(422, "VALIDATION_FAILED", "Review the highlighted fields.", context.correlationId, context.timestamp, validation.details);
  const { id } = await params;
  const { addRequirementBacklogLink } = await import("../../../../../../db/requirement-traceability");
  const result = await addRequirementBacklogLink(id, validation.value, context.principal.user.userId, context.correlationId);
  const errors = {
    not_found: [404, "REQUIREMENT_OR_BACKLOG_ITEM_NOT_FOUND", "The Requirement or Backlog item was not found."],
    rationale_required: [422, "RATIONALE_REQUIRED", "A cross-Project link requires a rationale."],
    duplicate: [409, "DUPLICATE_BACKLOG_LINK", "This link already exists."],
  } as const;
  if (result.kind !== "ok") { const error = errors[result.kind]; return apiError(error[0], error[1], error[2], context.correlationId, context.timestamp); }
  return Response.json({ data: result, meta: { correlationId: context.correlationId, timestamp: context.timestamp } }, { status: 201, headers: apiHeaders(context.correlationId) });
}
