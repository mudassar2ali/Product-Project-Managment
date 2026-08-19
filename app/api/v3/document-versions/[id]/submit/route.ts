import { authorizeApi, apiError, apiHeaders, isResponse } from "../../../../v1/api-helpers";

export const dynamic = "force-dynamic";

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const context = await authorizeApi("document.submit");
  if (isResponse(context)) return context;
  const { consumeRateLimit, rateLimitHeaders, recordOperationalEvent } = await import("../../../../../../db/operations");
  const rateLimit = await consumeRateLimit("GOVERNANCE_SUBMIT", context.principal.user.userId);
  if (!rateLimit.allowed) return apiError(429, "OPERATION_RATE_LIMITED", "Document submission is temporarily limited. Try again after the stated interval.", context.correlationId, context.timestamp, [], rateLimitHeaders(rateLimit));
  let body: unknown;
  try { body = await request.json(); }
  catch { return apiError(400, "INVALID_JSON", "Request body must be valid JSON.", context.correlationId, context.timestamp); }
  const source = body && typeof body === "object" ? body as Record<string, unknown> : {};
  const version = Number(source.version);
  if (!Number.isInteger(version) || version < 1) return apiError(422, "VERSION_REQUIRED", "Refresh the document and try again.", context.correlationId, context.timestamp, { version: "A current version is required." });
  const { id } = await params;
  const { submitGovernanceVersion } = await import("../../../../../../db/governance-documents");
  try {
    const result = await submitGovernanceVersion(id, version, context.principal.user.userId, context.correlationId);
    if (result.kind === "not_found") return apiError(404, "DOCUMENT_VERSION_NOT_FOUND", "Document version was not found.", context.correlationId, context.timestamp);
    if (result.kind === "locked") return apiError(409, "GOVERNANCE_VERSION_LOCKED", "This document version is already locked.", context.correlationId, context.timestamp);
    if (result.kind === "conflict") return apiError(409, "VERSION_CONFLICT", "This document changed after you opened it. Refresh and try again.", context.correlationId, context.timestamp);
    if (result.kind === "incomplete") return apiError(422, "DOCUMENT_INCOMPLETE", "Complete every required document section before review.", context.correlationId, context.timestamp, { sections: result.sections.join(", ") });
    await recordOperationalEvent({ operation: "GOVERNANCE_SUBMIT", outcome: "SUCCESS", statusCode: 200, durationMs: 0, actorUserId: context.principal.user.userId, correlationId: context.correlationId, entityType: "GovernanceDocumentVersion", entityId: id });
    return Response.json({ data: result.workspace, meta: { correlationId: context.correlationId, timestamp: context.timestamp } }, { headers: apiHeaders(context.correlationId, rateLimitHeaders(rateLimit)) });
  } catch {
    await recordOperationalEvent({ operation: "GOVERNANCE_SUBMIT", outcome: "ERROR", statusCode: 500, durationMs: 0, actorUserId: context.principal.user.userId, correlationId: context.correlationId, entityType: "GovernanceDocumentVersion", entityId: id });
    return apiError(500, "DOCUMENT_SUBMIT_FAILED", "The document could not be submitted for review.", context.correlationId, context.timestamp);
  }
}
