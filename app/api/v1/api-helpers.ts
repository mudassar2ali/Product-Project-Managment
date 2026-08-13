import { getChatGPTUser } from "../../chatgpt-auth";
import { createPrincipal, hasPermission, type PermissionCode, type Principal } from "../../authorization";

export type RequestContext = { principal: Principal; correlationId: string; timestamp: string };

export async function authorizeApi(permission: PermissionCode): Promise<RequestContext | Response> {
  const correlationId = crypto.randomUUID();
  const timestamp = new Date().toISOString();
  const user = await getChatGPTUser();
  if (!user) return apiError(401, "AUTHENTICATION_REQUIRED", "Sign in is required to access this resource.", correlationId, timestamp);
  const principal = createPrincipal(user);
  if (!hasPermission(principal, permission)) return apiError(403, "FORBIDDEN", "You do not have permission to perform this action.", correlationId, timestamp);
  return { principal, correlationId, timestamp };
}

export function apiError(status: number, code: string, message: string, correlationId: string, timestamp: string, validationDetails: Record<string, string> | [] = []) {
  return Response.json({ error: { code, message, validationDetails, correlationId, timestamp } }, { status, headers: { "cache-control": "no-store" } });
}

export function isResponse(value: RequestContext | Response): value is Response {
  return value instanceof Response;
}
