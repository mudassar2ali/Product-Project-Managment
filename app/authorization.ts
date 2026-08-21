import "server-only";
import type { ChatGPTUser } from "./chatgpt-auth";

export const permissions = [
  "dashboard.view",
  "product.view", "product.create", "product.edit", "product.archive", "product.export",
  "project.view", "project.create", "project.edit", "project.archive", "project.export", "project.override_health",
  "milestone.view", "milestone.create", "milestone.edit", "milestone.archive",
  "raid.view", "raid.create", "raid.edit", "raid.archive", "raid.escalate", "raid.export",
  "idea.view", "idea.create", "idea.edit", "idea.review", "idea.convert",
  "backlog.view", "backlog.create", "backlog.edit", "backlog.archive",
  "sprint.view", "sprint.create", "sprint.plan", "sprint.activate", "sprint.complete",
  "delivery.metrics.view",
  "document.view", "document.create", "document.edit", "document.version", "document.submit",
  "requirement.view", "requirement.create", "requirement.edit", "requirement.archive", "requirement.submit", "requirement.link",
  "traceability.view", "traceability.manage", "traceability.evidence", "traceability.export",
  "signoff.view", "signoff.request", "signoff.decide", "signoff.manage", "signoff.waive_condition",
  "raci.view", "raci.manage", "raci.publish",
  "feasibility.view", "feasibility.edit", "feasibility.submit",
  "governance.report.view", "governance.report.export",
  "release.view", "release.create", "release.edit", "release.scope", "release.readiness",
  "deployment.view", "deployment.record",
  "uat.view", "uat.create", "uat.edit", "uat.execute",
  "defect.view", "defect.create", "defect.edit", "defect.close",
  "report.view", "report.export",
  "integration.view", "integration.configure", "integration.sync", "integration.diagnostics",
  "admin.users", "admin.roles", "admin.settings", "audit.view",
] as const;

export type PermissionCode = (typeof permissions)[number];
export type RoleCode = keyof typeof rolePermissions;

const viewerPermissions: PermissionCode[] = [
  "dashboard.view", "product.view", "project.view", "milestone.view", "raid.view",
  "idea.view", "backlog.view", "sprint.view", "delivery.metrics.view", "report.view", "integration.view",
  "document.view", "requirement.view", "traceability.view", "signoff.view", "raci.view", "feasibility.view", "governance.report.view",
  "release.view", "uat.view", "defect.view",
];

export const rolePermissions = {
  ADMINISTRATOR: [...permissions],
  PRODUCT_DEVELOPMENT_MANAGER: permissions.filter((permission) =>
    !permission.startsWith("admin."),
  ),
  PRODUCT_MANAGER: [
    ...viewerPermissions,
    "product.create", "product.edit", "product.export",
    "project.create", "project.edit", "project.export",
    "milestone.create", "milestone.edit",
    "raid.create", "raid.edit", "raid.escalate", "raid.export",
    "idea.create", "idea.edit", "idea.review", "idea.convert",
    "backlog.create", "backlog.edit", "backlog.archive",
    "sprint.create", "sprint.plan", "sprint.activate", "sprint.complete",
    "report.export", "integration.sync",
    "document.create", "document.edit", "document.version", "document.submit",
    "requirement.create", "requirement.edit", "requirement.archive", "requirement.submit", "requirement.link",
    "traceability.manage", "traceability.evidence", "traceability.export",
    "signoff.request", "signoff.decide", "signoff.manage",
    "raci.manage", "raci.publish", "governance.report.export",
    "release.create", "release.edit", "release.scope", "release.readiness",
  ],
  BUSINESS_ANALYST: [
    ...viewerPermissions, "milestone.create", "milestone.edit", "raid.create", "raid.edit",
    "idea.create", "idea.edit", "idea.review", "backlog.create", "backlog.edit",
    "document.create", "document.edit", "document.version", "document.submit",
    "requirement.create", "requirement.edit", "requirement.archive", "requirement.submit", "requirement.link",
    "traceability.manage", "traceability.evidence", "traceability.export", "signoff.request",
    "uat.create", "uat.edit",
  ],
  ENGINEERING_LEAD: [
    ...viewerPermissions, "project.edit", "milestone.edit", "raid.create", "raid.edit",
    "backlog.create", "backlog.edit", "sprint.create", "sprint.plan", "sprint.activate", "sprint.complete", "integration.sync",
    "traceability.manage", "signoff.decide", "signoff.manage", "feasibility.edit", "feasibility.submit",
    "release.edit", "deployment.view", "deployment.record", "defect.edit", "defect.close",
  ],
  DEVELOPER: ["dashboard.view", "product.view", "project.view", "milestone.view", "raid.view", "raid.edit", "integration.view", "requirement.view", "traceability.view", "raci.view", "feasibility.view"],
  QA: [...viewerPermissions, "project.edit", "raid.create", "raid.edit", "traceability.evidence", "signoff.decide", "signoff.manage", "uat.create", "uat.edit", "uat.execute", "defect.create", "defect.edit"],
  FINANCE: ["dashboard.view", "product.view", "product.edit", "project.view", "project.edit", "report.view", "report.export", "document.view", "requirement.view", "traceability.view", "signoff.view", "signoff.decide", "signoff.manage", "raci.view", "feasibility.view", "governance.report.view", "governance.report.export", "release.view", "uat.view", "defect.view"],
  COMPLIANCE_LEGAL: ["dashboard.view", "product.view", "project.view", "milestone.view", "raid.view", "raid.create", "raid.edit", "idea.view", "report.view", "document.view", "requirement.view", "requirement.create", "requirement.edit", "requirement.submit", "requirement.link", "traceability.view", "signoff.view", "signoff.decide", "signoff.manage", "raci.view", "feasibility.view", "governance.report.view", "release.view", "uat.view", "defect.view"],
  STAKEHOLDER_APPROVER: [...viewerPermissions, "signoff.decide"],
  EXECUTIVE_VIEWER: viewerPermissions,
} as const satisfies Record<string, readonly PermissionCode[]>;

