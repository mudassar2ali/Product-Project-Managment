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

export const products = sqliteTable("products", {
  id: text("id").primaryKey(),
  businessId: text("business_id").notNull(),
  name: text("name").notNull(),
  code: text("code").notNull(),
  description: text("description").notNull().default(""),
  productManagerId: text("product_manager_id").references(() => users.id, { onDelete: "set null" }),
  productDevelopmentManagerId: text("product_development_manager_id").references(() => users.id, { onDelete: "set null" }),
  businessOwnerId: text("business_owner_id").references(() => users.id, { onDelete: "set null" }),
  category: text("category").notNull().default("General"),
  market: text("market").notNull().default(""),
  region: text("region").notNull().default(""),
  customerSegment: text("customer_segment").notNull().default(""),
  stage: text("stage").notNull().default("Idea"),
  startDate: text("start_date"),
  targetLaunchDate: text("target_launch_date"),
  actualLaunchDate: text("actual_launch_date"),
  status: text("status").notNull().default("Active"),
  priority: text("priority").notNull().default("Medium"),
  strategicObjective: text("strategic_objective").notNull().default(""),
  businessValue: text("business_value").notNull().default(""),
  progress: integer("progress").notNull().default(0),
  notes: text("notes").notNull().default(""),
  recordStatus: text("record_status").notNull().default("ACTIVE"),
  archivedAt: text("archived_at"),
  version: integer("version").notNull().default(1),
  ...auditColumns,
}, (table) => [
  uniqueIndex("uq_products_business_id").on(table.businessId),
  uniqueIndex("uq_products_code").on(table.code),
  index("idx_products_status_stage").on(table.status, table.stage),
  index("idx_products_manager").on(table.productManagerId),
  index("idx_products_target_launch").on(table.targetLaunchDate),
  index("idx_products_record_status").on(table.recordStatus),
]);

export const projects = sqliteTable("projects", {
  id: text("id").primaryKey(),
  businessId: text("business_id").notNull(),
  name: text("name").notNull(),
  code: text("code").notNull(),
  productId: text("product_id").notNull().references(() => products.id, { onDelete: "restrict" }),
  projectManagerId: text("project_manager_id").references(() => users.id, { onDelete: "set null" }),
  productManagerId: text("product_manager_id").references(() => users.id, { onDelete: "set null" }),
  engineeringLeadId: text("engineering_lead_id").references(() => users.id, { onDelete: "set null" }),
  businessOwnerId: text("business_owner_id").references(() => users.id, { onDelete: "set null" }),
  description: text("description").notNull().default(""),
  objective: text("objective").notNull().default(""),
  businessValue: text("business_value").notNull().default(""),
  scope: text("scope").notNull().default(""),
  outOfScope: text("out_of_scope").notNull().default(""),
  startDate: text("start_date"),
  targetEndDate: text("target_end_date"),
  actualEndDate: text("actual_end_date"),
  priority: text("priority").notNull().default("Medium"),
  status: text("status").notNull().default("Active"),
  health: text("health").notNull().default("On Track"),
  overallProgress: integer("overall_progress").notNull().default(0),
  requirementsProgress: integer("requirements_progress").notNull().default(0),
  designProgress: integer("design_progress").notNull().default(0),
  developmentProgress: integer("development_progress").notNull().default(0),
  qaProgress: integer("qa_progress").notNull().default(0),
  uatProgress: integer("uat_progress").notNull().default(0),
  signOffProgress: integer("sign_off_progress").notNull().default(0),
  deploymentProgress: integer("deployment_progress").notNull().default(0),
  signOffStatus: text("sign_off_status").notNull().default("Pending"),
  releaseStatus: text("release_status").notNull().default("Not Planned"),
  budgetAmount: integer("budget_amount").notNull().default(0),
  budgetCurrency: text("budget_currency").notNull().default("USD"),
  market: text("market").notNull().default(""),
  customer: text("customer").notNull().default(""),
  comments: text("comments").notNull().default(""),
  healthOverrideReason: text("health_override_reason"),
  recordStatus: text("record_status").notNull().default("ACTIVE"),
  archivedAt: text("archived_at"),
  version: integer("version").notNull().default(1),
  ...auditColumns,
}, (table) => [
  uniqueIndex("uq_projects_business_id").on(table.businessId),
  uniqueIndex("uq_projects_code").on(table.code),
  index("idx_projects_product_status").on(table.productId, table.status),
  index("idx_projects_health_status").on(table.health, table.status),
  index("idx_projects_target_end").on(table.targetEndDate),
  index("idx_projects_project_manager").on(table.projectManagerId),
  index("idx_projects_record_status").on(table.recordStatus),
]);

export const projectStageWeights = sqliteTable("project_stage_weights", {
  id: text("id").primaryKey(),
  projectId: text("project_id").notNull().references(() => projects.id, { onDelete: "cascade" }),
  stage: text("stage").notNull(),
  weight: integer("weight").notNull(),
  ...auditColumns,
}, (table) => [
  uniqueIndex("uq_project_stage_weight").on(table.projectId, table.stage),
  index("idx_project_stage_weights_project").on(table.projectId),
]);

