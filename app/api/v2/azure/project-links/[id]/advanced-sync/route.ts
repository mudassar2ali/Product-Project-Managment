import { authorizeApi, apiError, apiHeaders, isResponse } from "../../../../../v1/api-helpers";
import { AzureDevOpsProvider } from "../../../../../../integrations/azure-devops-provider";

export const dynamic = "force-dynamic";

export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const startedAt = Date.now();
  const context = await authorizeApi("integration.sync");
  if (isResponse(context)) return context;
  const { id } = await params;
  const operations = await import("../../../../../../../db/operations");
  const observe = (outcome: "SUCCESS" | "REJECTED" | "ERROR" | "RATE_LIMITED", statusCode: number, details: Record<string, unknown> = {}) => operations.recordOperationalEvent({
    operation: "ADVANCED_SYNC",
    outcome,
    statusCode,
    durationMs: Date.now() - startedAt,
    actorUserId: context.principal.user.userId,
    correlationId: context.correlationId,
    entityType: "AzureProjectLink",
    entityId: id,
    details,
  });
  const reject = async (status: number, code: string, message: string, outcome: "REJECTED" | "ERROR" = "REJECTED") => {
    await observe(outcome, status, { errorCode: code });
    return apiError(status, code, message, context.correlationId, new Date().toISOString());
  };

  const rateLimit = await operations.consumeRateLimit("ADVANCED_SYNC", context.principal.user.userId, id);
  if (!rateLimit.allowed) {
    await observe("RATE_LIMITED", 429, { errorCode: "OPERATION_RATE_LIMITED", retryAfterSeconds: rateLimit.retryAfter });
    return apiError(429, "OPERATION_RATE_LIMITED", "Advanced synchronization is temporarily limited. Try again after the stated interval.", context.correlationId, context.timestamp, [], operations.rateLimitHeaders(rateLimit));
  }

  const repository = await import("../../../../../../../db/azure-advanced-sync");
  const sync = await repository.getAdvancedSyncContext(id);
  if (!sync) return reject(404, "AZURE_PROJECT_LINK_NOT_FOUND", "Azure Project link was not found.");
  const { getCredential } = await import("../../../../../../../db/azure-connections");
  const credential = getCredential(sync.credentialBinding);
  if (!credential) return reject(424, "AZURE_CREDENTIAL_NOT_CONFIGURED", "Configure the server credential before synchronizing.");
  const { getActiveAzureMappingMap } = await import("../../../../../../../db/azure-mappings");
  const mappings = await getActiveAzureMappingMap(sync.connectionId);
  if (!mappings.types.size || !mappings.states.size) return reject(422, "AZURE_MAPPING_NOT_CONFIGURED", "Configure at least one Azure type and state mapping before advanced synchronization.");
  const run = await repository.beginAdvancedSync(id, context.principal.user.userId, context.correlationId);
  if (run.kind === "in_progress") return reject(409, "AZURE_SYNC_IN_PROGRESS", "This Azure Project link is already synchronizing.");

  try {
    const provider = new AzureDevOpsProvider({ organization: sync.organization, authType: sync.authType as "ENTRA_APPLICATION" | "PAT", credential });
    const [source, sprintSource] = await Promise.all([
      provider.getAdvancedWorkItems(sync.azureProjectId, sync.azureTeamId),
      sync.azureTeamId ? provider.getSprintHistory(sync.azureProjectId, sync.azureTeamId) : Promise.resolve(null),
    ]);
    const result = await repository.completeAdvancedSync(run.id, sync, source, sprintSource, context.principal.user.userId, context.correlationId);
    if (result.kind !== "ok") {
      const code = result.kind === "partial_source" ? "AZURE_PARTIAL_SOURCE" : "AZURE_MAPPING_NOT_CONFIGURED";
      const message = result.kind === "partial_source" ? "Azure returned incomplete work-item evidence; the previous complete snapshot was preserved." : "Azure normalization mappings are incomplete.";
      await repository.failAdvancedSync(run.id, id, code, message, context.principal.user.userId, context.correlationId);
      return reject(502, code, message, "ERROR");
    }
    await observe("SUCCESS", 200, { runId: result.runId, pagesRead: result.pagesRead, itemsSeen: result.itemsSeen, inserted: result.inserted, updated: result.updated, missing: result.missing, unmappedTypes: result.unmappedTypes, unmappedStates: result.unmappedStates, iterationsSeen: result.iterationsSeen });
    return Response.json({ data: result, meta: { correlationId: context.correlationId, timestamp: result.syncedAt } }, { headers: apiHeaders(context.correlationId, operations.rateLimitHeaders(rateLimit)) });
  } catch (error) {
    const status = (error as { status?: number }).status;
    const code = status === 401 ? "AZURE_AUTHENTICATION_FAILED" : status === 403 ? "AZURE_PERMISSION_DENIED" : status === 404 ? "AZURE_PROJECT_NOT_FOUND" : status === 429 ? "AZURE_RATE_LIMITED" : error instanceof DOMException && error.name === "AbortError" ? "AZURE_TIMEOUT" : "AZURE_ADVANCED_SYNC_FAILED";
    const message = code === "AZURE_AUTHENTICATION_FAILED" ? "Azure rejected the configured credential." : code === "AZURE_PERMISSION_DENIED" ? "The credential cannot read Azure work items, relations and Team iterations." : code === "AZURE_PROJECT_NOT_FOUND" ? "The linked Azure Project or Team is unavailable." : code === "AZURE_RATE_LIMITED" ? "Azure rate-limited synchronization. Try again later." : code === "AZURE_TIMEOUT" ? "Azure synchronization timed out; the previous complete snapshot was preserved." : "Azure normalized work items and Sprint evidence could not be synchronized.";
    await repository.failAdvancedSync(run.id, id, code, message, context.principal.user.userId, context.correlationId);
    return reject(status === 401 ? 401 : status === 403 ? 403 : status === 404 ? 404 : status === 429 ? 429 : 502, code, message, "ERROR");
  }
}
