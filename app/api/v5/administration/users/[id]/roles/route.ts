import { authorizeApi, apiError, apiHeaders, isResponse } from "../../../../../v1/api-helpers";

export const dynamic = "force-dynamic";

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const context = await authorizeApi("admin.roles");
  if (isResponse(context)) return context;
  const { id } = await params;
  const { getUserRoleAssignments } = await import("../../../../../../../db/administration");
  const assignments = await getUserRoleAssignments(id);
  if (assignments === null) return apiError(404, "USER_NOT_FOUND", "This user was not found.", context.correlationId, context.timestamp);
  return Response.json({ data: assignments, meta: { correlationId: context.correlationId, timestamp: context.timestamp } }, { headers: apiHeaders(context.correlationId) });
}

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const context = await authorizeApi("admin.roles");
  if (isResponse(context)) return context;
  let body: unknown;
  try { body = await request.json(); }
  catch { return apiError(400, "INVALID_JSON", "Request body must be valid JSON.", context.correlationId, context.timestamp); }
  const roleCode = (body as Record<string, unknown>)?.roleCode;
  if (typeof roleCode !== "string" || !roleCode) return apiError(422, "VALIDATION_FAILED", "Review the highlighted fields.", context.correlationId, context.timestamp, { roleCode: "Select a role to assign." });
  const { consumeRateLimit, rateLimitHeaders, recordOperationalEvent } = await import("../../../../../../../db/operations");
  const rateLimit = await consumeRateLimit("ROLE_ASSIGN", context.principal.user.userId);
  if (!rateLimit.allowed) return apiError(429, "OPERATION_RATE_LIMITED", "Too many role assignments. Try again shortly.", context.correlationId, context.timestamp, [], rateLimitHeaders(rateLimit));
  const { id } = await params;
  const { assignRole } = await import("../../../../../../../db/administration");
  const result = await assignRole(id, roleCode, context.principal.user.userId, context.correlationId);
  const errors = {
    user_not_found: [404, "USER_NOT_FOUND", "This user was not found."],
    invalid_role: [422, "INVALID_ROLE", "Select a valid role."],
    duplicate: [409, "DUPLICATE_ASSIGNMENT", "This user already holds this role."],
  } as const;
  if (result.kind !== "ok") {
    const error = errors[result.kind];
    await recordOperationalEvent({ operation: "ROLE_ASSIGN", outcome: "ERROR", statusCode: error[0], durationMs: 0, actorUserId: context.principal.user.userId, correlationId: context.correlationId, entityType: "UserRoleAssignment" });
    return apiError(error[0], error[1], error[2], context.correlationId, context.timestamp);
  }
  await recordOperationalEvent({ operation: "ROLE_ASSIGN", outcome: "SUCCESS", statusCode: 201, durationMs: 0, actorUserId: context.principal.user.userId, correlationId: context.correlationId, entityType: "UserRoleAssignment", entityId: id });
  return Response.json({ data: result.assignments, meta: { correlationId: context.correlationId, timestamp: context.timestamp } }, { status: 201, headers: apiHeaders(context.correlationId, rateLimitHeaders(rateLimit)) });
}
