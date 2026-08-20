import { authorizeApi, apiError, apiHeaders, isResponse } from "../../../../v1/api-helpers";
import { validateEnvironmentRegistrationInput } from "../../../../../releases/deployment-contract";

export const dynamic = "force-dynamic";

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const context = await authorizeApi("deployment.view");
  if (isResponse(context)) return context;
  const { id } = await params;
  const { listEnvironments } = await import("../../../../../../db/deployments");
  const items = await listEnvironments(id);
  return Response.json({ data: items, meta: { correlationId: context.correlationId, timestamp: context.timestamp } }, { headers: apiHeaders(context.correlationId) });
}

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const context = await authorizeApi("deployment.record");
  if (isResponse(context)) return context;
  let body: unknown;
  try { body = await request.json(); }
  catch { return apiError(400, "INVALID_JSON", "Request body must be valid JSON.", context.correlationId, context.timestamp); }
  const validation = validateEnvironmentRegistrationInput(body);
  if (!validation.ok) return apiError(422, "VALIDATION_FAILED", "Review the highlighted fields.", context.correlationId, context.timestamp, validation.details);
  const { id } = await params;
  const { createEnvironment } = await import("../../../../../../db/deployments");
  const result = await createEnvironment(id, validation.value, context.principal.user.userId, context.correlationId);
  const errors = {
    invalid_project: [422, "INVALID_PROJECT", "Select an active Project."],
    duplicate: [409, "DUPLICATE_ENVIRONMENT_CODE", "An environment with this code already exists for this Project."],
  } as const;
  if (result.kind !== "ok") { const error = errors[result.kind]; return apiError(error[0], error[1], error[2], context.correlationId, context.timestamp); }
  return Response.json({ data: result.items, meta: { correlationId: context.correlationId, timestamp: context.timestamp } }, { status: 201, headers: apiHeaders(context.correlationId) });
}
