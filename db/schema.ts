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
  id:text("id").primaryKey(),businessId:text("business_id").notNull(),projectId:text("project_id").notNull().references(()=>projects.id,{onDelete:"cascade"}),parentId:text("parent_id").references(():AnySQLiteColumn=>backlogItems.id,{onDelete:"restrict"}),itemType:text("item_type").notNull(),externalType:text("external_type"),externalState:text("external_state"),externalParentId:text("external_parent_id"),externalOwner:text("external_owner"),externalIterationId:text("external_iteration_id"),externalIterationPath:text("external_iteration_path"),origin:text("origin").notNull().default("LOCAL"),title:text("title").notNull(),description:text("description").notNull().default(""),storyActor:text("story_actor"),storyCapability:text("story_capability"),businessValue:text("business_value").notNull().default(""),priority:text("priority").notNull().default("MEDIUM"),estimateHours:integer("estimate_hours"),storyPoints:integer("story_points"),remainingWork:integer("remaining_work"),ownerUserId:text("owner_user_id").references(()=>users.id,{onDelete:"set null"}),status:text("status").notNull().default("DRAFT"),deliveryState:text("delivery_state").notNull().default("PROPOSED"),blocked:integer("blocked",{mode:"boolean"}).notNull().default(false),blockedReason:text("blocked_reason"),externalId:text("external_id"),externalRevision:text("external_revision"),sourceUrl:text("source_url"),sourceUpdatedAt:text("source_updated_at"),syncedAt:text("synced_at"),sourceMissingAt:text("source_missing_at"),recordStatus:text("record_status").notNull().default("ACTIVE"),archivedAt:text("archived_at"),version:integer("version").notNull().default(1),...auditColumns,
},t=>[uniqueIndex("uq_backlog_items_business_id").on(t.businessId),uniqueIndex("uq_backlog_items_external").on(t.projectId,t.origin,t.externalId),index("idx_backlog_items_project_parent").on(t.projectId,t.parentId),index("idx_backlog_items_project_status").on(t.projectId,t.status,t.recordStatus),index("idx_backlog_items_owner_status").on(t.ownerUserId,t.status),index("idx_backlog_items_origin_sync").on(t.origin,t.syncedAt),index("idx_backlog_items_external_iteration").on(t.projectId,t.externalIterationId,t.deliveryState),check("ck_backlog_item_type",sql`${t.itemType} IN ('EPIC','FEATURE','STORY','TASK','BUG')`),check("ck_backlog_origin",sql`${t.origin} IN ('LOCAL','AZURE_DEVOPS')`),check("ck_backlog_status",sql`${t.status} IN ('DRAFT','READY','IN_PROGRESS','DONE','REMOVED')`),check("ck_backlog_delivery_state",sql`${t.deliveryState} IN ('PROPOSED','READY','IN_PROGRESS','VALIDATION','DONE','REMOVED','UNMAPPED')`),check("ck_backlog_nonnegative_estimate",sql`${t.estimateHours} IS NULL OR ${t.estimateHours} >= 0`),check("ck_backlog_nonnegative_points",sql`${t.storyPoints} IS NULL OR ${t.storyPoints} >= 0`),check("ck_backlog_nonnegative_remaining",sql`${t.remainingWork} IS NULL OR ${t.remainingWork} >= 0`),check("ck_backlog_origin_external",sql`(${t.origin}='LOCAL' AND ${t.externalId} IS NULL AND ${t.externalRevision} IS NULL AND ${t.sourceUrl} IS NULL) OR (${t.origin}='AZURE_DEVOPS' AND ${t.externalId} IS NOT NULL AND ${t.externalRevision} IS NOT NULL AND ${t.sourceUrl} IS NOT NULL)`),check("ck_backlog_blocked_reason",sql`${t.blocked}=0 OR length(trim(COALESCE(${t.blockedReason},'')))>0`)]);

export const acceptanceCriteria = sqliteTable("acceptance_criteria", {
  id:text("id").primaryKey(),backlogItemId:text("backlog_item_id").notNull().references(()=>backlogItems.id,{onDelete:"cascade"}),sequence:integer("sequence").notNull(),givenText:text("given_text").notNull(),whenText:text("when_text").notNull(),thenText:text("then_text").notNull(),status:text("status").notNull().default("DRAFT"),version:integer("version").notNull().default(1),...auditColumns,
},t=>[uniqueIndex("uq_acceptance_criteria_sequence").on(t.backlogItemId,t.sequence),index("idx_acceptance_criteria_item_status").on(t.backlogItemId,t.status),check("ck_acceptance_sequence",sql`${t.sequence}>0`),check("ck_acceptance_status",sql`${t.status} IN ('DRAFT','READY','MET','NOT_MET')`),check("ck_acceptance_complete",sql`length(trim(${t.givenText}))>0 AND length(trim(${t.whenText}))>0 AND length(trim(${t.thenText}))>0`)]);

export const backlogDependencies = sqliteTable("backlog_dependencies", {
  id:text("id").primaryKey(),predecessorItemId:text("predecessor_item_id").notNull().references(()=>backlogItems.id,{onDelete:"restrict"}),successorItemId:text("successor_item_id").notNull().references(()=>backlogItems.id,{onDelete:"restrict"}),dependencyType:text("dependency_type").notNull(),origin:text("origin").notNull().default("LOCAL"),externalRelationId:text("external_relation_id"),...auditColumns,
},t=>[uniqueIndex("uq_backlog_dependency_edge").on(t.predecessorItemId,t.successorItemId,t.dependencyType),index("idx_backlog_dependencies_successor").on(t.successorItemId,t.dependencyType),check("ck_backlog_dependency_not_self",sql`${t.predecessorItemId}<>${t.successorItemId}`),check("ck_backlog_dependency_type",sql`${t.dependencyType} IN ('BLOCKS','REQUIRES','RELATES_TO')`),check("ck_backlog_dependency_origin",sql`${t.origin} IN ('LOCAL','AZURE_DEVOPS')`)]);

export const sprints = sqliteTable("sprints", {
  id:text("id").primaryKey(),businessId:text("business_id").notNull(),projectId:text("project_id").notNull().references(()=>projects.id,{onDelete:"cascade"}),name:text("name").notNull(),goal:text("goal").notNull().default(""),origin:text("origin").notNull().default("LOCAL"),externalId:text("external_id"),externalPath:text("external_path"),sourceRevision:text("source_revision"),syncedAt:text("synced_at"),startDate:text("start_date").notNull(),endDate:text("end_date").notNull(),status:text("status").notNull().default("PLANNED"),capacityHours:integer("capacity_hours").notNull().default(0),committedPoints:integer("committed_points").notNull().default(0),activatedAt:text("activated_at"),completedAt:text("completed_at"),recordStatus:text("record_status").notNull().default("ACTIVE"),archivedAt:text("archived_at"),version:integer("version").notNull().default(1),...auditColumns,
},t=>[uniqueIndex("uq_sprints_business_id").on(t.businessId),uniqueIndex("uq_sprints_external").on(t.projectId,t.origin,t.externalId),uniqueIndex("uq_sprints_one_active_local").on(t.projectId).where(sql`${t.status}='ACTIVE' AND ${t.origin}='LOCAL' AND ${t.recordStatus}='ACTIVE'`),index("idx_sprints_project_status_dates").on(t.projectId,t.status,t.startDate,t.endDate),index("idx_sprints_origin_status").on(t.origin,t.status),check("ck_sprint_origin",sql`${t.origin} IN ('LOCAL','AZURE_DEVOPS')`),check("ck_sprint_status",sql`${t.status} IN ('PLANNED','ACTIVE','COMPLETED')`),check("ck_sprint_dates",sql`${t.endDate} >= ${t.startDate}`),check("ck_sprint_capacity",sql`${t.capacityHours} >= 0 AND ${t.committedPoints} >= 0`),check("ck_sprint_origin_external",sql`(${t.origin}='LOCAL' AND ${t.externalId} IS NULL AND ${t.externalPath} IS NULL) OR (${t.origin}='AZURE_DEVOPS' AND ${t.externalId} IS NOT NULL AND ${t.externalPath} IS NOT NULL)`)]);

