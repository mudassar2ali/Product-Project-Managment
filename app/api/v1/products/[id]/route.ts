import { authorizeApi, apiError, isResponse } from "../../api-helpers";
import { validateProductInput } from "../../../../products/product-contract";

export const dynamic = "force-dynamic";

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const context = await authorizeApi("product.view");
  if (isResponse(context)) return context;
  const { id } = await params;
  const { getProduct } = await import("../../../../../db/products");
  const product = await getProduct(id);
  if (!product) return apiError(404, "PRODUCT_NOT_FOUND", "Product was not found.", context.correlationId, context.timestamp);
  return Response.json({ data: product, meta: { correlationId: context.correlationId, timestamp: context.timestamp } }, { headers: { "cache-control": "no-store" } });
}

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const context = await authorizeApi("product.edit");
  if (isResponse(context)) return context;
  const { id } = await params;
  let body: unknown;
  try { body = await request.json(); } catch { return apiError(400, "INVALID_JSON", "Request body must be valid JSON.", context.correlationId, context.timestamp); }
  const source = body && typeof body === "object" ? body as Record<string, unknown> : {};
  const validation = validateProductInput(source);
  if (!validation.ok) return apiError(422, "VALIDATION_FAILED", "Review the highlighted fields.", context.correlationId, context.timestamp, validation.details);
  const expectedVersion = Number(source.version);
  if (!Number.isInteger(expectedVersion) || expectedVersion < 1) return apiError(422, "VERSION_REQUIRED", "A valid record version is required.", context.correlationId, context.timestamp, { version: "Refresh and try again." });
  try {
    const { updateProduct } = await import("../../../../../db/products");
    const result = await updateProduct(id, validation.value, expectedVersion, context.principal.user.userId, context.correlationId);
    if (result.kind === "not_found") return apiError(404, "PRODUCT_NOT_FOUND", "Product was not found.", context.correlationId, context.timestamp);
    if (result.kind === "conflict") return apiError(409, "UPDATE_CONFLICT", "This Product changed after you opened it. Refresh and try again.", context.correlationId, context.timestamp);
    return Response.json({ data: result.product, meta: { correlationId: context.correlationId, timestamp: context.timestamp } }, { headers: { "cache-control": "no-store" } });
  } catch { return apiError(409, "DUPLICATE_PRODUCT", "A Product with this code already exists.", context.correlationId, context.timestamp); }
}

export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const context = await authorizeApi("product.archive");
  if (isResponse(context)) return context;
  const { id } = await params;
  let body: unknown;
  try { body = await request.json(); } catch { return apiError(400, "INVALID_JSON", "Request body must be valid JSON.", context.correlationId, context.timestamp); }
  const source = body && typeof body === "object" ? body as Record<string, unknown> : {};
  const reason = typeof source.reason === "string" ? source.reason.trim() : "";
  const version = Number(source.version);
  if (reason.length < 5) return apiError(422, "VALIDATION_FAILED", "An archive reason is required.", context.correlationId, context.timestamp, { reason: "Provide at least five characters." });
  const { archiveProduct } = await import("../../../../../db/products");
  const result = await archiveProduct(id, version, reason, context.principal.user.userId, context.correlationId);
  if (result.kind === "not_found") return apiError(404, "PRODUCT_NOT_FOUND", "Product was not found.", context.correlationId, context.timestamp);
  if (result.kind === "conflict") return apiError(409, "UPDATE_CONFLICT", "This Product changed after you opened it. Refresh and try again.", context.correlationId, context.timestamp);
  return new Response(null, { status: 204 });
}
