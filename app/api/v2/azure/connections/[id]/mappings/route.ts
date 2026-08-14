import { authorizeApi, apiError, isResponse } from "../../../../../v1/api-helpers";
import { recommendedAzureMappings, validateAzureMappings } from "../../../../../../integrations/azure-mapping-contract";

export const dynamic = "force-dynamic";

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const context = await authorizeApi("integration.view"); if (isResponse(context)) return context;
  const { id } = await params, { listAzureMappings } = await import("../../../../../../../db/azure-mappings"), result = await listAzureMappings(id);
  if (result.kind === "not_found") return apiError(404, "AZURE_CONNECTION_NOT_FOUND", "Azure connection was not found.", context.correlationId, context.timestamp);
  return Response.json({ data: { entries: result.entries, recommendedEntries: recommendedAzureMappings, version: result.connectionVersion }, meta: { correlationId: context.correlationId, timestamp: context.timestamp } }, { headers: { "cache-control": "no-store" } });
}

export async function PUT(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const context = await authorizeApi("integration.configure"); if (isResponse(context)) return context;
  let body: unknown; try { body = await request.json(); } catch { return apiError(400, "INVALID_JSON", "Request body must be valid JSON.", context.correlationId, context.timestamp); }
  const validation = validateAzureMappings(body); if (!validation.ok) return apiError(422, "VALIDATION_FAILED", "Review the Azure normalization mappings.", context.correlationId, context.timestamp, validation.details);
  const { id } = await params, { saveAzureMappings } = await import("../../../../../../../db/azure-mappings"), result = await saveAzureMappings(id, validation.value.entries, validation.value.version, context.principal.user.userId, context.correlationId);
  if (result.kind === "not_found") return apiError(404, "AZURE_CONNECTION_NOT_FOUND", "Azure connection was not found.", context.correlationId, context.timestamp);
  if (result.kind === "conflict") return apiError(409, "VERSION_CONFLICT", "These mappings changed. Refresh and try again.", context.correlationId, context.timestamp);
  return Response.json({ data: { entries: result.entries, version: result.connectionVersion }, meta: { correlationId: context.correlationId, timestamp: context.timestamp } }, { headers: { "cache-control": "no-store" } });
}
