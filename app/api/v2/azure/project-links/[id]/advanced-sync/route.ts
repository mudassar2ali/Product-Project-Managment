import { authorizeApi, apiError, isResponse } from "../../../../../v1/api-helpers";
import { AzureDevOpsProvider } from "../../../../../../integrations/azure-devops-provider";

export const dynamic = "force-dynamic";

export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const context = await authorizeApi("integration.sync"); if (isResponse(context)) return context;
  const { id } = await params, repository = await import("../../../../../../../db/azure-advanced-sync"), sync = await repository.getAdvancedSyncContext(id);
  if (!sync) return apiError(404, "AZURE_PROJECT_LINK_NOT_FOUND", "Azure Project link was not found.", context.correlationId, context.timestamp);
  const { getCredential } = await import("../../../../../../../db/azure-connections"), credential = getCredential(sync.credentialBinding);
  if (!credential) return apiError(424, "AZURE_CREDENTIAL_NOT_CONFIGURED", "Configure the server credential before synchronizing.", context.correlationId, context.timestamp);
  const { getActiveAzureMappingMap } = await import("../../../../../../../db/azure-mappings"), mappings = await getActiveAzureMappingMap(sync.connectionId);
  if (!mappings.types.size || !mappings.states.size) return apiError(422, "AZURE_MAPPING_NOT_CONFIGURED", "Configure at least one Azure type and state mapping before advanced synchronization.", context.correlationId, context.timestamp);
  const run = await repository.beginAdvancedSync(id, context.principal.user.userId, context.correlationId);
  if (run.kind === "in_progress") return apiError(409, "AZURE_SYNC_IN_PROGRESS", "This Azure Project link is already synchronizing.", context.correlationId, context.timestamp);
  try {
    const provider = new AzureDevOpsProvider({ organization: sync.organization, authType: sync.authType as "ENTRA_APPLICATION" | "PAT", credential }), source = await provider.getAdvancedWorkItems(sync.azureProjectId, sync.azureTeamId);
    const result = await repository.completeAdvancedSync(run.id, sync, source, context.principal.user.userId, context.correlationId);
    if (result.kind !== "ok") { const code = result.kind === "partial_source" ? "AZURE_PARTIAL_SOURCE" : "AZURE_MAPPING_NOT_CONFIGURED", message = result.kind === "partial_source" ? "Azure returned incomplete work-item evidence; the previous complete snapshot was preserved." : "Azure normalization mappings are incomplete."; await repository.failAdvancedSync(run.id, id, code, message, context.principal.user.userId, context.correlationId); return apiError(502, code, message, context.correlationId, new Date().toISOString()); }
    return Response.json({ data: result, meta: { correlationId: context.correlationId, timestamp: result.syncedAt } }, { headers: { "cache-control": "no-store" } });
  } catch (error) {
    const status = (error as { status?: number }).status, code = status === 401 ? "AZURE_AUTHENTICATION_FAILED" : status === 403 ? "AZURE_PERMISSION_DENIED" : status === 404 ? "AZURE_PROJECT_NOT_FOUND" : status === 429 ? "AZURE_RATE_LIMITED" : error instanceof DOMException && error.name === "AbortError" ? "AZURE_TIMEOUT" : "AZURE_ADVANCED_SYNC_FAILED", message = code === "AZURE_AUTHENTICATION_FAILED" ? "Azure rejected the configured credential." : code === "AZURE_PERMISSION_DENIED" ? "The credential cannot read Azure work items and relations." : code === "AZURE_PROJECT_NOT_FOUND" ? "The linked Azure Project or Team is unavailable." : code === "AZURE_RATE_LIMITED" ? "Azure rate-limited synchronization. Try again later." : code === "AZURE_TIMEOUT" ? "Azure synchronization timed out; the previous complete snapshot was preserved." : "Azure normalized work items could not be synchronized.";
    await repository.failAdvancedSync(run.id, id, code, message, context.principal.user.userId, context.correlationId);
    return apiError(status === 401 ? 401 : status === 403 ? 403 : status === 404 ? 404 : status === 429 ? 429 : 502, code, message, context.correlationId, new Date().toISOString());
  }
}