export const sprintMemberships = sqliteTable("sprint_memberships", {
  id:text("id").primaryKey(),sprintId:text("sprint_id").notNull().references(()=>sprints.id,{onDelete:"cascade"}),backlogItemId:text("backlog_item_id").notNull().references(()=>backlogItems.id,{onDelete:"restrict"}),plannedPoints:integer("planned_points").notNull().default(0),plannedHours:integer("planned_hours").notNull().default(0),sequence:integer("sequence").notNull(),carriedFromMembershipId:text("carried_from_membership_id").references(():AnySQLiteColumn=>sprintMemberships.id,{onDelete:"set null"}),addedAt:text("added_at").notNull().default(sql`CURRENT_TIMESTAMP`),removedAt:text("removed_at"),...auditColumns,
},t=>[uniqueIndex("uq_sprint_membership_item").on(t.sprintId,t.backlogItemId),uniqueIndex("uq_sprint_membership_sequence").on(t.sprintId,t.sequence),index("idx_sprint_membership_backlog").on(t.backlogItemId,t.sprintId),check("ck_sprint_membership_values",sql`${t.sequence}>0 AND ${t.plannedPoints}>=0 AND ${t.plannedHours}>=0`)]);

export const sprintBaselines = sqliteTable("sprint_baselines", {
  id:text("id").primaryKey(),sprintId:text("sprint_id").notNull().references(()=>sprints.id,{onDelete:"restrict"}),itemCount:integer("item_count").notNull(),committedPoints:integer("committed_points").notNull(),committedHours:integer("committed_hours").notNull(),membershipSnapshotJson:text("membership_snapshot_json").notNull(),activatedAt:text("activated_at").notNull(),...auditColumns,
},t=>[uniqueIndex("uq_sprint_baseline_sprint").on(t.sprintId),check("ck_sprint_baseline_values",sql`${t.itemCount}>0 AND ${t.committedPoints}>=0 AND ${t.committedHours}>=0`)]);

export const sprintCompletionDispositions = sqliteTable("sprint_completion_dispositions", {
  id:text("id").primaryKey(),sprintId:text("sprint_id").notNull().references(()=>sprints.id,{onDelete:"restrict"}),membershipId:text("membership_id").notNull().references(()=>sprintMemberships.id,{onDelete:"restrict"}),disposition:text("disposition").notNull(),targetSprintId:text("target_sprint_id").references(()=>sprints.id,{onDelete:"restrict"}),targetMembershipId:text("target_membership_id").references(()=>sprintMemberships.id,{onDelete:"restrict"}),reason:text("reason").notNull().default(""),...auditColumns,
},t=>[uniqueIndex("uq_sprint_completion_membership").on(t.sprintId,t.membershipId),index("idx_sprint_completion_target").on(t.targetSprintId,t.disposition),check("ck_sprint_completion_disposition",sql`${t.disposition} IN ('COMPLETED','CARRYOVER','BACKLOG','REMOVED')`),check("ck_sprint_completion_target",sql`(${t.disposition}='CARRYOVER' AND ${t.targetSprintId} IS NOT NULL) OR (${t.disposition}<>'CARRYOVER' AND ${t.targetSprintId} IS NULL)`)]);

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

export const azureMappingEntries = sqliteTable("azure_mapping_entries", {
  id:text("id").primaryKey(),connectionId:text("connection_id").notNull().references(()=>azureConnections.id,{onDelete:"cascade"}),mappingKind:text("mapping_kind").notNull(),externalValue:text("external_value").notNull(),externalKey:text("external_key").notNull(),normalizedValue:text("normalized_value").notNull(),active:integer("active",{mode:"boolean"}).notNull().default(true),version:integer("version").notNull().default(1),...auditColumns,
},t=>[uniqueIndex("uq_azure_mapping_external").on(t.connectionId,t.mappingKind,t.externalKey),index("idx_azure_mapping_active").on(t.connectionId,t.mappingKind,t.active),check("ck_azure_mapping_kind",sql`${t.mappingKind} IN ('TYPE','STATE')`),check("ck_azure_mapping_value",sql`(${t.mappingKind}='TYPE' AND ${t.normalizedValue} IN ('EPIC','FEATURE','STORY','TASK','BUG')) OR (${t.mappingKind}='STATE' AND ${t.normalizedValue} IN ('PROPOSED','READY','IN_PROGRESS','VALIDATION','DONE','REMOVED'))`)]);

export const azureSyncRuns = sqliteTable("azure_sync_runs", {
  id: text("id").primaryKey(), linkId: text("link_id").notNull().references(() => azureProjectLinks.id, { onDelete: "cascade" }), status: text("status").notNull(), trigger: text("trigger").notNull().default("MANUAL"), syncMode:text("sync_mode").notNull().default("BASIC"),startedAt: text("started_at").notNull(), completedAt: text("completed_at"),lockExpiresAt:text("lock_expires_at"),pagesRead:integer("pages_read").notNull().default(0),itemsSeen: integer("items_seen").notNull().default(0), itemsCompleted: integer("items_completed").notNull().default(0),itemsInserted:integer("items_inserted").notNull().default(0),itemsUpdated:integer("items_updated").notNull().default(0),itemsSkipped:integer("items_skipped").notNull().default(0),itemsMissing:integer("items_missing").notNull().default(0),unmappedTypes:integer("unmapped_types").notNull().default(0),unmappedStates:integer("unmapped_states").notNull().default(0),iterationsSeen:integer("iterations_seen").notNull().default(0),sprintsInserted:integer("sprints_inserted").notNull().default(0),sprintsUpdated:integer("sprints_updated").notNull().default(0),sprintsSkipped:integer("sprints_skipped").notNull().default(0),metricSnapshotsInserted:integer("metric_snapshots_inserted").notNull().default(0),burndownSnapshotsInserted:integer("burndown_snapshots_inserted").notNull().default(0),sourceRevision:text("source_revision"), progress: integer("progress"), errorCode: text("error_code"), errorMessage: text("error_message"), correlationId: text("correlation_id").notNull(), ...auditColumns,
}, (table) => [uniqueIndex("uq_azure_sync_run_active_link").on(table.linkId).where(sql`${table.status}='RUNNING'`),index("idx_azure_sync_runs_link_time").on(table.linkId, table.startedAt),index("idx_azure_sync_runs_status").on(table.status, table.startedAt)]);

export const azureWorkItemSnapshots = sqliteTable("azure_work_item_snapshots", {
  id:text("id").primaryKey(),linkId:text("link_id").notNull().references(()=>azureProjectLinks.id,{onDelete:"cascade"}),syncRunId:text("sync_run_id").notNull().references(()=>azureSyncRuns.id,{onDelete:"cascade"}),externalId:text("external_id").notNull(),externalRevision:text("external_revision").notNull(),externalType:text("external_type").notNull(),externalState:text("external_state").notNull(),normalizedType:text("normalized_type"),normalizedState:text("normalized_state"),parentExternalId:text("parent_external_id"),title:text("title").notNull(),owner:text("owner"),storyPoints:integer("story_points"),remainingWork:integer("remaining_work"),blocked:integer("blocked",{mode:"boolean"}).notNull().default(false),blockedReason:text("blocked_reason"),iterationId:text("iteration_id"),iterationPath:text("iteration_path"),relationsJson:text("relations_json").notNull().default("[]"),sourceUrl:text("source_url").notNull(),sourceChangedAt:text("source_changed_at"),syncedAt:text("synced_at").notNull(),...auditColumns,
},t=>[uniqueIndex("uq_azure_work_item_snapshot_revision").on(t.linkId,t.externalId,t.externalRevision),index("idx_azure_work_item_snapshot_run").on(t.syncRunId,t.externalId),index("idx_azure_work_item_snapshot_iteration").on(t.linkId,t.iterationId,t.normalizedState),check("ck_azure_work_item_snapshot_values",sql`(${t.storyPoints} IS NULL OR ${t.storyPoints}>=0) AND (${t.remainingWork} IS NULL OR ${t.remainingWork}>=0)`)]);

