import { authorizeApi, apiError, apiHeaders, isResponse } from "../../../v1/api-helpers";
import { validateRequirementRevisionInput } from "../../../../governance/requirement-contract";

export const dynamic = "force-dynamic";

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const context = await authorizeApi("requirement.view");
  if (isResponse(context)) return context;
  const { id } = await params;
  const { getRequirementWorkspace } = await import("../../../../../db/requirements");
  const result = await getRequirementWorkspace(id);
  if (result.kind === "not_found") return apiError(404, "REQUIREMENT_NOT_FOUND", "Requirement was not found.", context.correlationId, context.timestamp);
  return Response.json({ data: result, meta: { correlationId: context.correlationId, timestamp: context.timestamp } }, { headers: apiHeaders(context.correlationId) });
}

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const context = await authorizeApi("requirement.edit");
  if (isResponse(context)) return context;
  let body: unknown;
  try { body = await request.json(); }
  catch { return apiError(400, "INVALID_JSON", "Request body must be valid JSON.", context.correlationId, context.timestamp); }
  const validation = validateRequirementRevisionInput(body);
  if (!validation.ok) return apiError(422, "VALIDATION_FAILED", "Review the highlighted fields.", context.correlationId, context.timestamp, validation.details);
  const expectedVersion = Number((body as Record<string, unknown>).version);
  if (!Number.isInteger(expectedVersion) || expectedVersion < 1) return apiError(422, "VERSION_REQUIRED", "Refresh the requirement and try again.", context.correlationId, context.timestamp, { version: "A current record version is required." });
  const { id } = await params;
  const { updateRequirementDraft } = await import("../../../../../db/requirements");
  const result = await updateRequirementDraft(id, validation.value, expectedVersion, context.principal.user.userId, context.correlationId);
  if (result.kind === "not_found") return apiError(404, "REQUIREMENT_NOT_FOUND", "Requirement was not found.", context.correlationId, context.timestamp);
  if (result.kind === "locked") return apiError(409, "REQUIREMENT_REVISION_LOCKED", "The current revision is submitted and locked. Editing requires a new revision.", context.correlationId, context.timestamp);
  if (result.kind === "conflict") return apiError(409, "VERSION_CONFLICT", "This requirement changed after you opened it. Refresh and try again.", context.correlationId, context.timestamp);
  return Response.json({ data: result.workspace, meta: { correlationId: context.correlationId, timestamp: context.timestamp } }, { headers: apiHeaders(context.correlationId) });
}

export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const context = await authorizeApi("requirement.archive");
  if (isResponse(context)) return context;
  let body: unknown;
  try { body = await request.json(); }
  catch { return apiError(400, "INVALID_JSON", "Request body must be valid JSON.", context.correlationId, context.timestamp); }
  const source = body && typeof body === "object" ? (body as Record<string, unknown>) : {};
  const reason = typeof source.reason === "string" ? source.reason.trim() : "";
  const version = Number(source.version);
  if (reason.length < 5) return apiError(422, "VALIDATION_FAILED", "An archive reason is required.", context.correlationId, context.timestamp, { reason: "Provide at least five characters." });
  if (!Number.isInteger(version) || version < 1) return apiError(422, "VERSION_REQUIRED", "Refresh the requirement and try again.", context.correlationId, context.timestamp, { version: "A current record version is required." });
  const { id } = await params;
  const { archiveRequirement } = await import("../../../../../db/requirements");
  const result = await archiveRequirement(id, version, reason, context.principal.user.userId, context.correlationId);
  if (result.kind === "not_found") return apiError(404, "REQUIREMENT_NOT_FOUND", "Requirement was not found.", context.correlationId, context.timestamp);
  if (result.kind === "not_eligible") return apiError(409, "REQUIREMENT_NOT_ELIGIBLE", "Only a requirement still in its first draft can be archived.", context.correlationId, context.timestamp);
  if (result.kind === "conflict") return apiError(409, "VERSION_CONFLICT", "This requirement changed after you opened it. Refresh and try again.", context.correlationId, context.timestamp);
  return new Response(null, { status: 204 });
}
