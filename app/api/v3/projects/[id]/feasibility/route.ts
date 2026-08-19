import { authorizeApi, apiError, apiHeaders, isResponse } from "../../../../v1/api-helpers";
import { validateFeasibilityAssessmentRegistrationInput } from "../../../../../governance/feasibility-contract";

export const dynamic = "force-dynamic";

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const context = await authorizeApi("feasibility.view");
  if (isResponse(context)) return context;
  const { id } = await params;
  const { listFeasibilityAssessments } = await import("../../../../../../db/feasibility");
  const result = await listFeasibilityAssessments(id);
  if (result.kind === "not_found") return apiError(404, "PROJECT_NOT_FOUND", "Project was not found.", context.correlationId, context.timestamp);
  return Response.json({ data: result.items, meta: { correlationId: context.correlationId, timestamp: context.timestamp } }, { headers: apiHeaders(context.correlationId) });
}

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const context = await authorizeApi("feasibility.edit");
  if (isResponse(context)) return context;
  let body: unknown;
  try { body = await request.json(); }
  catch { return apiError(400, "INVALID_JSON", "Request body must be valid JSON.", context.correlationId, context.timestamp); }
  const validation = validateFeasibilityAssessmentRegistrationInput(body);
  if (!validation.ok) return apiError(422, "VALIDATION_FAILED", "Review the highlighted fields.", context.correlationId, context.timestamp, validation.details);
  const { id } = await params;
  const { createFeasibilityAssessment } = await import("../../../../../../db/feasibility");
  const result = await createFeasibilityAssessment(id, validation.value, context.principal.user.userId, context.correlationId);
  if (result.kind === "not_found") return apiError(404, "PROJECT_NOT_FOUND", "Project was not found.", context.correlationId, context.timestamp);
  if (result.kind === "invalid_backlog_feature") return apiError(422, "INVALID_BACKLOG_FEATURE", "Select a Backlog feature belonging to this Project.", context.correlationId, context.timestamp, { backlogFeatureId: "The selected feature does not belong to this Project." });
  if (result.kind === "invalid_owner") return apiError(422, "INVALID_OWNER", "Select an active user as owner.", context.correlationId, context.timestamp, { ownerUserId: "The selected owner is unavailable." });
  return Response.json({ data: result, meta: { correlationId: context.correlationId, timestamp: context.timestamp } }, { status: 201, headers: apiHeaders(context.correlationId) });
}