export const azureSyncDiagnostics = sqliteTable("azure_sync_diagnostics", {
  id:text("id").primaryKey(),syncRunId:text("sync_run_id").notNull().references(()=>azureSyncRuns.id,{onDelete:"cascade"}),linkId:text("link_id").notNull().references(()=>azureProjectLinks.id,{onDelete:"cascade"}),code:text("code").notNull(),severity:text("severity").notNull(),mappingKind:text("mapping_kind"),externalValue:text("external_value"),occurrences:integer("occurrences").notNull().default(1),message:text("message").notNull(),...auditColumns,
},t=>[index("idx_azure_sync_diagnostic_run").on(t.syncRunId,t.severity),index("idx_azure_sync_diagnostic_link_code").on(t.linkId,t.code),check("ck_azure_sync_diagnostic_severity",sql`${t.severity} IN ('INFO','WARNING','ERROR')`),check("ck_azure_sync_diagnostic_occurrences",sql`${t.occurrences}>0`)]);

export const azureDeliverySnapshots = sqliteTable("azure_delivery_snapshots", {
  id: text("id").primaryKey(), linkId: text("link_id").notNull().references(() => azureProjectLinks.id, { onDelete: "cascade" }), syncRunId: text("sync_run_id").notNull().references(() => azureSyncRuns.id, { onDelete: "cascade" }), sourceRevision: text("source_revision").notNull(), totalItems: integer("total_items").notNull(), completedItems: integer("completed_items").notNull(), activeItems: integer("active_items").notNull(), otherItems: integer("other_items").notNull(), progress: integer("progress").notNull(), calculatedAt: text("calculated_at").notNull(), ...auditColumns,
}, (table) => [uniqueIndex("uq_azure_delivery_snapshots_revision").on(table.linkId, table.sourceRevision),index("idx_azure_delivery_snapshots_link_time").on(table.linkId, table.calculatedAt)]);

export const azureSprintSnapshots = sqliteTable("azure_sprint_snapshots", {
  id: text("id").primaryKey(), linkId: text("link_id").notNull().references(() => azureProjectLinks.id, { onDelete: "cascade" }), iterationId: text("iteration_id").notNull(), iterationName: text("iteration_name").notNull(), path: text("path").notNull(), startDate: text("start_date"), finishDate: text("finish_date"), totalItems: integer("total_items").notNull(), completedItems: integer("completed_items").notNull(), activeItems: integer("active_items").notNull(), progress: integer("progress").notNull(), daysRemaining: integer("days_remaining"), health: text("health").notNull(), sourceRevision: text("source_revision").notNull(), calculatedAt: text("calculated_at").notNull(), ...auditColumns,
}, (table) => [uniqueIndex("uq_azure_sprint_snapshot_revision").on(table.linkId, table.iterationId, table.sourceRevision),index("idx_azure_sprint_snapshots_link_time").on(table.linkId, table.calculatedAt)]);

export const deliveryMetricPolicies = sqliteTable("delivery_metric_policies", {
  id:text("id").primaryKey(),name:text("name").notNull(),healthTolerancePercentage:integer("health_tolerance_percentage").notNull().default(15),blockerThreshold:integer("blocker_threshold").notNull().default(3),zeroProgressDays:integer("zero_progress_days").notNull().default(2),velocityLookback:integer("velocity_lookback").notNull().default(6),active:integer("active",{mode:"boolean"}).notNull().default(true),version:integer("version").notNull().default(1),...auditColumns,
},t=>[uniqueIndex("uq_delivery_metric_policy_active").on(t.active).where(sql`${t.active}=1`),check("ck_delivery_metric_policy_values",sql`${t.healthTolerancePercentage} BETWEEN 0 AND 100 AND ${t.blockerThreshold}>0 AND ${t.zeroProgressDays}>=0 AND ${t.velocityLookback} BETWEEN 1 AND 24`)]);

export const sprintMetricSnapshots = sqliteTable("sprint_metric_snapshots", {
  id:text("id").primaryKey(),sprintId:text("sprint_id").notNull().references(()=>sprints.id,{onDelete:"cascade"}),linkId:text("link_id").references(()=>azureProjectLinks.id,{onDelete:"cascade"}),syncRunId:text("sync_run_id").references(()=>azureSyncRuns.id,{onDelete:"set null"}),policyId:text("policy_id").notNull().references(()=>deliveryMetricPolicies.id,{onDelete:"restrict"}),sourceOrigin:text("source_origin").notNull(),sourceRevision:text("source_revision").notNull(),plannedPoints:integer("planned_points").notNull(),completedPoints:integer("completed_points").notNull(),plannedItems:integer("planned_items").notNull(),completedItems:integer("completed_items").notNull(),remainingWork:integer("remaining_work").notNull(),bugCount:integer("bug_count").notNull(),openBugCount:integer("open_bug_count").notNull(),blockerCount:integer("blocker_count").notNull(),carryoverCount:integer("carryover_count").notNull(),carryoverPoints:integer("carryover_points").notNull(),elapsedDays:integer("elapsed_days").notNull(),totalDays:integer("total_days").notNull(),progress:integer("progress").notNull(),expectedProgress:integer("expected_progress").notNull(),health:text("health").notNull(),completionMethod:text("completion_method").notNull(),numerator:integer("numerator"),denominator:integer("denominator"),formula:text("formula").notNull(),healthTolerancePercentage:integer("health_tolerance_percentage").notNull(),blockerThreshold:integer("blocker_threshold").notNull(),zeroProgressDays:integer("zero_progress_days").notNull(),velocityLookback:integer("velocity_lookback").notNull(),calculatedAt:text("calculated_at").notNull(),...auditColumns,
},t=>[uniqueIndex("uq_sprint_metric_source_revision").on(t.sprintId,t.sourceRevision),index("idx_sprint_metric_sprint_time").on(t.sprintId,t.calculatedAt),index("idx_sprint_metric_link_time").on(t.linkId,t.calculatedAt),check("ck_sprint_metric_source",sql`${t.sourceOrigin} IN ('LOCAL','AZURE_DEVOPS')`),check("ck_sprint_metric_health",sql`${t.health} IN ('ON_TRACK','AT_RISK','BLOCKED','COMPLETED')`),check("ck_sprint_metric_method",sql`${t.completionMethod} IN ('POINTS','ITEM_COUNT','NOT_AVAILABLE')`),check("ck_sprint_metric_values",sql`${t.plannedPoints}>=0 AND ${t.completedPoints}>=0 AND ${t.plannedItems}>=0 AND ${t.completedItems}>=0 AND ${t.remainingWork}>=0 AND ${t.bugCount}>=0 AND ${t.openBugCount}>=0 AND ${t.blockerCount}>=0 AND ${t.carryoverCount}>=0 AND ${t.carryoverPoints}>=0 AND ${t.elapsedDays}>=0 AND ${t.totalDays}>0 AND ${t.progress} BETWEEN 0 AND 100 AND ${t.expectedProgress} BETWEEN 0 AND 100`)]);

export const dailyBurndownSnapshots = sqliteTable("daily_burndown_snapshots", {
  id:text("id").primaryKey(),sprintId:text("sprint_id").notNull().references(()=>sprints.id,{onDelete:"cascade"}),metricSnapshotId:text("metric_snapshot_id").notNull().references(()=>sprintMetricSnapshots.id,{onDelete:"cascade"}),snapshotDate:text("snapshot_date").notNull(),plannedScope:integer("planned_scope").notNull(),remainingScope:integer("remaining_scope").notNull(),completedScope:integer("completed_scope").notNull(),idealRemainingScope:integer("ideal_remaining_scope").notNull(),scopeChange:integer("scope_change").notNull().default(0),sourceOrigin:text("source_origin").notNull(),sourceRevision:text("source_revision").notNull(),calculatedAt:text("calculated_at").notNull(),...auditColumns,
},t=>[uniqueIndex("uq_daily_burndown_source_revision").on(t.sprintId,t.snapshotDate,t.sourceRevision),index("idx_daily_burndown_sprint_date").on(t.sprintId,t.snapshotDate),check("ck_daily_burndown_source",sql`${t.sourceOrigin} IN ('LOCAL','AZURE_DEVOPS')`),check("ck_daily_burndown_values",sql`${t.plannedScope}>=0 AND ${t.remainingScope}>=0 AND ${t.completedScope}>=0 AND ${t.idealRemainingScope}>=0`)]);

