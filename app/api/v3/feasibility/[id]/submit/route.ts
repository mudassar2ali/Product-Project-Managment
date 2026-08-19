import { authorizeApi, apiError, apiHeaders, isResponse } from "../../../../v1/api-helpers";

export const dynamic = "force-dynamic";

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const context = await authorizeApi("feasibility.submit");
  if (isResponse(context)) return context;
  let body: unknown;
  try { body = await request.json(); }
  catch { return apiError(400, "INVALID_JSON", "Request body must be valid JSON.", context.correlationId, context.timestamp); }
  const expectedVersion = Number((body as Record<string, unknown>)?.version);
  if (!Number.isInteger(expectedVersion) || expectedVersion < 1) return apiError(422, "VERSION_REQUIRED", "Refresh the feasibility assessment and try again.", context.correlationId, context.timestamp, { version: "A current record version is required." });
  const { id } = await params;
  const { submitFeasibilityRevision } = await import("../../../../../../db/feasibility");
  const result = await submitFeasibilityRevision(id, expectedVersion, context.principal.user.userId, context.correlationId);
  if (result.kind === "not_found") return apiError(404, "FEASIBILITY_ASSESSMENT_NOT_FOUND", "Feasibility assessment was not found.", context.correlationId, context.timestamp);
  if (result.kind === "locked") return apiError(409, "FEASIBILITY_REVISION_LOCKED", "The current revision is already submitted.", context.correlationId, context.timestamp);
  if (result.kind === "incomplete") return apiError(422, "FEASIBILITY_INCOMPLETE", "Complete the required fields before submitting.", context.correlationId, context.timestamp, Object.fromEntries(result.fields.map((field) => [field, "This field is required before submission."])));
  if (result.kind === "conflict") return apiError(409, "VERSION_CONFLICT", "This feasibility assessment changed after you opened it. Refresh and try again.", context.correlationId, context.timestamp);
  return Response.json({ data: result.workspace, meta: { correlationId: context.correlationId, timestamp: context.timestamp } }, { headers: apiHeaders(context.correlationId) });
}
