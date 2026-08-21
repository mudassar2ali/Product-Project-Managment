import { getChatGPTUser } from "../../chatgpt-auth";
import { createPrincipal, hasPermission, type PermissionCode, type Principal } from "../../authorization";

export type RequestContext = { principal: Principal; correlationId: string; timestamp: string };

export async function authorizeApi(permission: PermissionCode): Promise<RequestContext | Response> {
  const correlationId = crypto.randomUUID();
  const timestamp = new Date().toISOString();
  const user = await getChatGPTUser();
  if (!user) return apiError(401, "AUTHENTICATION_REQUIRED", "Sign in is required to access this resource.", correlationId, timestamp);
  const { getUserRoleCodes } = await import("../../../db/role-assignments");
  const roleCodes = await getUserRoleCodes(user.userId);
  const principal = createPrincipal(user, roleCodes);
  if (!hasPermission(principal, permission)) return apiError(403, "FORBIDDEN", "You do not have permission to perform this action.", correlationId, timestamp);
  const { ensureAuthenticatedUser } = await import("../../../db/identity");
  const persistedUserId = await ensureAuthenticatedUser(user);
  return { principal: { ...principal, user: { ...principal.user, userId: persistedUserId } }, correlationId, timestamp };
}

export function apiError(status: number, code: string, message: string, correlationId: string, timestamp: string, validationDetails: Record<string, string> | [] = [], extraHeaders: HeadersInit = {}) {
  return Response.json({ error: { code, message, validationDetails, correlationId, timestamp } }, { status, headers: { "cache-control": "no-store", "x-correlation-id": correlationId, ...Object.fromEntries(new Headers(extraHeaders)) } });
}

export const apiHeaders = (correlationId: string, extraHeaders: HeadersInit = {}) => ({ "cache-control": "no-store", "x-correlation-id": correlationId, ...Object.fromEntries(new Headers(extraHeaders)) });

export function isResponse(value: RequestContext | Response): value is Response {
  return value instanceof Response;
}
