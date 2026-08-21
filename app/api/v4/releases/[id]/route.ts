import { authorizeApi, apiError, apiHeaders, isResponse } from "../../../v1/api-helpers";
import { validateReleaseMetadataInput, validateReleaseStatusTransitionInput } from "../../../../releases/release-contract";

export const dynamic = "force-dynamic";

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const context = await authorizeApi("release.view");
  if (isResponse(context)) return context;
  const { id } = await params;
  const { getRelease } = await import("../../../../../db/releases");
  const result = await getRelease(id);
  if (result.kind === "not_found") return apiError(404, "RELEASE_NOT_FOUND", "Release was not found.", context.correlationId, context.timestamp);
  return Response.json({ data: result, meta: { correlationId: context.correlationId, timestamp: context.timestamp } }, { headers: apiHeaders(context.correlationId) });
}

// Section 17 describes this single endpoint as covering both "Release metadata/status" — a manual
// status transition is requested by including a non-empty `status` field, dispatching to
// transitionReleaseStatus (a deliberately narrow allowlist — see release-contract.ts) instead of the
// metadata path below, which is otherwise unchanged from Step 3.
export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const context = await authorizeApi("release.edit");
  if (isResponse(context)) return context;
  let body: unknown;
  try { body = await request.json(); }
  catch { return apiError(400, "INVALID_JSON", "Request body must be valid JSON.", context.correlationId, context.timestamp); }
  const { id } = await params;
  const source = body && typeof body === "object" ? (body as Record<string, unknown>) : {};

  if (typeof source.status === "string" && source.status.trim()) {
    const validation = validateReleaseStatusTransitionInput(body);
    if (!validation.ok) return apiError(422, "VALIDATION_FAILED", "Review the highlighted fields.", context.correlationId, context.timestamp, validation.details);
    const version = Number(source.version);
    if (!Number.isInteger(version) || version < 1) return apiError(422, "VERSION_REQUIRED", "Refresh the Release and try again.", context.correlationId, context.timestamp, { version: "A current record version is required." });
    const { transitionReleaseStatus } = await import("../../../../../db/releases");
    const result = await transitionReleaseStatus(id, validation.value.status, version, context.principal.user.userId, context.correlationId);
    const statusErrors = {
      not_found: [404, "RELEASE_NOT_FOUND", "Release was not found."],
      conflict: [409, "VERSION_CONFLICT", "This Release changed after you opened it. Refresh and try again."],
      invalid_transition: [409, "RELEASE_STATUS_TRANSITION_INVALID", "This status change is not allowed from the Release's current status."],
      uat_not_started: [409, "UAT_NOT_STARTED", "Start at least one UAT campaign (Planned or In Progress) before moving to In UAT."],
      readiness_stale: [409, "READINESS_SNAPSHOT_STALE", "Recalculate readiness before requesting sign-off — the latest snapshot does not reflect current evidence."],
    } as const;
    if (result.kind !== "ok") { const error = statusErrors[result.kind]; return apiError(error[0], error[1], error[2], context.correlationId, context.timestamp); }
    return Response.json({ data: result, meta: { correlationId: context.correlationId, timestamp: context.timestamp } }, { headers: apiHeaders(context.correlationId) });
  }

  const validation = validateReleaseMetadataInput(body);
  if (!validation.ok) return apiError(422, "VALIDATION_FAILED", "Review the highlighted fields.", context.correlationId, context.timestamp, validation.details);
  const version = Number(source.version);
  if (!Number.isInteger(version) || version < 1) return apiError(422, "VERSION_REQUIRED", "Refresh the Release and try again.", context.correlationId, context.timestamp, { version: "A current record version is required." });
  const { updateReleaseMetadata } = await import("../../../../../db/releases");
  const result = await updateReleaseMetadata(id, validation.value, version, context.principal.user.userId, context.correlationId);
  const errors = {
    not_found: [404, "RELEASE_NOT_FOUND", "Release was not found."],
    conflict: [409, "VERSION_CONFLICT", "This Release changed after you opened it. Refresh and try again."],
  } as const;
  if (result.kind !== "ok") { const error = errors[result.kind]; return apiError(error[0], error[1], error[2], context.correlationId, context.timestamp); }
  return Response.json({ data: result, meta: { correlationId: context.correlationId, timestamp: context.timestamp } }, { headers: apiHeaders(context.correlationId) });
}
