import { authorizeApi, apiError, apiHeaders, isResponse } from "../../v1/api-helpers";
import { defectSeverities, defectStatuses } from "../../../releases/stage4-contract";
import { validateDefectCreationInput } from "../../../releases/defect-contract";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const context = await authorizeApi("defect.view");
  if (isResponse(context)) return context;
  const url = new URL(request.url);
  const page = Math.max(1, Number.parseInt(url.searchParams.get("page") ?? "1", 10) || 1);
  const pageSize = Math.min(100, Math.max(1, Number.parseInt(url.searchParams.get("pageSize") ?? "30", 10) || 30));
  const status = url.searchParams.get("status") ?? "";
  if (status && !(defectStatuses as readonly string[]).includes(status)) return apiError(422, "VALIDATION_FAILED", "Select a valid defect status.", context.correlationId, context.timestamp, { status: "Status is not supported." });
  const severity = url.searchParams.get("severity") ?? "";
  if (severity && !(defectSeverities as readonly string[]).includes(severity)) return apiError(422, "VALIDATION_FAILED", "Select a valid defect severity.", context.correlationId, context.timestamp, { severity: "Severity is not supported." });
  const { listDefects } = await import("../../../../db/defects");
  const result = await listDefects({
    q: (url.searchParams.get("q") ?? "").trim().slice(0, 120),
    projectId: (url.searchParams.get("projectId") ?? "").slice(0, 128),
    releaseId: (url.searchParams.get("releaseId") ?? "").slice(0, 128),
    assignedToUserId: (url.searchParams.get("assignedToUserId") ?? "").slice(0, 128),
    status,
    severity,
    page,
    pageSize,
  });
  return Response.json({ data: result.items, meta: { page, pageSize, total: result.total, totalPages: Math.ceil(result.total / pageSize), correlationId: context.correlationId, timestamp: context.timestamp } }, { headers: apiHeaders(context.correlationId) });
}

export async function POST(request: Request) {
  const context = await authorizeApi("defect.create");
  if (isResponse(context)) return context;
  let body: unknown;
  try { body = await request.json(); }
  catch { return apiError(400, "INVALID_JSON", "Request body must be valid JSON.", context.correlationId, context.timestamp); }
  const validation = validateDefectCreationInput(body);
  if (!validation.ok) return apiError(422, "VALIDATION_FAILED", "Review the highlighted fields.", context.correlationId, context.timestamp, validation.details);
  const { consumeRateLimit, rateLimitHeaders, recordOperationalEvent } = await import("../../../../db/operations");
  const rateLimit = await consumeRateLimit("DEFECT_CREATE", context.principal.user.userId);
  if (!rateLimit.allowed) return apiError(429, "OPERATION_RATE_LIMITED", "Too many Defects created. Try again shortly.", context.correlationId, context.timestamp, [], rateLimitHeaders(rateLimit));
  const { createDefect } = await import("../../../../db/defects");
  const result = await createDefect(validation.value, context.principal.user.userId, context.correlationId);
  const errors = {
    invalid_project: [422, "INVALID_PROJECT", "Select an active Project."],
    invalid_release: [422, "INVALID_RELEASE", "Select a Release that belongs to this Project."],
    invalid_backlog_item: [422, "INVALID_BACKLOG_ITEM", "Select a Backlog item that belongs to this Project."],
  } as const;
  if (result.kind !== "ok") {
    const error = errors[result.kind];
    await recordOperationalEvent({ operation: "DEFECT_CREATE", outcome: "ERROR", statusCode: error[0], durationMs: 0, actorUserId: context.principal.user.userId, correlationId: context.correlationId, entityType: "Defect" });
    return apiError(error[0], error[1], error[2], context.correlationId, context.timestamp);
  }
  await recordOperationalEvent({ operation: "DEFECT_CREATE", outcome: "SUCCESS", statusCode: 201, durationMs: 0, actorUserId: context.principal.user.userId, correlationId: context.correlationId, entityType: "Defect", entityId: result.defect.id });
  return Response.json({ data: result.defect, meta: { correlationId: context.correlationId, timestamp: context.timestamp } }, { status: 201, headers: apiHeaders(context.correlationId, rateLimitHeaders(rateLimit)) });
}
