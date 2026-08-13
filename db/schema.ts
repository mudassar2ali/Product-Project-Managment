import { sql } from "drizzle-orm";
import { index, integer, primaryKey, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";

const auditColumns = {
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  createdBy: text("created_by"),
  updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  updatedBy: text("updated_by"),
};

export const users = sqliteTable("users", {
  id: text("id").primaryKey(),
  externalUserId: text("external_user_id").notNull(),
  email: text("email").notNull(),
  displayName: text("display_name").notNull(),
  active: integer("active", { mode: "boolean" }).notNull().default(true),
  lastSeenAt: text("last_seen_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  ...auditColumns,
}, (table) => [
  uniqueIndex("uq_users_external_user_id").on(table.externalUserId),
  index("idx_users_email").on(table.email),
  index("idx_users_active").on(table.active),
]);

export const roles = sqliteTable("roles", {
  id: text("id").primaryKey(),
  code: text("code").notNull(),
  name: text("name").notNull(),
  systemRole: integer("system_role", { mode: "boolean" }).notNull().default(true),
  ...auditColumns,
}, (table) => [uniqueIndex("uq_roles_code").on(table.code)]);

export const permissions = sqliteTable("permissions", {
  id: text("id").primaryKey(),
  code: text("code").notNull(),
  resource: text("resource").notNull(),
  action: text("action").notNull(),
  ...auditColumns,
}, (table) => [uniqueIndex("uq_permissions_code").on(table.code)]);

export const rolePermissions = sqliteTable("role_permissions", {
  roleId: text("role_id").notNull().references(() => roles.id, { onDelete: "cascade" }),
  permissionId: text("permission_id").notNull().references(() => permissions.id, { onDelete: "cascade" }),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  createdBy: text("created_by"),
}, (table) => [
  primaryKey({ columns: [table.roleId, table.permissionId], name: "pk_role_permissions" }),
  index("idx_role_permissions_permission").on(table.permissionId),
]);

export const userRoleAssignments = sqliteTable("user_role_assignments", {
  id: text("id").primaryKey(),
  userId: text("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  roleId: text("role_id").notNull().references(() => roles.id, { onDelete: "restrict" }),
  scopeType: text("scope_type").notNull().default("GLOBAL"),
  scopeId: text("scope_id").notNull().default("*"),
  ...auditColumns,
}, (table) => [
  uniqueIndex("uq_user_role_scope").on(table.userId, table.roleId, table.scopeType, table.scopeId),
  index("idx_user_role_assignments_user").on(table.userId),
  index("idx_user_role_assignments_role_scope").on(table.roleId, table.scopeType, table.scopeId),
]);

export const businessSequences = sqliteTable("business_sequences", {
  entityType: text("entity_type").primaryKey(),
  nextValue: integer("next_value").notNull().default(1),
  updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
});

export const auditLogs = sqliteTable("audit_logs", {
  id: text("id").primaryKey(),
  entityType: text("entity_type").notNull(),
  entityId: text("entity_id").notNull(),
  action: text("action").notNull(),
  beforeJson: text("before_json"),
  afterJson: text("after_json"),
  actorUserId: text("actor_user_id").references(() => users.id, { onDelete: "set null" }),
  source: text("source").notNull().default("APPLICATION"),
  correlationId: text("correlation_id").notNull(),
  occurredAt: text("occurred_at").notNull().default(sql`CURRENT_TIMESTAMP`),
}, (table) => [
  index("idx_audit_entity_time").on(table.entityType, table.entityId, table.occurredAt),
  index("idx_audit_actor_time").on(table.actorUserId, table.occurredAt),
  index("idx_audit_correlation").on(table.correlationId),
]);