export const operationalPolicies = sqliteTable("operational_policies", {
  key:text("key").primaryKey(),category:text("category").notNull(),integerValue:integer("integer_value"),textValue:text("text_value"),description:text("description").notNull(),enforced:integer("enforced",{mode:"boolean"}).notNull().default(true),...auditColumns,
},t=>[index("idx_operational_policies_category").on(t.category,t.key),check("ck_operational_policy_value",sql`${t.integerValue} IS NOT NULL OR ${t.textValue} IS NOT NULL`)]);

export const operationalRateLimits = sqliteTable("operational_rate_limits", {
  operation:text("operation").notNull(),scopeKey:text("scope_key").notNull(),windowStart:integer("window_start").notNull(),requestCount:integer("request_count").notNull().default(1),limitValue:integer("limit_value").notNull(),windowSeconds:integer("window_seconds").notNull(),expiresAt:text("expires_at").notNull(),updatedAt:text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
},t=>[primaryKey({columns:[t.operation,t.scopeKey,t.windowStart],name:"pk_operational_rate_limits"}),index("idx_operational_rate_limits_expiry").on(t.expiresAt),index("idx_operational_rate_limits_operation_window").on(t.operation,t.windowStart),check("ck_operational_rate_limit_values",sql`${t.requestCount}>0 AND ${t.limitValue}>0 AND ${t.windowSeconds}>0 AND ${t.requestCount}<=${t.limitValue}`)]);

export const operationalEvents = sqliteTable("operational_events", {
  id:text("id").primaryKey(),operation:text("operation").notNull(),outcome:text("outcome").notNull(),durationMs:integer("duration_ms").notNull().default(0),statusCode:integer("status_code").notNull(),entityType:text("entity_type"),entityId:text("entity_id"),actorUserId:text("actor_user_id").references(()=>users.id,{onDelete:"set null"}),correlationId:text("correlation_id").notNull(),detailsJson:text("details_json").notNull().default("{}"),occurredAt:text("occurred_at").notNull().default(sql`CURRENT_TIMESTAMP`),
},t=>[index("idx_operational_events_operation_time").on(t.operation,t.occurredAt),index("idx_operational_events_outcome_time").on(t.outcome,t.occurredAt),index("idx_operational_events_correlation").on(t.correlationId),index("idx_operational_events_actor_time").on(t.actorUserId,t.occurredAt),check("ck_operational_event_outcome",sql`${t.outcome} IN ('SUCCESS','REJECTED','ERROR','RATE_LIMITED')`),check("ck_operational_event_values",sql`${t.durationMs}>=0 AND ${t.statusCode} BETWEEN 100 AND 599`)]);

export const governanceDocuments = sqliteTable("governance_documents", {
  id: text("id").primaryKey(),
  businessId: text("business_id").notNull(),
  documentType: text("document_type").notNull(),
  productId: text("product_id").notNull().references(() => products.id, { onDelete: "restrict" }),
  projectId: text("project_id").references(() => projects.id, { onDelete: "restrict" }),
  title: text("title").notNull(),
  ownerUserId: text("owner_user_id").references(() => users.id, { onDelete: "set null" }),
  purpose: text("purpose").notNull().default(""),
  recordStatus: text("record_status").notNull().default("ACTIVE"),
  archivedAt: text("archived_at"),
  version: integer("version").notNull().default(1),
  ...auditColumns,
}, (table) => [
  uniqueIndex("uq_governance_documents_business_id").on(table.businessId),
  index("idx_governance_documents_product_type").on(table.productId, table.documentType, table.recordStatus),
  index("idx_governance_documents_project_type").on(table.projectId, table.documentType, table.recordStatus),
  index("idx_governance_documents_owner_status").on(table.ownerUserId, table.recordStatus),
  check("ck_governance_document_type", sql`${table.documentType} IN ('BRD','PRD')`),
  check("ck_governance_document_status", sql`${table.recordStatus} IN ('ACTIVE','ARCHIVED')`),
  check("ck_governance_document_fields", sql`length(trim(${table.businessId})) BETWEEN 1 AND 32 AND length(trim(${table.title})) BETWEEN 1 AND 240 AND length(${table.purpose})<=2000 AND ${table.version}>0`),
  check("ck_governance_document_archive", sql`(${table.recordStatus}='ACTIVE' AND ${table.archivedAt} IS NULL) OR (${table.recordStatus}='ARCHIVED' AND ${table.archivedAt} IS NOT NULL)`),
]);

export const governanceDocumentVersions = sqliteTable("governance_document_versions", {
  id: text("id").primaryKey(),
  documentId: text("document_id").notNull().references(() => governanceDocuments.id, { onDelete: "restrict" }),
  versionLabel: text("version_label").notNull(),
  majorVersion: integer("major_version").notNull().default(0),
  minorVersion: integer("minor_version").notNull().default(1),
  lifecycleStatus: text("lifecycle_status").notNull().default("DRAFT"),
  supersedesVersionId: text("supersedes_version_id").references((): AnySQLiteColumn => governanceDocumentVersions.id, { onDelete: "restrict" }),
  contentHash: text("content_hash"),
  changeSummary: text("change_summary").notNull().default(""),
  submittedAt: text("submitted_at"),
  approvedAt: text("approved_at"),
  lockedAt: text("locked_at"),
  version: integer("version").notNull().default(1),
  ...auditColumns,
}, (table) => [
  uniqueIndex("uq_governance_versions_label").on(table.documentId, table.versionLabel),
  uniqueIndex("uq_governance_versions_one_draft").on(table.documentId).where(sql`${table.lifecycleStatus}='DRAFT'`),
  uniqueIndex("uq_governance_versions_one_current_approved").on(table.documentId).where(sql`${table.lifecycleStatus} IN ('APPROVED','APPROVED_WITH_CONDITIONS')`),
  index("idx_governance_versions_document_status").on(table.documentId, table.lifecycleStatus, table.majorVersion, table.minorVersion),
  index("idx_governance_versions_submitted_status").on(table.submittedAt, table.lifecycleStatus),
  index("idx_governance_versions_supersedes").on(table.supersedesVersionId),
  check("ck_governance_version_status", sql`${table.lifecycleStatus} IN ('DRAFT','IN_REVIEW','APPROVED','APPROVED_WITH_CONDITIONS','REJECTED','SUPERSEDED','RETIRED')`),
  check("ck_governance_version_numbers", sql`${table.majorVersion}>=0 AND ${table.minorVersion}>=0 AND ${table.version}>0`),
  check("ck_governance_version_label", sql`length(trim(${table.versionLabel})) BETWEEN 1 AND 32`),
  check("ck_governance_version_summary", sql`length(${table.changeSummary})<=2000`),
  check("ck_governance_version_hash", sql`${table.contentHash} IS NULL OR (length(${table.contentHash})=64 AND lower(${table.contentHash}) NOT GLOB '*[^0-9a-f]*')`),
  check("ck_governance_version_lock", sql`
    (${table.lifecycleStatus}='DRAFT' AND ${table.contentHash} IS NULL AND ${table.submittedAt} IS NULL AND ${table.approvedAt} IS NULL AND ${table.lockedAt} IS NULL)
    OR (${table.lifecycleStatus}='IN_REVIEW' AND ${table.contentHash} IS NOT NULL AND ${table.submittedAt} IS NOT NULL AND ${table.approvedAt} IS NULL AND ${table.lockedAt} IS NOT NULL)
    OR (${table.lifecycleStatus} IN ('APPROVED','APPROVED_WITH_CONDITIONS','SUPERSEDED','RETIRED') AND ${table.contentHash} IS NOT NULL AND ${table.submittedAt} IS NOT NULL AND ${table.approvedAt} IS NOT NULL AND ${table.lockedAt} IS NOT NULL)
    OR (${table.lifecycleStatus}='REJECTED' AND ${table.contentHash} IS NOT NULL AND ${table.submittedAt} IS NOT NULL AND ${table.approvedAt} IS NULL AND ${table.lockedAt} IS NOT NULL)
  `),
  check("ck_governance_version_not_self", sql`${table.supersedesVersionId} IS NULL OR ${table.supersedesVersionId}<>${table.id}`),
]);

