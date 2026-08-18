import { authorizeApi, apiError, apiHeaders, isResponse } from "../../../../v1/api-helpers";
import { validateRequirementRelationshipInput } from "../../../../../governance/requirement-contract";

export const dynamic = "force-dynamic";

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const context = await authorizeApi("requirement.link");
  if (isResponse(context)) return context;
  let body: unknown;
  try { body = await request.json(); }
  catch { return apiError(400, "INVALID_JSON", "Request body must be valid JSON.", context.correlationId, context.timestamp); }
  const validation = validateRequirementRelationshipInput(body);
  if (!validation.ok) return apiError(422, "VALIDATION_FAILED", "Review the highlighted fields.", context.correlationId, context.timestamp, validation.details);
  const { id } = await params;
  const { addRequirementRelationship } = await import("../../../../../../db/requirement-traceability");
  const result = await addRequirementRelationship(id, validation.value, context.principal.user.userId, context.correlationId);
  const errors = {
    not_found: [404, "REQUIREMENT_NOT_FOUND", "One of the Requirements was not found."],
    self: [422, "SELF_RELATIONSHIP", "A Requirement cannot relate to itself."],
    scope: [422, "RELATIONSHIP_SCOPE_MISMATCH", "Related Requirements must belong to the same Product."],
    rationale_required: [422, "RATIONALE_REQUIRED", "A cross-Project relationship requires a rationale."],
    duplicate: [409, "DUPLICATE_RELATIONSHIP", "This relationship already exists."],
    cycle: [409, "RELATIONSHIP_CYCLE", "This relationship would create a dependency cycle."],
  } as const;
  if (result.kind !== "ok") { const error = errors[result.kind]; return apiError(error[0], error[1], error[2], context.correlationId, context.timestamp); }
  return Response.json({ data: result, meta: { correlationId: context.correlationId, timestamp: context.timestamp } }, { status: 201, headers: apiHeaders(context.correlationId) });
}