const roleNames: Record<RoleCode, string> = {
  ADMINISTRATOR: "Administrator",
  PRODUCT_DEVELOPMENT_MANAGER: "Product Development Manager",
  PRODUCT_MANAGER: "Product Manager",
  BUSINESS_ANALYST: "Business Analyst",
  ENGINEERING_LEAD: "Engineering Lead",
  DEVELOPER: "Developer",
  QA: "QA",
  FINANCE: "Finance",
  COMPLIANCE_LEGAL: "Compliance / Legal",
  STAKEHOLDER_APPROVER: "Stakeholder / Approver",
  EXECUTIVE_VIEWER: "Executive / Viewer",
};

export type Principal = {
  user: ChatGPTUser;
  roleCodes: RoleCode[];
  roleNames: string[];
  permissions: PermissionCode[];
};

export class AuthorizationError extends Error {
  readonly code = "FORBIDDEN";
  readonly status = 403;
  constructor(readonly permission: PermissionCode) {
    super("You do not have permission to perform this action.");
    this.name = "AuthorizationError";
  }
}

const OWNER_EMAIL = "mudassar2ali@gmail.com";

export function createPrincipal(user: ChatGPTUser, roleCodes: RoleCode[] = ["EXECUTIVE_VIEWER"]): Principal {
  // The private-site owner is a permanent Administrator override, independent of whatever
  // database role assignments exist for them (Stage 5 blueprint Section 3, principle 3).
  // This is unconditional -- not just a fallback for when no role is assigned -- so that
  // database-managed role assignment (Stage 5) can never lock every administrator out of
  // the system, no matter what user_role_assignments contains for the owner's own account.
  const inputRoles = user.email.toLowerCase() === OWNER_EMAIL ? [...roleCodes, "ADMINISTRATOR" as const] : roleCodes;
  const validRoles = [...new Set(inputRoles)].filter((role): role is RoleCode => role in rolePermissions);
  const effectiveRoles = validRoles.length ? validRoles : ["EXECUTIVE_VIEWER"];
  const effectivePermissions = [...new Set(effectiveRoles.flatMap((role) => rolePermissions[role]))];
  return {
    user,
    roleCodes: effectiveRoles,
    roleNames: effectiveRoles.map((role) => roleNames[role]),
    permissions: effectivePermissions,
  };
}

export function hasPermission(principal: Principal, permission: PermissionCode): boolean {
  return principal.permissions.includes(permission);
}

export function requirePermission(principal: Principal, permission: PermissionCode): void {
  if (!hasPermission(principal, permission)) throw new AuthorizationError(permission);
}
