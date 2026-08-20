import { authorizeApi, apiError, apiHeaders, isResponse } from "../../../v1/api-helpers";
import { validateReleaseMetadataInput } from "../../../../releases/release-contract";

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

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const context = await authorizeApi("release.edit");
  if (isResponse(context)) return context;
  let body: unknown;
  try { body = await request.json(); }
  catch { return apiError(400, "INVALID_JSON", "Request body must be valid JSON.", context.correlationId, context.timestamp); }
  const validation = validateReleaseMetadataInput(body);
  if (!validation.ok) return apiError(422, "VALIDATION_FAILED", "Review the highlighted fields.", context.correlationId, context.timestamp, validation.details);
  const version = Number((body as Record<string, unknown>).version);
  if (!Number.isInteger(version) || version < 1) return apiError(422, "VERSION_REQUIRED", "Refresh the Release and try again.", context.correlationId, context.timestamp, { version: "A current record version is required." });
  const { id } = await params;
  const { updateReleaseMetadata } = await import("../../../../../db/releases");
  const result = await updateReleaseMetadata(id, validation.value, version, context.principal.user.userId, context.correlationId);
  const errors = {
    not_found: [404, "RELEASE_NOT_FOUND", "Release was not found."],
    conflict: [409, "VERSION_CONFLICT", "This Release changed after you opened it. Refresh and try again."],
  } as const;
  if (result.kind !== "ok") { const error = errors[result.kind]; return apiError(error[0], error[1], error[2], context.correlationId, context.timestamp); }
  return Response.json({ data: result, meta: { correlationId: context.correlationId, timestamp: context.timestamp } }, { headers: apiHeaders(context.correlationId) });
}
