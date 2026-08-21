import { authorizeApi, apiError, apiHeaders, isResponse } from "../../../../v1/api-helpers";
import { validateRequirementUatLinkInput } from "../../../../../releases/uat-contract";

export const dynamic = "force-dynamic";

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const context = await authorizeApi("traceability.manage");
  if (isResponse(context)) return context;
  let body: unknown;
  try { body = await request.json(); }
  catch { return apiError(400, "INVALID_JSON", "Request body must be valid JSON.", context.correlationId, context.timestamp); }
  const validation = validateRequirementUatLinkInput(body);
  if (!validation.ok) return apiError(422, "VALIDATION_FAILED", "Review the highlighted fields.", context.correlationId, context.timestamp, validation.details);
  const { id } = await params;
  const { addRequirementUatLink } = await import("../../../../../../db/requirement-uat-links");
  const result = await addRequirementUatLink(id, validation.value, context.principal.user.userId, context.correlationId);
  const errors = {
    not_found: [404, "REQUIREMENT_OR_TEST_CASE_NOT_FOUND", "The Requirement or test case was not found."],
    duplicate: [409, "DUPLICATE_REQUIREMENT_LINK", "This link already exists."],
  } as const;
  if (result.kind !== "ok") { const error = errors[result.kind]; return apiError(error[0], error[1], error[2], context.correlationId, context.timestamp); }
  return Response.json({ data: result, meta: { correlationId: context.correlationId, timestamp: context.timestamp } }, { status: 201, headers: apiHeaders(context.correlationId) });
}
