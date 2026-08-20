import { authorizeApi, apiError, apiHeaders, isResponse } from "../../../../v1/api-helpers";
import { validateDeploymentRecordInput } from "../../../../../releases/deployment-contract";

export const dynamic = "force-dynamic";

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const context = await authorizeApi("deployment.view");
  if (isResponse(context)) return context;
  const { id } = await params;
  const { listDeploymentRecords } = await import("../../../../../../db/deployments");
  const items = await listDeploymentRecords(id);
  return Response.json({ data: items, meta: { correlationId: context.correlationId, timestamp: context.timestamp } }, { headers: apiHeaders(context.correlationId) });
}

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const context = await authorizeApi("deployment.record");
  if (isResponse(context)) return context;
  let body: unknown;
  try { body = await request.json(); }
  catch { return apiError(400, "INVALID_JSON", "Request body must be valid JSON.", context.correlationId, context.timestamp); }
  const validation = validateDeploymentRecordInput(body);
  if (!validation.ok) return apiError(422, "VALIDATION_FAILED", "Review the highlighted fields.", context.correlationId, context.timestamp, validation.details);
  const { id } = await params;
  const { recordDeployment } = await import("../../../../../../db/deployments");
  const result = await recordDeployment(id, validation.value, context.principal.user.userId, context.correlationId);
  const errors = {
    not_found: [404, "RELEASE_NOT_FOUND", "Release was not found."],
    release_cancelled: [409, "RELEASE_CANCELLED", "This Release is cancelled and cannot receive deployment evidence."],
    invalid_environment: [422, "INVALID_ENVIRONMENT", "Select an active environment that belongs to this Release's Project."],
    completion_invalid: [422, "DEPLOYMENT_COMPLETION_INVALID", "Completion time is required for a terminal status and not allowed otherwise."],
    invalid_rollback_target: [422, "INVALID_ROLLBACK_TARGET", "Select a successful deployment on this Release to roll back."],
  } as const;
  if (result.kind !== "ok") { const error = errors[result.kind]; return apiError(error[0], error[1], error[2], context.correlationId, context.timestamp); }
  return Response.json({ data: result, meta: { correlationId: context.correlationId, timestamp: context.timestamp } }, { status: 201, headers: apiHeaders(context.correlationId) });
}