export const governanceDocumentSections = sqliteTable("governance_document_sections", {
  id: text("id").primaryKey(),
  documentVersionId: text("document_version_id").notNull().references(() => governanceDocumentVersions.id, { onDelete: "cascade" }),
  sectionKey: text("section_key").notNull(),
  heading: text("heading").notNull(),
  sequence: integer("sequence").notNull(),
  contentText: text("content_text").notNull().default(""),
  required: integer("required", { mode: "boolean" }).notNull().default(true),
  completionStatus: text("completion_status").notNull().default("EMPTY"),
  version: integer("version").notNull().default(1),
  ...auditColumns,
}, (table) => [
  uniqueIndex("uq_governance_sections_key").on(table.documentVersionId, table.sectionKey),
  uniqueIndex("uq_governance_sections_sequence").on(table.documentVersionId, table.sequence),
  index("idx_governance_sections_version_completion").on(table.documentVersionId, table.completionStatus, table.required),
  check("ck_governance_section_key", sql`${table.sectionKey} IN ('DOCUMENT_INFORMATION','EXECUTIVE_SUMMARY','BUSINESS_CONTEXT','PROBLEM_STATEMENT','BUSINESS_OBJECTIVES','BUSINESS_REQUIREMENTS','SCOPE','OUT_OF_SCOPE','STAKEHOLDERS','CURRENT_STATE','FUTURE_STATE','BUSINESS_PROCESSES','FUNCTIONAL_REQUIREMENTS','NON_FUNCTIONAL_REQUIREMENTS','BUSINESS_RULES','DEPENDENCIES','ASSUMPTIONS','RISKS','COMPLIANCE_REQUIREMENTS','KPIS','SUCCESS_METRICS','USER_STORIES','ACCEPTANCE_CRITERIA','UAT_CRITERIA','SIGN_OFF','PRODUCT_OVERVIEW','PROBLEM','OPPORTUNITY','TARGET_USERS','PERSONAS','USE_CASES','OBJECTIVES','FEATURES','UX_REQUIREMENTS','ANALYTICS_REQUIREMENTS','RELEASE_STRATEGY')`),
  check("ck_governance_section_fields", sql`length(trim(${table.heading})) BETWEEN 1 AND 160 AND ${table.sequence}>0 AND length(${table.contentText})<=100000 AND ${table.version}>0`),
  check("ck_governance_section_completion", sql`${table.completionStatus} IN ('EMPTY','IN_PROGRESS','COMPLETE') AND (${table.completionStatus}<>'COMPLETE' OR length(trim(${table.contentText}))>0) AND (${table.completionStatus}<>'EMPTY' OR length(trim(${table.contentText}))=0)`),
]);

export const requirements = sqliteTable("requirements", {
  id: text("id").primaryKey(),
  businessId: text("business_id").notNull(),
  requirementType: text("requirement_type").notNull(),
  productId: text("product_id").notNull().references(() => products.id, { onDelete: "restrict" }),
  projectId: text("project_id").references(() => projects.id, { onDelete: "restrict" }),
  documentId: text("document_id").references(() => governanceDocuments.id, { onDelete: "restrict" }),
  ownerUserId: text("owner_user_id").references(() => users.id, { onDelete: "set null" }),
  recordStatus: text("record_status").notNull().default("ACTIVE"),
  archivedAt: text("archived_at"),
  version: integer("version").notNull().default(1),
  ...auditColumns,
}, (table) => [
  uniqueIndex("uq_requirements_business_id").on(table.businessId),
  index("idx_requirements_product_type_status").on(table.productId, table.requirementType, table.recordStatus),
  index("idx_requirements_project_type_status").on(table.projectId, table.requirementType, table.recordStatus),
  index("idx_requirements_document").on(table.documentId),
  index("idx_requirements_owner_status").on(table.ownerUserId, table.recordStatus),
  check("ck_requirement_type", sql`${table.requirementType} IN ('BUSINESS','PRODUCT','FUNCTIONAL','NON_FUNCTIONAL','COMPLIANCE','BUSINESS_RULE','UX','ANALYTICS','UAT')`),
  check("ck_requirement_status", sql`${table.recordStatus} IN ('ACTIVE','ARCHIVED')`),
  check("ck_requirement_fields", sql`length(trim(${table.businessId})) BETWEEN 1 AND 32 AND ${table.version}>0`),
  check("ck_requirement_archive", sql`(${table.recordStatus}='ACTIVE' AND ${table.archivedAt} IS NULL) OR (${table.recordStatus}='ARCHIVED' AND ${table.archivedAt} IS NOT NULL)`),
]);

export const requirementRevisions = sqliteTable("requirement_revisions", {
  id: text("id").primaryKey(),
  requirementId: text("requirement_id").notNull().references(() => requirements.id, { onDelete: "restrict" }),
  revisionNumber: integer("revision_number").notNull().default(1),
  documentVersionId: text("document_version_id").references(() => governanceDocumentVersions.id, { onDelete: "restrict" }),
  title: text("title").notNull(),
  statement: text("statement").notNull().default(""),
  rationale: text("rationale").notNull().default(""),
  priority: text("priority").notNull().default("MEDIUM"),
  verificationMethod: text("verification_method").notNull().default(""),
  governanceStatus: text("governance_status").notNull().default("DRAFT"),
  contentHash: text("content_hash"),
  submittedAt: text("submitted_at"),
  approvedAt: text("approved_at"),
  version: integer("version").notNull().default(1),
  ...auditColumns,
}, (table) => [
  uniqueIndex("uq_requirement_revisions_number").on(table.requirementId, table.revisionNumber),
  uniqueIndex("uq_requirement_revisions_one_draft").on(table.requirementId).where(sql`${table.governanceStatus}='DRAFT'`),
  uniqueIndex("uq_requirement_revisions_one_current_approved").on(table.requirementId).where(sql`${table.governanceStatus}='APPROVED'`),
  index("idx_requirement_revisions_requirement_status").on(table.requirementId, table.governanceStatus, table.revisionNumber),
  index("idx_requirement_revisions_document_version").on(table.documentVersionId),
  check("ck_requirement_revision_status", sql`${table.governanceStatus} IN ('DRAFT','IN_REVIEW','APPROVED','REJECTED','SUPERSEDED','RETIRED')`),
  check("ck_requirement_revision_priority", sql`${table.priority} IN ('LOW','MEDIUM','HIGH','CRITICAL')`),
  check("ck_requirement_revision_numbers", sql`${table.revisionNumber}>0 AND ${table.version}>0`),
  check("ck_requirement_revision_fields", sql`length(trim(${table.title})) BETWEEN 1 AND 240 AND length(${table.statement})<=20000 AND length(${table.rationale})<=20000 AND length(${table.verificationMethod})<=4000`),
  check("ck_requirement_revision_hash", sql`${table.contentHash} IS NULL OR (length(${table.contentHash})=64 AND lower(${table.contentHash}) NOT GLOB '*[^0-9a-f]*')`),
  check("ck_requirement_revision_lock", sql`
    (${table.governanceStatus}='DRAFT' AND ${table.contentHash} IS NULL AND ${table.submittedAt} IS NULL AND ${table.approvedAt} IS NULL)
    OR (${table.governanceStatus}='IN_REVIEW' AND ${table.contentHash} IS NOT NULL AND ${table.submittedAt} IS NOT NULL AND ${table.approvedAt} IS NULL)
    OR (${table.governanceStatus} IN ('APPROVED','SUPERSEDED','RETIRED') AND ${table.contentHash} IS NOT NULL AND ${table.submittedAt} IS NOT NULL AND ${table.approvedAt} IS NOT NULL)
    OR (${table.governanceStatus}='REJECTED' AND ${table.contentHash} IS NOT NULL AND ${table.submittedAt} IS NOT NULL AND ${table.approvedAt} IS NULL)
  `),
]);

