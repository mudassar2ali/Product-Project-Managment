import { authorizeApi, apiError, apiHeaders, isResponse } from "../../../v1/api-helpers";
import { validateFeasibilityRevisionInput } from "../../../../governance/feasibility-contract";

export const dynamic = "force-dynamic";

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const context = await authorizeApi("feasibility.view");
  if (isResponse(context)) return context;
  const { id } = await params;
  const { getFeasibilityWorkspace } = await import("../../../../../db/feasibility");
  const result = await getFeasibilityWorkspace(id);
  if (result.kind === "not_found") return apiError(404, "FEASIBILITY_ASSESSMENT_NOT_FOUND", "Feasibility assessment was not found.", context.correlationId, context.timestamp);
  return Response.json({ data: result, meta: { correlationId: context.correlationId, timestamp: context.timestamp } }, { headers: apiHeaders(context.correlationId) });
}

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const context = await authorizeApi("feasibility.edit");
  if (isResponse(context)) return context;
  let body: unknown;
  try { body = await request.json(); }
  catch { return apiError(400, "INVALID_JSON", "Request body must be valid JSON.", context.correlationId, context.timestamp); }
  const validation = validateFeasibilityRevisionInput(body);
  if (!validation.ok) return apiError(422, "VALIDATION_FAILED", "Review the highlighted fields.", context.correlationId, context.timestamp, validation.details);
  const expectedVersion = Number((body as Record<string, unknown>).version);
  if (!Number.isInteger(expectedVersion) || expectedVersion < 1) return apiError(422, "VERSION_REQUIRED", "Refresh the feasibility assessment and try again.", context.correlationId, context.timestamp, { version: "A current record version is required." });
  const { id } = await params;
  const { updateFeasibilityDraft } = await import("../../../../../db/feasibility");
  const result = await updateFeasibilityDraft(id, validation.value, expectedVersion, context.principal.user.userId, context.correlationId);
  if (result.kind === "not_found") return apiError(404, "FEASIBILITY_ASSESSMENT_NOT_FOUND", "Feasibility assessment was not found.", context.correlationId, context.timestamp);
  if (result.kind === "locked") return apiError(409, "FEASIBILITY_REVISION_LOCKED", "The current revision is submitted and locked. Editing requires a new revision.", context.correlationId, context.timestamp);
  if (result.kind === "conflict") return apiError(409, "VERSION_CONFLICT", "This feasibility assessment changed after you opened it. Refresh and try again.", context.correlationId, context.timestamp);
  return Response.json({ data: result.workspace, meta: { correlationId: context.correlationId, timestamp: context.timestamp } }, { headers: apiHeaders(context.correlationId) });
}
