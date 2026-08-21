import { authorizeApi, apiError, apiHeaders, isResponse } from "../../../v1/api-helpers";
import { validateDefectProgressInput } from "../../../../releases/defect-contract";

export const dynamic = "force-dynamic";

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const context = await authorizeApi("defect.view");
  if (isResponse(context)) return context;
  const { id } = await params;
  const { getDefect } = await import("../../../../../db/defects");
  const defect = await getDefect(id);
  if (!defect) return apiError(404, "DEFECT_NOT_FOUND", "Defect was not found.", context.correlationId, context.timestamp);
  return Response.json({ data: defect, meta: { correlationId: context.correlationId, timestamp: context.timestamp } }, { headers: apiHeaders(context.correlationId) });
}

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const context = await authorizeApi("defect.edit");
  if (isResponse(context)) return context;
  let body: unknown;
  try { body = await request.json(); }
  catch { return apiError(400, "INVALID_JSON", "Request body must be valid JSON.", context.correlationId, context.timestamp); }
  const validation = validateDefectProgressInput(body);
  if (!validation.ok) return apiError(422, "VALIDATION_FAILED", "Review the highlighted fields.", context.correlationId, context.timestamp, validation.details);
  const version = Number((body as Record<string, unknown>).version);
  if (!Number.isInteger(version) || version < 1) return apiError(422, "VERSION_REQUIRED", "Refresh the defect and try again.", context.correlationId, context.timestamp, { version: "A current record version is required." });
  const { id } = await params;
  const { updateDefectProgress } = await import("../../../../../db/defects");
  const result = await updateDefectProgress(id, validation.value, version, context.principal.user.userId, context.correlationId);
  const errors = {
    not_found: [404, "DEFECT_NOT_FOUND", "Defect was not found."],
    conflict: [409, "VERSION_CONFLICT", "This defect changed after you opened it. Refresh and try again."],
    invalid_transition: [409, "DEFECT_STATUS_TRANSITION_INVALID", "That status change is not allowed from the defect's current status."],
    invalid_backlog_item: [422, "INVALID_BACKLOG_ITEM", "Select a Backlog item that belongs to this defect's Project."],
    fix_item_not_done: [409, "FIX_ITEM_NOT_DONE", "Link a fix Backlog Item that is marked Done before moving to Fixed."],
    verification_evidence_missing: [409, "VERIFICATION_EVIDENCE_MISSING", "A later Pass execution on the originating test case is required before marking Verified."],
  } as const;
  if (result.kind !== "ok") { const error = errors[result.kind]; return apiError(error[0], error[1], error[2], context.correlationId, context.timestamp); }
  return Response.json({ data: result.defect, meta: { correlationId: context.correlationId, timestamp: context.timestamp } }, { headers: apiHeaders(context.correlationId) });
}