export const requirementRelationships = sqliteTable("requirement_relationships", {
  id: text("id").primaryKey(),
  sourceRequirementId: text("source_requirement_id").notNull().references(() => requirements.id, { onDelete: "restrict" }),
  targetRequirementId: text("target_requirement_id").notNull().references(() => requirements.id, { onDelete: "restrict" }),
  relationshipType: text("relationship_type").notNull(),
  rationale: text("rationale").notNull().default(""),
  version: integer("version").notNull().default(1),
  ...auditColumns,
}, (table) => [
  uniqueIndex("uq_requirement_relationships_edge").on(table.sourceRequirementId, table.targetRequirementId, table.relationshipType),
  index("idx_requirement_relationships_source").on(table.sourceRequirementId, table.relationshipType),
  index("idx_requirement_relationships_target").on(table.targetRequirementId, table.relationshipType),
  check("ck_requirement_relationship_type", sql`${table.relationshipType} IN ('DERIVES_FROM','DEPENDS_ON','CONFLICTS_WITH','DUPLICATES')`),
  check("ck_requirement_relationship_not_self", sql`${table.sourceRequirementId}<>${table.targetRequirementId}`),
  check("ck_requirement_relationship_fields", sql`length(${table.rationale})<=2000 AND ${table.version}>0`),
]);

export const requirementBacklogLinks = sqliteTable("requirement_backlog_links", {
  id: text("id").primaryKey(),
  requirementId: text("requirement_id").notNull().references(() => requirements.id, { onDelete: "restrict" }),
  backlogItemId: text("backlog_item_id").notNull().references(() => backlogItems.id, { onDelete: "restrict" }),
  linkType: text("link_type").notNull(),
  coveragePercentage: integer("coverage_percentage"),
  rationale: text("rationale").notNull().default(""),
  ...auditColumns,
}, (table) => [
  uniqueIndex("uq_requirement_backlog_links_edge").on(table.requirementId, table.backlogItemId, table.linkType),
  index("idx_requirement_backlog_links_requirement").on(table.requirementId, table.linkType),
  index("idx_requirement_backlog_links_backlog_item").on(table.backlogItemId),
  check("ck_requirement_backlog_link_type", sql`${table.linkType} IN ('IMPLEMENTS','PARTIALLY_IMPLEMENTS','VALIDATES')`),
  check("ck_requirement_backlog_link_fields", sql`length(${table.rationale})<=2000`),
  check("ck_requirement_backlog_link_coverage", sql`
    (${table.linkType}='PARTIALLY_IMPLEMENTS' AND ${table.coveragePercentage} IS NOT NULL AND ${table.coveragePercentage} BETWEEN 1 AND 99 AND length(trim(${table.rationale}))>0)
    OR (${table.linkType}<>'PARTIALLY_IMPLEMENTS' AND ${table.coveragePercentage} IS NULL)
  `),
]);

export const requirementEvidenceReferences = sqliteTable("requirement_evidence_references", {
  id: text("id").primaryKey(),
  requirementId: text("requirement_id").notNull().references(() => requirements.id, { onDelete: "restrict" }),
  evidenceType: text("evidence_type").notNull(),
  sourceSystem: text("source_system").notNull(),
  externalReference: text("external_reference").notNull(),
  sourceUrl: text("source_url"),
  evidenceStatus: text("evidence_status").notNull().default("NOT_AVAILABLE"),
  result: text("result").notNull().default(""),
  observedAt: text("observed_at"),
  version: integer("version").notNull().default(1),
  ...auditColumns,
}, (table) => [
  uniqueIndex("uq_requirement_evidence_reference").on(table.requirementId, table.evidenceType, table.externalReference),
  index("idx_requirement_evidence_requirement_type").on(table.requirementId, table.evidenceType, table.evidenceStatus),
  index("idx_requirement_evidence_observed").on(table.observedAt),
  check("ck_requirement_evidence_type", sql`${table.evidenceType} IN ('QA','UAT','RELEASE')`),
  check("ck_requirement_evidence_status", sql`${table.evidenceStatus} IN ('NOT_AVAILABLE','PENDING','PASSED','FAILED','CONDITIONAL','STALE')`),
  check("ck_requirement_evidence_fields", sql`length(trim(${table.sourceSystem})) BETWEEN 1 AND 120 AND length(trim(${table.externalReference})) BETWEEN 1 AND 160 AND length(${table.result})<=2000 AND ${table.version}>0`),
  check("ck_requirement_evidence_url", sql`${table.sourceUrl} IS NULL OR (length(${table.sourceUrl})<=500 AND (${table.sourceUrl} LIKE 'https://%' OR ${table.sourceUrl} LIKE 'http://%'))`),
  check("ck_requirement_evidence_observed_consistency", sql`
    (${table.evidenceStatus} IN ('NOT_AVAILABLE','PENDING') AND ${table.observedAt} IS NULL)
    OR (${table.evidenceStatus} IN ('PASSED','FAILED','CONDITIONAL','STALE') AND ${table.observedAt} IS NOT NULL)
  `),
]);

