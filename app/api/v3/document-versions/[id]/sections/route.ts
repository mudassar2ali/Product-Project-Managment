import { authorizeApi, apiError, apiHeaders, isResponse } from "../../../../v1/api-helpers";
import { validateBrdSections } from "../../../../../governance/brd-contract";

export const dynamic = "force-dynamic";

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const context = await authorizeApi("document.view");
  if (isResponse(context)) return context;
  const { id } = await params;
  const { getBrdVersionSections } = await import("../../../../../../db/governance-documents");
  const result = await getBrdVersionSections(id);
  if (result.kind === "not_found") return apiError(404, "BRD_VERSION_NOT_FOUND", "BRD version was not found.", context.correlationId, context.timestamp);
  return Response.json({ data: result, meta: { correlationId: context.correlationId, timestamp: context.timestamp } }, { headers: apiHeaders(context.correlationId) });
}

export async function PUT(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const context = await authorizeApi("document.edit");
  if (isResponse(context)) return context;
  let body: unknown;
  try { body = await request.json(); }
  catch { return apiError(400, "INVALID_JSON", "Request body must be valid JSON.", context.correlationId, context.timestamp); }
  const validation = validateBrdSections(body);
  if (!validation.ok) return apiError(422, "VALIDATION_FAILED", "Review the BRD sections.", context.correlationId, context.timestamp, validation.details);
  const { id } = await params;
  const { replaceBrdSections } = await import("../../../../../../db/governance-documents");
  try {
    const result = await replaceBrdSections(id, validation.value.sections, validation.value.version, context.principal.user.userId, context.correlationId);
    const errors = {
      not_found: [404, "BRD_VERSION_NOT_FOUND", "BRD version was not found."],
      locked: [409, "GOVERNANCE_VERSION_LOCKED", "Submitted BRD content cannot be edited."],
      conflict: [409, "VERSION_CONFLICT", "This BRD changed after you opened it. Refresh and try again."],
    } as const;
    if (result.kind !== "ok") { const error = errors[result.kind]; return apiError(error[0], error[1], error[2], context.correlationId, context.timestamp); }
    return Response.json({ data: result.workspace, meta: { correlationId: context.correlationId, timestamp: context.timestamp } }, { headers: apiHeaders(context.correlationId) });
  } catch (error) {
    const locked = error instanceof Error && error.message.includes("GOVERNANCE_VERSION_LOCKED");
    return apiError(locked ? 409 : 500, locked ? "GOVERNANCE_VERSION_LOCKED" : "BRD_SAVE_FAILED", locked ? "Submitted BRD content cannot be edited." : "The BRD sections could not be saved.", context.correlationId, context.timestamp);
  }
}
