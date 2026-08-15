import { authorizeApi, apiError, apiHeaders, isResponse } from "../../../v1/api-helpers";
import { validateBrdDocumentInput } from "../../../../governance/brd-contract";

export const dynamic = "force-dynamic";

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const context = await authorizeApi("document.view");
  if (isResponse(context)) return context;
  const { id } = await params;
  const { getBrdWorkspace } = await import("../../../../../db/governance-documents");
  const result = await getBrdWorkspace(id);
  if (result.kind === "not_found") return apiError(404, "BRD_NOT_FOUND", "BRD was not found.", context.correlationId, context.timestamp);
  return Response.json({ data: result, meta: { correlationId: context.correlationId, timestamp: context.timestamp } }, { headers: apiHeaders(context.correlationId) });
}

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const context = await authorizeApi("document.edit");
  if (isResponse(context)) return context;
  let body: unknown;
  try { body = await request.json(); }
  catch { return apiError(400, "INVALID_JSON", "Request body must be valid JSON.", context.correlationId, context.timestamp); }
  const validation = validateBrdDocumentInput(body);
  if (!validation.ok) return apiError(422, "VALIDATION_FAILED", "Review the highlighted fields.", context.correlationId, context.timestamp, validation.details);
  const version = Number((body as Record<string, unknown>).version);
  if (!Number.isInteger(version) || version < 1) return apiError(422, "VERSION_REQUIRED", "Refresh the BRD and try again.", context.correlationId, context.timestamp, { version: "A current record version is required." });
  const { id } = await params;
  const { updateBrdMetadata } = await import("../../../../../db/governance-documents");
  const result = await updateBrdMetadata(id, validation.value, version, context.principal.user.userId, context.correlationId);
  const errors = {
    not_found: [404, "BRD_NOT_FOUND", "BRD was not found."],
    invalid_product: [422, "INVALID_PRODUCT", "Select an active Product."],
    invalid_project: [422, "INVALID_PROJECT", "Select a Project belonging to the selected Product."],
    locked: [409, "GOVERNANCE_VERSION_LOCKED", "Submitted BRD metadata is locked. Create a revision to make changes."],
    conflict: [409, "VERSION_CONFLICT", "This BRD changed after you opened it. Refresh and try again."],
  } as const;
  if (result.kind !== "ok") { const error = errors[result.kind]; return apiError(error[0], error[1], error[2], context.correlationId, context.timestamp); }
  return Response.json({ data: result.workspace, meta: { correlationId: context.correlationId, timestamp: context.timestamp } }, { headers: apiHeaders(context.correlationId) });
}
