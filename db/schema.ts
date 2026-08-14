import { sql } from "drizzle-orm";
import { check, index, integer, primaryKey, sqliteTable, text, uniqueIndex, type AnySQLiteColumn } from "drizzle-orm/sqlite-core";

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

export const milestones = sqliteTable("milestones", {
  id: text("id").primaryKey(), businessId: text("business_id").notNull(), projectId: text("project_id").notNull().references(() => projects.id, { onDelete: "cascade" }), name: text("name").notNull(), description: text("description").notNull().default(""), type: text("type").notNull().default("Delivery"), plannedDate: text("planned_date").notNull(), actualDate: text("actual_date"), status: text("status").notNull().default("Planned"), owner: text("owner").notNull().default(""), notes: text("notes").notNull().default(""), recordStatus: text("record_status").notNull().default("ACTIVE"), archivedAt: text("archived_at"), version: integer("version").notNull().default(1), ...auditColumns,
}, (table) => [uniqueIndex("uq_milestones_business_id").on(table.businessId),index("idx_milestones_project_date").on(table.projectId, table.plannedDate),index("idx_milestones_status_date").on(table.status, table.plannedDate),index("idx_milestones_record_status").on(table.recordStatus)]);

export const raidItems = sqliteTable("raid_items", {
  id:text("id").primaryKey(),businessId:text("business_id").notNull(),projectId:text("project_id").notNull().references(()=>projects.id,{onDelete:"cascade"}),type:text("type").notNull(),title:text("title").notNull(),description:text("description").notNull().default(""),owner:text("owner").notNull().default(""),probability:text("probability").notNull().default("Medium"),impact:text("impact").notNull().default("Medium"),status:text("status").notNull().default("Open"),dueDate:text("due_date"),responsePlan:text("response_plan").notNull().default(""),escalated:integer("escalated",{mode:"boolean"}).notNull().default(false),escalatedAt:text("escalated_at"),recordStatus:text("record_status").notNull().default("ACTIVE"),version:integer("version").notNull().default(1),...auditColumns,
},t=>[uniqueIndex("uq_raid_items_business_id").on(t.businessId),index("idx_raid_project_status").on(t.projectId,t.status),index("idx_raid_attention").on(t.escalated,t.impact,t.status),index("idx_raid_due_date").on(t.dueDate)]);

export const ideas = sqliteTable("ideas", {
  id:text("id").primaryKey(),businessId:text("business_id").notNull(),title:text("title").notNull(),summary:text("summary").notNull().default(""),problem:text("problem").notNull().default(""),proposedValue:text("proposed_value").notNull().default(""),submitter:text("submitter").notNull().default(""),category:text("category").notNull().default("Product"),status:text("status").notNull().default("Submitted"),valueScore:integer("value_score").notNull().default(3),effortScore:integer("effort_score").notNull().default(3),strategicScore:integer("strategic_score").notNull().default(3),reviewNotes:text("review_notes").notNull().default(""),convertedEntityType:text("converted_entity_type"),convertedEntityId:text("converted_entity_id"),convertedAt:text("converted_at"),recordStatus:text("record_status").notNull().default("ACTIVE"),version:integer("version").notNull().default(1),...auditColumns,
},t=>[uniqueIndex("uq_ideas_business_id").on(t.businessId),index("idx_ideas_status_score").on(t.status,t.valueScore,t.strategicScore),index("idx_ideas_record_status").on(t.recordStatus)]);

