import { authorizeApi, apiError, apiHeaders, isResponse } from "../../../../v1/api-helpers";

export const dynamic = "force-dynamic";

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const context = await authorizeApi("release.scope");
  if (isResponse(context)) return context;
  let body: unknown;
  try { body = await request.json(); }
  catch { return apiError(400, "INVALID_JSON", "Request body must be valid JSON.", context.correlationId, context.timestamp); }
  const version = Number((body as Record<string, unknown>)?.version);
  if (!Number.isInteger(version) || version < 1) return apiError(422, "VERSION_REQUIRED", "Refresh the Release and try again.", context.correlationId, context.timestamp, { version: "A current record version is required." });
  const { id } = await params;
  const { lockReleaseScope } = await import("../../../../../../db/releases");
  const result = await lockReleaseScope(id, version, context.principal.user.userId, context.correlationId);
  const errors = {
    not_found: [404, "RELEASE_NOT_FOUND", "Release was not found."],
    conflict: [409, "VERSION_CONFLICT", "This Release changed after you opened it. Refresh and try again."],
    invalid_transition: [409, "RELEASE_STATUS_TRANSITION_INVALID", "This Release's scope cannot be locked from its current status."],
    empty_scope: [422, "SCOPE_EMPTY", "Add at least one Backlog item to scope before locking."],
  } as const;
  if (result.kind !== "ok") { const error = errors[result.kind]; return apiError(error[0], error[1], error[2], context.correlationId, context.timestamp); }
  return Response.json({ data: result, meta: { correlationId: context.correlationId, timestamp: context.timestamp } }, { headers: apiHeaders(context.correlationId) });
}
