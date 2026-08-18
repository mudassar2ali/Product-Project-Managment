import { authorizeApi, apiError, apiHeaders, isResponse } from "../../../../v1/api-helpers";
import { validateRequirementEvidenceInput } from "../../../../../governance/requirement-contract";

export const dynamic = "force-dynamic";

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const context = await authorizeApi("traceability.evidence");
  if (isResponse(context)) return context;
  let body: unknown;
  try { body = await request.json(); }
  catch { return apiError(400, "INVALID_JSON", "Request body must be valid JSON.", context.correlationId, context.timestamp); }
  const validation = validateRequirementEvidenceInput(body);
  if (!validation.ok) return apiError(422, "VALIDATION_FAILED", "Review the highlighted fields.", context.correlationId, context.timestamp, validation.details);
  const { id } = await params;
  const { addRequirementEvidence } = await import("../../../../../../db/requirement-traceability");
  const result = await addRequirementEvidence(id, validation.value, context.principal.user.userId, context.correlationId);
  const errors = {
    not_found: [404, "REQUIREMENT_NOT_FOUND", "The Requirement was not found."],
    duplicate: [409, "DUPLICATE_EVIDENCE_REFERENCE", "This evidence reference already exists for the requirement."],
  } as const;
  if (result.kind !== "ok") { const error = errors[result.kind]; return apiError(error[0], error[1], error[2], context.correlationId, context.timestamp); }
  return Response.json({ data: result, meta: { correlationId: context.correlationId, timestamp: context.timestamp } }, { status: 201, headers: apiHeaders(context.correlationId) });
}
