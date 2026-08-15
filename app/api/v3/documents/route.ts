import { authorizeApi, apiError, apiHeaders, isResponse } from "../../v1/api-helpers";
import { brdLifecycleFilters, validateBrdDocumentInput } from "../../../governance/brd-contract";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const context = await authorizeApi("document.view");
  if (isResponse(context)) return context;
  const url = new URL(request.url);
  const page = Math.max(1, Number.parseInt(url.searchParams.get("page") ?? "1", 10) || 1);
  const pageSize = Math.min(100, Math.max(1, Number.parseInt(url.searchParams.get("pageSize") ?? "30", 10) || 30));
  const requestedStatus = url.searchParams.get("status") ?? "";
  if (requestedStatus && !brdLifecycleFilters.includes(requestedStatus as typeof brdLifecycleFilters[number])) return apiError(422, "VALIDATION_FAILED", "Select a valid document status.", context.correlationId, context.timestamp, { status: "Status is not supported." });
  const { listBrdDocuments } = await import("../../../../db/governance-documents");
  const result = await listBrdDocuments({
    q: (url.searchParams.get("q") ?? "").trim().slice(0, 120),
    productId: (url.searchParams.get("productId") ?? "").slice(0, 128),
    projectId: (url.searchParams.get("projectId") ?? "").slice(0, 128),
    status: requestedStatus,
    page,
    pageSize,
  });
  return Response.json({ data: result.items, meta: { page, pageSize, total: result.total, totalPages: Math.ceil(result.total / pageSize), correlationId: context.correlationId, timestamp: context.timestamp } }, { headers: apiHeaders(context.correlationId) });
}

export async function POST(request: Request) {
  const context = await authorizeApi("document.create");
  if (isResponse(context)) return context;
  let body: unknown;
  try { body = await request.json(); }
  catch { return apiError(400, "INVALID_JSON", "Request body must be valid JSON.", context.correlationId, context.timestamp); }
  const validation = validateBrdDocumentInput(body);
  if (!validation.ok) return apiError(422, "VALIDATION_FAILED", "Review the highlighted fields.", context.correlationId, context.timestamp, validation.details);
  const { createBrd } = await import("../../../../db/governance-documents");
  try {
    const result = await createBrd(validation.value, context.principal.user.userId, context.correlationId);
    if (result.kind === "invalid_product") return apiError(422, "INVALID_PRODUCT", "Select an active Product.", context.correlationId, context.timestamp, { productId: "The selected Product is unavailable." });
    if (result.kind === "invalid_project") return apiError(422, "INVALID_PROJECT", "Select a Project belonging to the selected Product.", context.correlationId, context.timestamp, { projectId: "The selected Project does not belong to this Product." });
    return Response.json({ data: result, meta: { correlationId: context.correlationId, timestamp: context.timestamp } }, { status: 201, headers: apiHeaders(context.correlationId) });
  } catch { return apiError(500, "BRD_CREATE_FAILED", "The BRD could not be created.", context.correlationId, context.timestamp); }
}
