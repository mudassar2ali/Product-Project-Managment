import { authorizeApi, apiError, isResponse } from "../api-helpers";
import { validateProductInput } from "../../../products/product-contract";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const context = await authorizeApi("product.view");
  if (isResponse(context)) return context;
  const url = new URL(request.url);
  const page = Math.max(1, Number.parseInt(url.searchParams.get("page") ?? "1", 10) || 1);
  const pageSize = Math.min(100, Math.max(1, Number.parseInt(url.searchParams.get("pageSize") ?? "20", 10) || 20));
  const { listProducts } = await import("../../../../db/products");
  const result = await listProducts({ q: (url.searchParams.get("q") ?? "").trim().slice(0, 120), status: url.searchParams.get("status") ?? "", stage: url.searchParams.get("stage") ?? "", priority: url.searchParams.get("priority") ?? "", sort: url.searchParams.get("sort") ?? "-updatedAt", page, pageSize });
  return Response.json({ data: result.items, meta: { page, pageSize, total: result.total, totalPages: Math.ceil(result.total / pageSize), correlationId: context.correlationId, timestamp: context.timestamp } }, { headers: { "cache-control": "no-store" } });
}

export async function POST(request: Request) {
  const context = await authorizeApi("product.create");
  if (isResponse(context)) return context;
  let body: unknown;
  try { body = await request.json(); } catch { return apiError(400, "INVALID_JSON", "Request body must be valid JSON.", context.correlationId, context.timestamp); }
  const validation = validateProductInput(body);
  if (!validation.ok) return apiError(422, "VALIDATION_FAILED", "Review the highlighted fields.", context.correlationId, context.timestamp, validation.details);
  try {
    const { createProduct } = await import("../../../../db/products");
    const product = await createProduct(validation.value, context.principal.user.userId, context.correlationId);
    return Response.json({ data: product, meta: { correlationId: context.correlationId, timestamp: context.timestamp } }, { status: 201, headers: { "cache-control": "no-store" } });
  } catch (error) {
    const message = error instanceof Error && /unique/i.test(error.message) ? "A Product with this code already exists." : "The Product could not be created.";
    const code = /already exists/.test(message) ? "DUPLICATE_PRODUCT" : "PRODUCT_CREATE_FAILED";
    return apiError(code === "DUPLICATE_PRODUCT" ? 409 : 500, code, message, context.correlationId, context.timestamp);
  }
}
