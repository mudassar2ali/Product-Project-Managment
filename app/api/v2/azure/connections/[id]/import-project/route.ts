import { authorizeApi, apiError, isResponse } from "../../../../../v1/api-helpers";
import { hasPermission } from "../../../../../../authorization";
import { AzureDevOpsProvider } from "../../../../../../integrations/azure-devops-provider";
export const dynamic = "force-dynamic";
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const context = await authorizeApi("integration.configure");
  if (isResponse(context)) return context;
  const reject = (status: number, code: string, message: string) => apiError(status, code, message, context.correlationId, context.timestamp);
  if (!hasPermission(context.principal, "project.create") || !hasPermission(context.principal, "product.create")) return reject(403, "FORBIDDEN", "Project and Product creation permissions are required.");
  const { id } = await params;
  const body = await request.json().catch(() => null);
  if (!body || typeof body.azureProjectId !== "string" || !/^[0-9a-f-]{36}$/i.test(body.azureProjectId)) return reject(422, "INVALID_PROJECT", "Select a discovered Azure Project.");
  const { getAzureConnection, getCredential } = await import("../../../../../../../db/azure-connections");
  const connection = await getAzureConnection(id);
  if (!connection?.enabled) return reject(404, "CONNECTION_NOT_FOUND", "An active Azure connection is required.");
  const credential = getCredential(connection.credentialBinding);
  if (!credential) return reject(424, "AZURE_CREDENTIAL_NOT_CONFIGURED", "Configure the server credential before importing.");
  try {
    const provider = new AzureDevOpsProvider({ organization: connection.organization, authType: connection.authType as "PAT" | "ENTRA_APPLICATION", credential });
    const source = (await provider.getProjects()).find(project => project.id === body.azureProjectId);
    if (!source) return reject(404, "PROJECT_NOT_VISIBLE", "This Project is not visible to the configured Azure credential.");
    const { importAzureProject } = await import("../../../../../../../db/azure-project-import");
    return Response.json({ data: await importAzureProject(connection, source, context.principal.user.userId, context.correlationId) }, { headers: { "cache-control": "no-store" } });
  } catch (error) {
    console.error("Azure project import failed", { message: error instanceof Error ? error.message : "Unknown error" });
    return reject(502, "AZURE_IMPORT_FAILED", "Project import failed. Existing Projects were preserved; retry or check connection permissions.");
  }
}
