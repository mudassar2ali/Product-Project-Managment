import { authorizeApi, apiError, apiHeaders, isResponse } from "../../v1/api-helpers";
import { parseRequirementType, requirementGovernanceStatuses, validateRequirementRegistrationInput, validateRequirementRevisionInput } from "../../../governance/requirement-contract";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const context = await authorizeApi("requirement.view");
  if (isResponse(context)) return context;
  const url = new URL(request.url);
  const page = Math.max(1, Number.parseInt(url.searchParams.get("page") ?? "1", 10) || 1);
  const pageSize = Math.min(100, Math.max(1, Number.parseInt(url.searchParams.get("pageSize") ?? "30", 10) || 30));
  const requestedType = url.searchParams.get("requirementType") ?? "";
  const requirementType = requestedType ? parseRequirementType(requestedType) : "";
  if (requestedType && !requirementType) return apiError(422, "VALIDATION_FAILED", "Select a valid requirement type.", context.correlationId, context.timestamp, { requirementType: "Requirement type is not supported." });
  const requestedStatus = url.searchParams.get("status") ?? "";
  if (requestedStatus && !requirementGovernanceStatuses.includes(requestedStatus as typeof requirementGovernanceStatuses[number])) return apiError(422, "VALIDATION_FAILED", "Select a valid requirement status.", context.correlationId, context.timestamp, { status: "Status is not supported." });
  const { listRequirements } = await import("../../../../db/requirements");
  const result = await listRequirements({
    requirementType: requirementType || "",
    q: (url.searchParams.get("q") ?? "").trim().slice(0, 120),
    productId: (url.searchParams.get("productId") ?? "").slice(0, 128),
    projectId: (url.searchParams.get("projectId") ?? "").slice(0, 128),
    documentId: (url.searchParams.get("documentId") ?? "").slice(0, 128),
    status: requestedStatus,
    page,
    pageSize,
  });
  return Response.json({ data: result.items, meta: { page, pageSize, total: result.total, totalPages: Math.ceil(result.total / pageSize), correlationId: context.correlationId, timestamp: context.timestamp } }, { headers: apiHeaders(context.correlationId) });
}

export async function POST(request: Request) {
  const context = await authorizeApi("requirement.create");
  if (isResponse(context)) return context;
  let body: unknown;
  try { body = await request.json(); }
  catch { return apiError(400, "INVALID_JSON", "Request body must be valid JSON.", context.correlationId, context.timestamp); }
  const registration = validateRequirementRegistrationInput(body);
  const revision = validateRequirementRevisionInput(body);
  const details = { ...(registration.ok ? {} : registration.details), ...(revision.ok ? {} : revision.details) };
  if (!registration.ok || !revision.ok) return apiError(422, "VALIDATION_FAILED", "Review the highlighted fields.", context.correlationId, context.timestamp, details);
  const { createRequirement } = await import("../../../../db/requirements");
  const result = await createRequirement(registration.value, revision.value, context.principal.user.userId, context.correlationId);
  if (result.kind === "invalid_product") return apiError(422, "INVALID_PRODUCT", "Select an active Product.", context.correlationId, context.timestamp, { productId: "The selected Product is unavailable." });
  if (result.kind === "invalid_project") return apiError(422, "INVALID_PROJECT", "Select a Project belonging to the selected Product.", context.correlationId, context.timestamp, { projectId: "The selected Project does not belong to this Product." });
  if (result.kind === "invalid_document") return apiError(422, "INVALID_DOCUMENT", "Select a governing document belonging to the selected Product.", context.correlationId, context.timestamp, { documentId: "The selected document does not belong to this Product." });
  return Response.json({ data: result, meta: { correlationId: context.correlationId, timestamp: context.timestamp } }, { status: 201, headers: apiHeaders(context.correlationId) });
}
