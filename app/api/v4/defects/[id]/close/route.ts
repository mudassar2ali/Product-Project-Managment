import { authorizeApi, apiError, apiHeaders, isResponse } from "../../../../v1/api-helpers";
import { validateDefectClosureInput } from "../../../../../releases/defect-contract";

export const dynamic = "force-dynamic";

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const context = await authorizeApi("defect.close");
  if (isResponse(context)) return context;
  let body: unknown;
  try { body = await request.json(); }
  catch { return apiError(400, "INVALID_JSON", "Request body must be valid JSON.", context.correlationId, context.timestamp); }
  const validation = validateDefectClosureInput(body);
  if (!validation.ok) return apiError(422, "VALIDATION_FAILED", "Review the highlighted fields.", context.correlationId, context.timestamp, validation.details);
  const version = Number((body as Record<string, unknown>).version);
  if (!Number.isInteger(version) || version < 1) return apiError(422, "VERSION_REQUIRED", "Refresh the defect and try again.", context.correlationId, context.timestamp, { version: "A current record version is required." });
  const { id } = await params;
  const { closeDefect } = await import("../../../../../../db/defects");
  const result = await closeDefect(id, validation.value, version, context.principal.user.userId, context.correlationId);
  const errors = {
    not_found: [404, "DEFECT_NOT_FOUND", "Defect was not found."],
    conflict: [409, "VERSION_CONFLICT", "This defect changed after you opened it. Refresh and try again."],
    invalid_transition: [409, "DEFECT_STATUS_TRANSITION_INVALID", "That status change is not allowed from the defect's current status."],
    invalid_duplicate_target: [422, "INVALID_DUPLICATE_TARGET", "Select a different defect in the same Project as the duplicate target."],
    closure_invalid: [422, "DEFECT_CLOSURE_INVALID", "Closure evidence is inconsistent with the requested status."],
  } as const;
  if (result.kind !== "ok") { const error = errors[result.kind]; return apiError(error[0], error[1], error[2], context.correlationId, context.timestamp); }
  return Response.json({ data: result.defect, meta: { correlationId: context.correlationId, timestamp: context.timestamp } }, { headers: apiHeaders(context.correlationId) });
}