export const backlogItems = sqliteTable("backlog_items", {
  id:text("id").primaryKey(),businessId:text("business_id").notNull(),projectId:text("project_id").notNull().references(()=>projects.id,{onDelete:"cascade"}),parentId:text("parent_id").references(():AnySQLiteColumn=>backlogItems.id,{onDelete:"restrict"}),itemType:text("item_type").notNull(),externalType:text("external_type"),origin:text("origin").notNull().default("LOCAL"),title:text("title").notNull(),description:text("description").notNull().default(""),storyActor:text("story_actor"),storyCapability:text("story_capability"),businessValue:text("business_value").notNull().default(""),priority:text("priority").notNull().default("MEDIUM"),estimateHours:integer("estimate_hours"),storyPoints:integer("story_points"),ownerUserId:text("owner_user_id").references(()=>users.id,{onDelete:"set null"}),status:text("status").notNull().default("DRAFT"),deliveryState:text("delivery_state").notNull().default("PROPOSED"),blocked:integer("blocked",{mode:"boolean"}).notNull().default(false),blockedReason:text("blocked_reason"),externalId:text("external_id"),externalRevision:text("external_revision"),sourceUrl:text("source_url"),sourceUpdatedAt:text("source_updated_at"),syncedAt:text("synced_at"),recordStatus:text("record_status").notNull().default("ACTIVE"),archivedAt:text("archived_at"),version:integer("version").notNull().default(1),...auditColumns,
},t=>[uniqueIndex("uq_backlog_items_business_id").on(t.businessId),uniqueIndex("uq_backlog_items_external").on(t.projectId,t.origin,t.externalId),index("idx_backlog_items_project_parent").on(t.projectId,t.parentId),index("idx_backlog_items_project_status").on(t.projectId,t.status,t.recordStatus),index("idx_backlog_items_owner_status").on(t.ownerUserId,t.status),index("idx_backlog_items_origin_sync").on(t.origin,t.syncedAt),check("ck_backlog_item_type",sql`${t.itemType} IN ('EPIC','FEATURE','STORY','TASK','BUG')`),check("ck_backlog_origin",sql`${t.origin} IN ('LOCAL','AZURE_DEVOPS')`),check("ck_backlog_status",sql`${t.status} IN ('DRAFT','READY','IN_PROGRESS','DONE','REMOVED')`),check("ck_backlog_delivery_state",sql`${t.deliveryState} IN ('PROPOSED','READY','IN_PROGRESS','VALIDATION','DONE','REMOVED','UNMAPPED')`),check("ck_backlog_nonnegative_estimate",sql`${t.estimateHours} IS NULL OR ${t.estimateHours} >= 0`),check("ck_backlog_nonnegative_points",sql`${t.storyPoints} IS NULL OR ${t.storyPoints} >= 0`),check("ck_backlog_origin_external",sql`(${t.origin}='LOCAL' AND ${t.externalId} IS NULL AND ${t.externalRevision} IS NULL AND ${t.sourceUrl} IS NULL) OR (${t.origin}='AZURE_DEVOPS' AND ${t.externalId} IS NOT NULL AND ${t.externalRevision} IS NOT NULL AND ${t.sourceUrl} IS NOT NULL)`),check("ck_backlog_blocked_reason",sql`${t.blocked}=0 OR length(trim(COALESCE(${t.blockedReason},'')))>0`)]);

export const acceptanceCriteria = sqliteTable("acceptance_criteria", {
  id:text("id").primaryKey(),backlogItemId:text("backlog_item_id").notNull().references(()=>backlogItems.id,{onDelete:"cascade"}),sequence:integer("sequence").notNull(),givenText:text("given_text").notNull(),whenText:text("when_text").notNull(),thenText:text("then_text").notNull(),status:text("status").notNull().default("DRAFT"),version:integer("version").notNull().default(1),...auditColumns,
},t=>[uniqueIndex("uq_acceptance_criteria_sequence").on(t.backlogItemId,t.sequence),index("idx_acceptance_criteria_item_status").on(t.backlogItemId,t.status),check("ck_acceptance_sequence",sql`${t.sequence}>0`),check("ck_acceptance_status",sql`${t.status} IN ('DRAFT','READY','MET','NOT_MET')`),check("ck_acceptance_complete",sql`length(trim(${t.givenText}))>0 AND length(trim(${t.whenText}))>0 AND length(trim(${t.thenText}))>0`)]);

export const backlogDependencies = sqliteTable("backlog_dependencies", {
  id:text("id").primaryKey(),predecessorItemId:text("predecessor_item_id").notNull().references(()=>backlogItems.id,{onDelete:"restrict"}),successorItemId:text("successor_item_id").notNull().references(()=>backlogItems.id,{onDelete:"restrict"}),dependencyType:text("dependency_type").notNull(),origin:text("origin").notNull().default("LOCAL"),externalRelationId:text("external_relation_id"),...auditColumns,
},t=>[uniqueIndex("uq_backlog_dependency_edge").on(t.predecessorItemId,t.successorItemId,t.dependencyType),index("idx_backlog_dependencies_successor").on(t.successorItemId,t.dependencyType),check("ck_backlog_dependency_not_self",sql`${t.predecessorItemId}<>${t.successorItemId}`),check("ck_backlog_dependency_type",sql`${t.dependencyType} IN ('BLOCKS','REQUIRES','RELATES_TO')`),check("ck_backlog_dependency_origin",sql`${t.origin} IN ('LOCAL','AZURE_DEVOPS')`)]);

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