export const signoffRequests = sqliteTable("signoff_requests", {
  id: text("id").primaryKey(),
  documentVersionId: text("document_version_id").references(() => governanceDocumentVersions.id, { onDelete: "restrict" }),
  requirementRevisionId: text("requirement_revision_id").references(() => requirementRevisions.id, { onDelete: "restrict" }),
  feasibilityRevisionId: text("feasibility_revision_id").references((): AnySQLiteColumn => technicalFeasibilityRevisions.id, { onDelete: "restrict" }),
  status: text("status").notNull().default("PENDING"),
  requestedBy: text("requested_by").notNull(),
  requestedAt: text("requested_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  completedAt: text("completed_at"),
  version: integer("version").notNull().default(1),
  ...auditColumns,
}, (table) => [
  uniqueIndex("uq_signoff_requests_active_document_version").on(table.documentVersionId).where(sql`${table.status} IN ('PENDING','UNDER_REVIEW') AND ${table.documentVersionId} IS NOT NULL`),
  uniqueIndex("uq_signoff_requests_active_requirement_revision").on(table.requirementRevisionId).where(sql`${table.status} IN ('PENDING','UNDER_REVIEW') AND ${table.requirementRevisionId} IS NOT NULL`),
  uniqueIndex("uq_signoff_requests_active_feasibility_revision").on(table.feasibilityRevisionId).where(sql`${table.status} IN ('PENDING','UNDER_REVIEW') AND ${table.feasibilityRevisionId} IS NOT NULL`),
  index("idx_signoff_requests_document_version").on(table.documentVersionId, table.status),
  index("idx_signoff_requests_requirement_revision").on(table.requirementRevisionId, table.status),
  index("idx_signoff_requests_feasibility_revision").on(table.feasibilityRevisionId, table.status),
  index("idx_signoff_requests_status").on(table.status, table.requestedAt),
  check("ck_signoff_request_status", sql`${table.status} IN ('PENDING','UNDER_REVIEW','APPROVED','APPROVED_WITH_CONDITIONS','REJECTED')`),
  check("ck_signoff_request_subject", sql`
    (${table.documentVersionId} IS NOT NULL AND ${table.requirementRevisionId} IS NULL AND ${table.feasibilityRevisionId} IS NULL)
    OR (${table.documentVersionId} IS NULL AND ${table.requirementRevisionId} IS NOT NULL AND ${table.feasibilityRevisionId} IS NULL)
    OR (${table.documentVersionId} IS NULL AND ${table.requirementRevisionId} IS NULL AND ${table.feasibilityRevisionId} IS NOT NULL)
  `),
  check("ck_signoff_request_completion", sql`
    (${table.status} IN ('PENDING','UNDER_REVIEW') AND ${table.completedAt} IS NULL)
    OR (${table.status} IN ('APPROVED','APPROVED_WITH_CONDITIONS','REJECTED') AND ${table.completedAt} IS NOT NULL)
  `),
  check("ck_signoff_request_numbers", sql`${table.version}>0`),
]);

export const signoffLanes = sqliteTable("signoff_lanes", {
  id: text("id").primaryKey(),
  signoffRequestId: text("signoff_request_id").notNull().references(() => signoffRequests.id, { onDelete: "restrict" }),
  laneType: text("lane_type").notNull(),
  required: integer("required", { mode: "boolean" }).notNull().default(true),
  sequence: integer("sequence").notNull().default(1),
  assignedApproverUserId: text("assigned_approver_user_id").references(() => users.id, { onDelete: "restrict" }),
  status: text("status").notNull().default("PENDING"),
  dueAt: text("due_at"),
  version: integer("version").notNull().default(1),
  ...auditColumns,
}, (table) => [
  uniqueIndex("uq_signoff_lanes_request_type").on(table.signoffRequestId, table.laneType),
  index("idx_signoff_lanes_approver_status").on(table.assignedApproverUserId, table.status),
  index("idx_signoff_lanes_due").on(table.dueAt),
  check("ck_signoff_lane_type", sql`${table.laneType} IN ('PRODUCT','BUSINESS','ENGINEERING','ARCHITECTURE','QA','COMPLIANCE','LEGAL','FINANCE','OPERATIONS','EXECUTIVE_SPONSOR')`),
  check("ck_signoff_lane_status", sql`${table.status} IN ('PENDING','UNDER_REVIEW','APPROVED','APPROVED_WITH_CONDITIONS','REJECTED')`),
  check("ck_signoff_lane_numbers", sql`${table.sequence}>0 AND ${table.version}>0`),
]);

export const signoffDecisions = sqliteTable("signoff_decisions", {
  id: text("id").primaryKey(),
  signoffLaneId: text("signoff_lane_id").notNull().references(() => signoffLanes.id, { onDelete: "restrict" }),
  decision: text("decision").notNull(),
  approverUserId: text("approver_user_id").notNull().references(() => users.id, { onDelete: "restrict" }),
  comment: text("comment").notNull().default(""),
  decidedAt: text("decided_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  supersedesDecisionId: text("supersedes_decision_id").references((): AnySQLiteColumn => signoffDecisions.id, { onDelete: "restrict" }),
  ...auditColumns,
}, (table) => [
  index("idx_signoff_decisions_lane").on(table.signoffLaneId, table.decidedAt),
  index("idx_signoff_decisions_approver").on(table.approverUserId),
  check("ck_signoff_decision_value", sql`${table.decision} IN ('APPROVED','APPROVED_WITH_CONDITIONS','REJECTED')`),
  check("ck_signoff_decision_comment", sql`length(${table.comment})<=4000`),
  check("ck_signoff_decision_not_self", sql`${table.supersedesDecisionId} IS NULL OR ${table.supersedesDecisionId}<>${table.id}`),
]);

export const signoffConditions = sqliteTable("signoff_conditions", {
  id: text("id").primaryKey(),
  decisionId: text("decision_id").notNull().references(() => signoffDecisions.id, { onDelete: "restrict" }),
  description: text("description").notNull(),
  ownerUserId: text("owner_user_id").references(() => users.id, { onDelete: "restrict" }),
  dueAt: text("due_at"),
  status: text("status").notNull().default("OPEN"),
  closureEvidence: text("closure_evidence").notNull().default(""),
  closedBy: text("closed_by"),
  closedAt: text("closed_at"),
  version: integer("version").notNull().default(1),
  ...auditColumns,
}, (table) => [
  index("idx_signoff_conditions_decision").on(table.decisionId, table.status),
  index("idx_signoff_conditions_owner_status").on(table.ownerUserId, table.status),
  index("idx_signoff_conditions_due").on(table.dueAt),
  check("ck_signoff_condition_status", sql`${table.status} IN ('OPEN','IN_PROGRESS','SATISFIED','WAIVED')`),
  check("ck_signoff_condition_fields", sql`length(trim(${table.description})) BETWEEN 1 AND 2000 AND length(${table.closureEvidence})<=2000 AND ${table.version}>0`),
  check("ck_signoff_condition_closure", sql`
    (${table.status} IN ('OPEN','IN_PROGRESS') AND ${table.closedBy} IS NULL AND ${table.closedAt} IS NULL)
    OR (${table.status} IN ('SATISFIED','WAIVED') AND ${table.closedBy} IS NOT NULL AND ${table.closedAt} IS NOT NULL AND length(trim(${table.closureEvidence}))>0)
  `),
]);

export const governanceStakeholders = sqliteTable("governance_stakeholders", {
  id: text("id").primaryKey(),
  userId: text("user_id").references(() => users.id, { onDelete: "set null" }),
  projectId: text("project_id").notNull().references(() => projects.id, { onDelete: "restrict" }),
  displayName: text("display_name").notNull(),
  function: text("function").notNull().default(""),
  organization: text("organization").notNull().default(""),
  active: integer("active", { mode: "boolean" }).notNull().default(true),
  ...auditColumns,
}, (table) => [
  uniqueIndex("uq_governance_stakeholders_project_name").on(table.projectId, table.displayName),
  index("idx_governance_stakeholders_user").on(table.userId),
  index("idx_governance_stakeholders_active").on(table.projectId, table.active),
  check("ck_governance_stakeholder_fields", sql`length(trim(${table.displayName})) BETWEEN 1 AND 160 AND length(${table.function})<=160 AND length(${table.organization})<=160`),
]);

export const raciMatrices = sqliteTable("raci_matrices", {
  id: text("id").primaryKey(),
  businessId: text("business_id").notNull(),
  projectId: text("project_id").notNull().references(() => projects.id, { onDelete: "restrict" }),
  title: text("title").notNull(),
  status: text("status").notNull().default("DRAFT"),
  revision: integer("revision").notNull().default(1),
  publishedAt: text("published_at"),
  version: integer("version").notNull().default(1),
  ...auditColumns,
}, (table) => [
  uniqueIndex("uq_raci_matrices_business_id").on(table.businessId),
  uniqueIndex("uq_raci_matrices_one_draft").on(table.projectId).where(sql`${table.status}='DRAFT'`),
  index("idx_raci_matrices_project_status").on(table.projectId, table.status, table.revision),
  check("ck_raci_matrix_status", sql`${table.status} IN ('DRAFT','PUBLISHED','SUPERSEDED')`),
  check("ck_raci_matrix_fields", sql`length(trim(${table.businessId})) BETWEEN 1 AND 32 AND length(trim(${table.title})) BETWEEN 1 AND 240 AND ${table.revision}>0 AND ${table.version}>0`),
  check("ck_raci_matrix_lock", sql`
    (${table.status}='DRAFT' AND ${table.publishedAt} IS NULL)
    OR (${table.status} IN ('PUBLISHED','SUPERSEDED') AND ${table.publishedAt} IS NOT NULL)
  `),
]);

export const raciActivities = sqliteTable("raci_activities", {
  id: text("id").primaryKey(),
  matrixId: text("matrix_id").notNull().references(() => raciMatrices.id, { onDelete: "restrict" }),
  activityKey: text("activity_key").notNull(),
  name: text("name").notNull(),
  sequence: integer("sequence").notNull().default(1),
  governedSubjectType: text("governed_subject_type"),
  governedSubjectId: text("governed_subject_id"),
  ...auditColumns,
}, (table) => [
  uniqueIndex("uq_raci_activities_matrix_key").on(table.matrixId, table.activityKey),
  index("idx_raci_activities_matrix_sequence").on(table.matrixId, table.sequence),
  check("ck_raci_activity_key", sql`${table.activityKey} GLOB '[A-Za-z0-9_-]*' AND length(${table.activityKey}) BETWEEN 1 AND 64`),
  check("ck_raci_activity_fields", sql`length(trim(${table.name})) BETWEEN 1 AND 200 AND ${table.sequence}>0`),
  check("ck_raci_activity_subject", sql`
    (${table.governedSubjectType} IS NULL AND ${table.governedSubjectId} IS NULL)
    OR (${table.governedSubjectType} IN ('DOCUMENT','REQUIREMENT','REVIEW','DELIVERY','FEASIBILITY') AND ${table.governedSubjectId} IS NOT NULL)
  `),
]);

export const raciAssignments = sqliteTable("raci_assignments", {
  id: text("id").primaryKey(),
  activityId: text("activity_id").notNull().references(() => raciActivities.id, { onDelete: "restrict" }),
  stakeholderId: text("stakeholder_id").notNull().references(() => governanceStakeholders.id, { onDelete: "restrict" }),
  responsibility: text("responsibility").notNull(),
  ...auditColumns,
}, (table) => [
  uniqueIndex("uq_raci_assignments_activity_stakeholder").on(table.activityId, table.stakeholderId),
  index("idx_raci_assignments_stakeholder").on(table.stakeholderId),
  check("ck_raci_assignment_responsibility", sql`${table.responsibility} IN ('RESPONSIBLE','ACCOUNTABLE','CONSULTED','INFORMED')`),
]);

export const technicalFeasibilityAssessments = sqliteTable("technical_feasibility_assessments", {
  id: text("id").primaryKey(),
  businessId: text("business_id").notNull(),
  projectId: text("project_id").notNull().references(() => projects.id, { onDelete: "restrict" }),
  backlogFeatureId: text("backlog_feature_id").references(() => backlogItems.id, { onDelete: "restrict" }),
  ownerUserId: text("owner_user_id").references(() => users.id, { onDelete: "set null" }),
  recordStatus: text("record_status").notNull().default("ACTIVE"),
  archivedAt: text("archived_at"),
  version: integer("version").notNull().default(1),
  ...auditColumns,
}, (table) => [
  uniqueIndex("uq_technical_feasibility_assessments_business_id").on(table.businessId),
  index("idx_technical_feasibility_assessments_project_status").on(table.projectId, table.recordStatus),
  index("idx_technical_feasibility_assessments_feature").on(table.backlogFeatureId),
  index("idx_technical_feasibility_assessments_owner_status").on(table.ownerUserId, table.recordStatus),
  check("ck_technical_feasibility_assessment_status", sql`${table.recordStatus} IN ('ACTIVE','ARCHIVED')`),
  check("ck_technical_feasibility_assessment_fields", sql`length(trim(${table.businessId})) BETWEEN 1 AND 32 AND ${table.version}>0`),
  check("ck_technical_feasibility_assessment_archive", sql`(${table.recordStatus}='ACTIVE' AND ${table.archivedAt} IS NULL) OR (${table.recordStatus}='ARCHIVED' AND ${table.archivedAt} IS NOT NULL)`),
]);

export const technicalFeasibilityRevisions = sqliteTable("technical_feasibility_revisions", {
  id: text("id").primaryKey(),
  assessmentId: text("assessment_id").notNull().references(() => technicalFeasibilityAssessments.id, { onDelete: "restrict" }),
  revisionNumber: integer("revision_number").notNull().default(1),
  status: text("status").notNull().default("DRAFT"),
  technicalSpike: text("technical_spike").notNull().default(""),
  architectureReview: text("architecture_review").notNull().default(""),
  feasibilitySummary: text("feasibility_summary").notNull().default(""),
  integrationRequirements: text("integration_requirements").notNull().default(""),
  securityReview: text("security_review").notNull().default(""),
  technicalConstraints: text("technical_constraints").notNull().default(""),
  technicalDebtRisk: text("technical_debt_risk").notNull().default(""),
  engineeringEstimate: integer("engineering_estimate"),
  estimateUnit: text("estimate_unit"),
  recommendation: text("recommendation").notNull().default(""),
  contentHash: text("content_hash"),
  submittedAt: text("submitted_at"),
  approvedAt: text("approved_at"),
  version: integer("version").notNull().default(1),
  ...auditColumns,
}, (table) => [
  uniqueIndex("uq_technical_feasibility_revisions_number").on(table.assessmentId, table.revisionNumber),
  uniqueIndex("uq_technical_feasibility_revisions_one_draft").on(table.assessmentId).where(sql`${table.status}='DRAFT'`),
  uniqueIndex("uq_technical_feasibility_revisions_one_current").on(table.assessmentId).where(sql`${table.status} IN ('FEASIBLE','FEASIBLE_WITH_CONDITIONS','NOT_FEASIBLE')`),
  index("idx_technical_feasibility_revisions_assessment_status").on(table.assessmentId, table.status, table.revisionNumber),
  check("ck_technical_feasibility_revision_status", sql`${table.status} IN ('DRAFT','IN_REVIEW','FEASIBLE','FEASIBLE_WITH_CONDITIONS','NOT_FEASIBLE','SUPERSEDED')`),
  check("ck_technical_feasibility_revision_numbers", sql`${table.revisionNumber}>0 AND ${table.version}>0`),
  check("ck_technical_feasibility_revision_estimate_unit", sql`${table.estimateUnit} IS NULL OR ${table.estimateUnit} IN ('HOURS','DAYS','STORY_POINTS')`),
  check("ck_technical_feasibility_revision_estimate", sql`
    (${table.engineeringEstimate} IS NULL AND ${table.estimateUnit} IS NULL)
    OR (${table.engineeringEstimate} IS NOT NULL AND ${table.engineeringEstimate}>=0 AND ${table.estimateUnit} IS NOT NULL)
  `),
  check("ck_technical_feasibility_revision_fields", sql`
    length(${table.technicalSpike})<=20000 AND length(${table.architectureReview})<=20000 AND length(${table.feasibilitySummary})<=20000
    AND length(${table.integrationRequirements})<=20000 AND length(${table.securityReview})<=20000 AND length(${table.technicalConstraints})<=20000
    AND length(${table.technicalDebtRisk})<=20000 AND length(${table.recommendation})<=20000
  `),
  check("ck_technical_feasibility_revision_hash", sql`${table.contentHash} IS NULL OR (length(${table.contentHash})=64 AND lower(${table.contentHash}) NOT GLOB '*[^0-9a-f]*')`),
  check("ck_technical_feasibility_revision_lock", sql`
    (${table.status}='DRAFT' AND ${table.contentHash} IS NULL AND ${table.submittedAt} IS NULL AND ${table.approvedAt} IS NULL)
    OR (${table.status}='IN_REVIEW' AND ${table.contentHash} IS NOT NULL AND ${table.submittedAt} IS NOT NULL AND ${table.approvedAt} IS NULL)
    OR (${table.status} IN ('FEASIBLE','FEASIBLE_WITH_CONDITIONS','SUPERSEDED') AND ${table.contentHash} IS NOT NULL AND ${table.submittedAt} IS NOT NULL AND ${table.approvedAt} IS NOT NULL)
    OR (${table.status}='NOT_FEASIBLE' AND ${table.contentHash} IS NOT NULL AND ${table.submittedAt} IS NOT NULL AND ${table.approvedAt} IS NULL)
  `),
]);

export const feasibilityRequirementLinks = sqliteTable("feasibility_requirement_links", {
  id: text("id").primaryKey(),
  assessmentId: text("assessment_id").notNull().references(() => technicalFeasibilityAssessments.id, { onDelete: "restrict" }),
  requirementId: text("requirement_id").notNull().references(() => requirements.id, { onDelete: "restrict" }),
  coverageNote: text("coverage_note").notNull().default(""),
  ...auditColumns,
}, (table) => [
  uniqueIndex("uq_feasibility_requirement_links_edge").on(table.assessmentId, table.requirementId),
  index("idx_feasibility_requirement_links_requirement").on(table.requirementId),
  check("ck_feasibility_requirement_link_fields", sql`length(${table.coverageNote})<=2000`),
]);
