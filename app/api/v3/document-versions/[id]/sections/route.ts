import { authorizeApi, apiError, apiHeaders, isResponse } from "../../../../v1/api-helpers";
import { validateGovernanceSections } from "../../../../../governance/brd-contract";

export const dynamic = "force-dynamic";

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const context = await authorizeApi("document.view");
  if (isResponse(context)) return context;
  const { id } = await params;
  const { getGovernanceVersionSections } = await import("../../../../../../db/governance-documents");
  const result = await getGovernanceVersionSections(id);
  if (result.kind === "not_found") return apiError(404, "DOCUMENT_VERSION_NOT_FOUND", "Document version was not found.", context.correlationId, context.timestamp);
  return Response.json({ data: result, meta: { correlationId: context.correlationId, timestamp: context.timestamp } }, { headers: apiHeaders(context.correlationId) });
}

export async function PUT(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const context = await authorizeApi("document.edit");
  if (isResponse(context)) return context;
  let body: unknown;
  try { body = await request.json(); }
  catch { return apiError(400, "INVALID_JSON", "Request body must be valid JSON.", context.correlationId, context.timestamp); }
  const { id } = await params;
  const { getGovernanceVersionSections, replaceGovernanceSections } = await import("../../../../../../db/governance-documents");
  const persisted = await getGovernanceVersionSections(id);
  if (persisted.kind === "not_found") return apiError(404, "DOCUMENT_VERSION_NOT_FOUND", "Document version was not found.", context.correlationId, context.timestamp);
  const validation = validateGovernanceSections(body, persisted.version.documentType);
  if (!validation.ok) return apiError(422, "VALIDATION_FAILED", `Review the ${persisted.version.documentType} sections.`, context.correlationId, context.timestamp, validation.details);
  try {
    const result = await replaceGovernanceSections(id, validation.value.sections, validation.value.version, context.principal.user.userId, context.correlationId);
    const errors = {
      not_found: [404, "DOCUMENT_VERSION_NOT_FOUND", "Document version was not found."],
      locked: [409, "GOVERNANCE_VERSION_LOCKED", "Submitted document content cannot be edited."],
      conflict: [409, "VERSION_CONFLICT", "This document changed after you opened it. Refresh and try again."],
      invalid_sections: [422, "VALIDATION_FAILED", "Sections do not match the persisted document type."],
    } as const;
    if (result.kind !== "ok") { const error = errors[result.kind]; return apiError(error[0], error[1], error[2], context.correlationId, context.timestamp); }
    return Response.json({ data: result.workspace, meta: { correlationId: context.correlationId, timestamp: context.timestamp } }, { headers: apiHeaders(context.correlationId) });
  } catch (error) {
    const locked = error instanceof Error && error.message.includes("GOVERNANCE_VERSION_LOCKED");
    return apiError(locked ? 409 : 500, locked ? "GOVERNANCE_VERSION_LOCKED" : "DOCUMENT_SAVE_FAILED", locked ? "Submitted document content cannot be edited." : "The document sections could not be saved.", context.correlationId, context.timestamp);
  }
}
