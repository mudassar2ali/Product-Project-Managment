import { authorizeApi, apiError, apiHeaders, isResponse } from "../../../../v1/api-helpers";
import { hasPermission } from "../../../../../authorization";
import { validateRaciMatrixPutInput } from "../../../../../governance/raci-contract";

export const dynamic = "force-dynamic";

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const context = await authorizeApi("raci.view");
  if (isResponse(context)) return context;
  const { id } = await params;
  const { getRaciWorkspace } = await import("../../../../../../db/raci");
  const result = await getRaciWorkspace(id);
  if (result.kind === "not_found") return apiError(404, "PROJECT_NOT_FOUND", "Project was not found.", context.correlationId, context.timestamp);
  return Response.json({ data: result, meta: { correlationId: context.correlationId, timestamp: context.timestamp } }, { headers: apiHeaders(context.correlationId) });
}

export async function PUT(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const context = await authorizeApi("raci.manage");
  if (isResponse(context)) return context;
  let body: unknown;
  try { body = await request.json(); }
  catch { return apiError(400, "INVALID_JSON", "Request body must be valid JSON.", context.correlationId, context.timestamp); }
  const validation = validateRaciMatrixPutInput(body);
  if (!validation.ok) return apiError(422, "VALIDATION_FAILED", "Review the highlighted fields.", context.correlationId, context.timestamp, validation.details);
  if (validation.value.publish && !hasPermission(context.principal, "raci.publish")) {
    return apiError(403, "PUBLISH_FORBIDDEN", "Publishing a RACI revision requires elevated permission.", context.correlationId, context.timestamp);
  }
  const { id } = await params;
  const { putRaciMatrix } = await import("../../../../../../db/raci");
  const result = await putRaciMatrix(id, validation.value, context.principal.user.userId, context.correlationId);
  if (result.kind === "not_found") return apiError(404, "PROJECT_NOT_FOUND", "Project was not found.", context.correlationId, context.timestamp);
  if (result.kind === "invalid_stakeholder_reference") return apiError(422, "INVALID_STAKEHOLDER_REFERENCE", "Every assignment must reference a stakeholder included in this request.", context.correlationId, context.timestamp);
  if (result.kind === "conflict") return apiError(409, "VERSION_CONFLICT", "This RACI matrix changed after you opened it. Refresh and try again.", context.correlationId, context.timestamp);
  const { getRaciWorkspace } = await import("../../../../../../db/raci");
  const workspace = await getRaciWorkspace(id);
  return Response.json({ data: workspace, meta: { correlationId: context.correlationId, timestamp: context.timestamp } }, { headers: apiHeaders(context.correlationId) });
}
