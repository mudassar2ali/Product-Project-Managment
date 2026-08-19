import { authorizeApi, apiError, apiHeaders, isResponse } from "../../v1/api-helpers";
import { validateSignoffRequestInput } from "../../../governance/signoff-contract";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const context = await authorizeApi("signoff.view");
  if (isResponse(context)) return context;
  const url = new URL(request.url);
  const requestedId = (url.searchParams.get("id") ?? "").slice(0, 128);
  if (requestedId) {
    const { getSignoffRequestWorkspace } = await import("../../../../db/signoffs");
    const workspace = await getSignoffRequestWorkspace(requestedId);
    if (workspace.kind === "not_found") return apiError(404, "SIGNOFF_REQUEST_NOT_FOUND", "Sign-off request was not found.", context.correlationId, context.timestamp);
    return Response.json({ data: workspace, meta: { correlationId: context.correlationId, timestamp: context.timestamp } }, { headers: apiHeaders(context.correlationId) });
  }
  const page = Math.max(1, Number.parseInt(url.searchParams.get("page") ?? "1", 10) || 1);
  const pageSize = Math.min(100, Math.max(1, Number.parseInt(url.searchParams.get("pageSize") ?? "30", 10) || 30));
  const rawApprover = (url.searchParams.get("approverUserId") ?? "").slice(0, 128);
  const approverUserId = rawApprover === "me" ? context.principal.user.userId : rawApprover;
  const subjectId = (url.searchParams.get("subjectId") ?? "").slice(0, 128);
  const { listSignoffRequests } = await import("../../../../db/signoffs");
  const result = await listSignoffRequests({ status: (url.searchParams.get("status") ?? "").slice(0, 32), approverUserId, subjectId, page, pageSize });
  return Response.json(
    { data: result.items, meta: { page, pageSize, total: result.total, totalPages: Math.ceil(result.total / pageSize), correlationId: context.correlationId, timestamp: context.timestamp } },
    { headers: apiHeaders(context.correlationId) },
  );
}

export async function POST(request: Request) {
  const context = await authorizeApi("signoff.request");
  if (isResponse(context)) return context;
  let body: unknown;
  try { body = await request.json(); }
  catch { return apiError(400, "INVALID_JSON", "Request body must be valid JSON.", context.correlationId, context.timestamp); }
  const validation = validateSignoffRequestInput(body);
  if (!validation.ok) return apiError(422, "VALIDATION_FAILED", "Review the highlighted fields.", context.correlationId, context.timestamp, validation.details);
  const { createSignoffRequest } = await import("../../../../db/signoffs");
  const result = await createSignoffRequest(validation.value, context.principal.user.userId, context.correlationId);
  if (result.kind === "not_found") return apiError(404, "SUBJECT_NOT_FOUND", "The sign-off subject was not found.", context.correlationId, context.timestamp);
  if (result.kind === "not_eligible") return apiError(422, "SUBJECT_NOT_IN_REVIEW", "Only a subject currently In Review can be sent for sign-off.", context.correlationId, context.timestamp);
  if (result.kind === "invalid_approver") return apiError(422, "INVALID_APPROVER", `The approver assigned to the ${result.laneType} lane is not an active user.`, context.correlationId, context.timestamp, { lanes: result.laneType });
  if (result.kind === "active_exists") return apiError(409, "ACTIVE_SIGNOFF_EXISTS", "This subject already has an active sign-off request.", context.correlationId, context.timestamp);
  return Response.json({ data: result, meta: { correlationId: context.correlationId, timestamp: context.timestamp } }, { status: 201, headers: apiHeaders(context.correlationId) });
}