export const azureConnections = sqliteTable("azure_connections", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  organization: text("organization").notNull(),
  organizationUrl: text("organization_url").notNull(),
  authType: text("auth_type").notNull().default("ENTRA_APPLICATION"),
  credentialBinding: text("credential_binding").notNull(),
  status: text("status").notNull().default("NOT_TESTED"),
  syncFrequency: text("sync_frequency").notNull().default("HOURLY"),
  lastTestedAt: text("last_tested_at"),
  lastSuccessfulAt: text("last_successful_at"),
  lastErrorCode: text("last_error_code"),
  lastErrorMessage: text("last_error_message"),
  enabled: integer("enabled", { mode: "boolean" }).notNull().default(true),
  recordStatus: text("record_status").notNull().default("ACTIVE"),
  version: integer("version").notNull().default(1),
  ...auditColumns,
}, (table) => [
  uniqueIndex("uq_azure_connections_organization").on(table.organization),
  index("idx_azure_connections_status").on(table.status, table.enabled),
  index("idx_azure_connections_record_status").on(table.recordStatus),
]);

export const azureProjectLinks = sqliteTable("azure_project_links", {
  id: text("id").primaryKey(),
  projectId: text("project_id").notNull().references(() => projects.id, { onDelete: "cascade" }),
  connectionId: text("connection_id").notNull().references(() => azureConnections.id, { onDelete: "cascade" }),
  azureProjectId: text("azure_project_id").notNull(),
  azureProjectName: text("azure_project_name").notNull(),
  azureTeamId: text("azure_team_id"),
  azureTeamName: text("azure_team_name"),
  status: text("status").notNull().default("ACTIVE"),
  lastValidatedAt: text("last_validated_at"),
  lastValidationStatus: text("last_validation_status").notNull().default("NOT_VALIDATED"),
  recordStatus: text("record_status").notNull().default("ACTIVE"),
  version: integer("version").notNull().default(1),
  ...auditColumns,
}, (table) => [
  uniqueIndex("uq_azure_project_links_internal_project").on(table.projectId),
  uniqueIndex("uq_azure_project_links_external_scope").on(table.connectionId, table.azureProjectId, table.azureTeamId),
  index("idx_azure_project_links_connection").on(table.connectionId, table.recordStatus),
]);

export const azureSyncRuns = sqliteTable("azure_sync_runs", {
  id: text("id").primaryKey(), linkId: text("link_id").notNull().references(() => azureProjectLinks.id, { onDelete: "cascade" }), status: text("status").notNull(), trigger: text("trigger").notNull().default("MANUAL"), startedAt: text("started_at").notNull(), completedAt: text("completed_at"), itemsSeen: integer("items_seen").notNull().default(0), itemsCompleted: integer("items_completed").notNull().default(0), progress: integer("progress"), errorCode: text("error_code"), errorMessage: text("error_message"), correlationId: text("correlation_id").notNull(), ...auditColumns,
}, (table) => [index("idx_azure_sync_runs_link_time").on(table.linkId, table.startedAt),index("idx_azure_sync_runs_status").on(table.status, table.startedAt)]);

export const azureDeliverySnapshots = sqliteTable("azure_delivery_snapshots", {
  id: text("id").primaryKey(), linkId: text("link_id").notNull().references(() => azureProjectLinks.id, { onDelete: "cascade" }), syncRunId: text("sync_run_id").notNull().references(() => azureSyncRuns.id, { onDelete: "cascade" }), sourceRevision: text("source_revision").notNull(), totalItems: integer("total_items").notNull(), completedItems: integer("completed_items").notNull(), activeItems: integer("active_items").notNull(), otherItems: integer("other_items").notNull(), progress: integer("progress").notNull(), calculatedAt: text("calculated_at").notNull(), ...auditColumns,
}, (table) => [uniqueIndex("uq_azure_delivery_snapshots_revision").on(table.linkId, table.sourceRevision),index("idx_azure_delivery_snapshots_link_time").on(table.linkId, table.calculatedAt)]);

export const azureSprintSnapshots = sqliteTable("azure_sprint_snapshots", {
  id: text("id").primaryKey(), linkId: text("link_id").notNull().references(() => azureProjectLinks.id, { onDelete: "cascade" }), iterationId: text("iteration_id").notNull(), iterationName: text("iteration_name").notNull(), path: text("path").notNull(), startDate: text("start_date"), finishDate: text("finish_date"), totalItems: integer("total_items").notNull(), completedItems: integer("completed_items").notNull(), activeItems: integer("active_items").notNull(), progress: integer("progress").notNull(), daysRemaining: integer("days_remaining"), health: text("health").notNull(), sourceRevision: text("source_revision").notNull(), calculatedAt: text("calculated_at").notNull(), ...auditColumns,
}, (table) => [uniqueIndex("uq_azure_sprint_snapshot_revision").on(table.linkId, table.iterationId, table.sourceRevision),index("idx_azure_sprint_snapshots_link_time").on(table.linkId, table.calculatedAt)]);
