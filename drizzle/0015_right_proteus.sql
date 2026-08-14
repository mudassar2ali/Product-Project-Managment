CREATE TABLE `azure_mapping_entries` (
	`id` text PRIMARY KEY NOT NULL,
	`connection_id` text NOT NULL,
	`mapping_kind` text NOT NULL,
	`external_value` text NOT NULL,
	`external_key` text NOT NULL,
	`normalized_value` text NOT NULL,
	`active` integer DEFAULT true NOT NULL,
	`version` integer DEFAULT 1 NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`created_by` text,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_by` text,
	FOREIGN KEY (`connection_id`) REFERENCES `azure_connections`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "ck_azure_mapping_kind" CHECK("azure_mapping_entries"."mapping_kind" IN ('TYPE','STATE')),
	CONSTRAINT "ck_azure_mapping_value" CHECK(("azure_mapping_entries"."mapping_kind"='TYPE' AND "azure_mapping_entries"."normalized_value" IN ('EPIC','FEATURE','STORY','TASK','BUG')) OR ("azure_mapping_entries"."mapping_kind"='STATE' AND "azure_mapping_entries"."normalized_value" IN ('PROPOSED','READY','IN_PROGRESS','VALIDATION','DONE','REMOVED')))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `uq_azure_mapping_external` ON `azure_mapping_entries` (`connection_id`,`mapping_kind`,`external_key`);--> statement-breakpoint
CREATE INDEX `idx_azure_mapping_active` ON `azure_mapping_entries` (`connection_id`,`mapping_kind`,`active`);--> statement-breakpoint
INSERT INTO `azure_mapping_entries` (`id`,`connection_id`,`mapping_kind`,`external_value`,`external_key`,`normalized_value`) SELECT `id`||':TYPE:epic',`id`,'TYPE','Epic','epic','EPIC' FROM `azure_connections`;--> statement-breakpoint
INSERT INTO `azure_mapping_entries` (`id`,`connection_id`,`mapping_kind`,`external_value`,`external_key`,`normalized_value`) SELECT `id`||':TYPE:feature',`id`,'TYPE','Feature','feature','FEATURE' FROM `azure_connections`;--> statement-breakpoint
INSERT INTO `azure_mapping_entries` (`id`,`connection_id`,`mapping_kind`,`external_value`,`external_key`,`normalized_value`) SELECT `id`||':TYPE:user-story',`id`,'TYPE','User Story','user story','STORY' FROM `azure_connections`;--> statement-breakpoint
INSERT INTO `azure_mapping_entries` (`id`,`connection_id`,`mapping_kind`,`external_value`,`external_key`,`normalized_value`) SELECT `id`||':TYPE:pbi',`id`,'TYPE','Product Backlog Item','product backlog item','STORY' FROM `azure_connections`;--> statement-breakpoint
INSERT INTO `azure_mapping_entries` (`id`,`connection_id`,`mapping_kind`,`external_value`,`external_key`,`normalized_value`) SELECT `id`||':TYPE:task',`id`,'TYPE','Task','task','TASK' FROM `azure_connections`;--> statement-breakpoint
INSERT INTO `azure_mapping_entries` (`id`,`connection_id`,`mapping_kind`,`external_value`,`external_key`,`normalized_value`) SELECT `id`||':TYPE:bug',`id`,'TYPE','Bug','bug','BUG' FROM `azure_connections`;--> statement-breakpoint
INSERT INTO `azure_mapping_entries` (`id`,`connection_id`,`mapping_kind`,`external_value`,`external_key`,`normalized_value`) SELECT `id`||':STATE:new',`id`,'STATE','New','new','PROPOSED' FROM `azure_connections`;--> statement-breakpoint
INSERT INTO `azure_mapping_entries` (`id`,`connection_id`,`mapping_kind`,`external_value`,`external_key`,`normalized_value`) SELECT `id`||':STATE:approved',`id`,'STATE','Approved','approved','READY' FROM `azure_connections`;--> statement-breakpoint
INSERT INTO `azure_mapping_entries` (`id`,`connection_id`,`mapping_kind`,`external_value`,`external_key`,`normalized_value`) SELECT `id`||':STATE:committed',`id`,'STATE','Committed','committed','READY' FROM `azure_connections`;--> statement-breakpoint
INSERT INTO `azure_mapping_entries` (`id`,`connection_id`,`mapping_kind`,`external_value`,`external_key`,`normalized_value`) SELECT `id`||':STATE:active',`id`,'STATE','Active','active','IN_PROGRESS' FROM `azure_connections`;--> statement-breakpoint
INSERT INTO `azure_mapping_entries` (`id`,`connection_id`,`mapping_kind`,`external_value`,`external_key`,`normalized_value`) SELECT `id`||':STATE:in-progress',`id`,'STATE','In Progress','in progress','IN_PROGRESS' FROM `azure_connections`;--> statement-breakpoint
INSERT INTO `azure_mapping_entries` (`id`,`connection_id`,`mapping_kind`,`external_value`,`external_key`,`normalized_value`) SELECT `id`||':STATE:resolved',`id`,'STATE','Resolved','resolved','VALIDATION' FROM `azure_connections`;--> statement-breakpoint
INSERT INTO `azure_mapping_entries` (`id`,`connection_id`,`mapping_kind`,`external_value`,`external_key`,`normalized_value`) SELECT `id`||':STATE:closed',`id`,'STATE','Closed','closed','DONE' FROM `azure_connections`;--> statement-breakpoint
INSERT INTO `azure_mapping_entries` (`id`,`connection_id`,`mapping_kind`,`external_value`,`external_key`,`normalized_value`) SELECT `id`||':STATE:done',`id`,'STATE','Done','done','DONE' FROM `azure_connections`;--> statement-breakpoint
INSERT INTO `azure_mapping_entries` (`id`,`connection_id`,`mapping_kind`,`external_value`,`external_key`,`normalized_value`) SELECT `id`||':STATE:removed',`id`,'STATE','Removed','removed','REMOVED' FROM `azure_connections`;--> statement-breakpoint
CREATE TABLE `azure_sync_diagnostics` (
	`id` text PRIMARY KEY NOT NULL,
	`sync_run_id` text NOT NULL,
	`link_id` text NOT NULL,
	`code` text NOT NULL,
	`severity` text NOT NULL,
	`mapping_kind` text,
	`external_value` text,
	`occurrences` integer DEFAULT 1 NOT NULL,
	`message` text NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`created_by` text,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_by` text,
	FOREIGN KEY (`sync_run_id`) REFERENCES `azure_sync_runs`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`link_id`) REFERENCES `azure_project_links`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "ck_azure_sync_diagnostic_severity" CHECK("azure_sync_diagnostics"."severity" IN ('INFO','WARNING','ERROR')),
	CONSTRAINT "ck_azure_sync_diagnostic_occurrences" CHECK("azure_sync_diagnostics"."occurrences">0)
);
--> statement-breakpoint
CREATE INDEX `idx_azure_sync_diagnostic_run` ON `azure_sync_diagnostics` (`sync_run_id`,`severity`);--> statement-breakpoint
CREATE INDEX `idx_azure_sync_diagnostic_link_code` ON `azure_sync_diagnostics` (`link_id`,`code`);--> statement-breakpoint
CREATE TABLE `azure_work_item_snapshots` (
	`id` text PRIMARY KEY NOT NULL,
	`link_id` text NOT NULL,
	`sync_run_id` text NOT NULL,
	`external_id` text NOT NULL,
	`external_revision` text NOT NULL,
	`external_type` text NOT NULL,
	`external_state` text NOT NULL,
	`normalized_type` text,
	`normalized_state` text,
	`parent_external_id` text,
	`title` text NOT NULL,
	`owner` text,
	`story_points` integer,
	`remaining_work` integer,
	`blocked` integer DEFAULT false NOT NULL,
	`blocked_reason` text,
	`iteration_id` text,
	`iteration_path` text,
	`relations_json` text DEFAULT '[]' NOT NULL,
	`source_url` text NOT NULL,
	`source_changed_at` text,
	`synced_at` text NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`created_by` text,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_by` text,
	FOREIGN KEY (`link_id`) REFERENCES `azure_project_links`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`sync_run_id`) REFERENCES `azure_sync_runs`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "ck_azure_work_item_snapshot_values" CHECK(("azure_work_item_snapshots"."story_points" IS NULL OR "azure_work_item_snapshots"."story_points">=0) AND ("azure_work_item_snapshots"."remaining_work" IS NULL OR "azure_work_item_snapshots"."remaining_work">=0))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `uq_azure_work_item_snapshot_revision` ON `azure_work_item_snapshots` (`link_id`,`external_id`,`external_revision`);--> statement-breakpoint
CREATE INDEX `idx_azure_work_item_snapshot_run` ON `azure_work_item_snapshots` (`sync_run_id`,`external_id`);--> statement-breakpoint
CREATE INDEX `idx_azure_work_item_snapshot_iteration` ON `azure_work_item_snapshots` (`link_id`,`iteration_id`,`normalized_state`);--> statement-breakpoint
ALTER TABLE `azure_sync_runs` ADD `sync_mode` text DEFAULT 'BASIC' NOT NULL;--> statement-breakpoint
ALTER TABLE `azure_sync_runs` ADD `lock_expires_at` text;--> statement-breakpoint
ALTER TABLE `azure_sync_runs` ADD `pages_read` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `azure_sync_runs` ADD `items_inserted` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `azure_sync_runs` ADD `items_updated` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `azure_sync_runs` ADD `items_skipped` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `azure_sync_runs` ADD `items_missing` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `azure_sync_runs` ADD `unmapped_types` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `azure_sync_runs` ADD `unmapped_states` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `azure_sync_runs` ADD `source_revision` text;--> statement-breakpoint
CREATE UNIQUE INDEX `uq_azure_sync_run_active_link` ON `azure_sync_runs` (`link_id`) WHERE "azure_sync_runs"."status"='RUNNING';--> statement-breakpoint
PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_backlog_items` (
	`id` text PRIMARY KEY NOT NULL,
	`business_id` text NOT NULL,
	`project_id` text NOT NULL,
	`parent_id` text,
	`item_type` text NOT NULL,
	`external_type` text,
	`external_state` text,
	`external_parent_id` text,
	`external_owner` text,
	`external_iteration_id` text,
	`external_iteration_path` text,
	`origin` text DEFAULT 'LOCAL' NOT NULL,
	`title` text NOT NULL,
	`description` text DEFAULT '' NOT NULL,
	`story_actor` text,
	`story_capability` text,
	`business_value` text DEFAULT '' NOT NULL,
	`priority` text DEFAULT 'MEDIUM' NOT NULL,
	`estimate_hours` integer,
	`story_points` integer,
	`remaining_work` integer,
	`owner_user_id` text,
	`status` text DEFAULT 'DRAFT' NOT NULL,
	`delivery_state` text DEFAULT 'PROPOSED' NOT NULL,
	`blocked` integer DEFAULT false NOT NULL,
	`blocked_reason` text,
	`external_id` text,
	`external_revision` text,
	`source_url` text,
	`source_updated_at` text,
	`synced_at` text,
	`source_missing_at` text,
	`record_status` text DEFAULT 'ACTIVE' NOT NULL,
	`archived_at` text,
	`version` integer DEFAULT 1 NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`created_by` text,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_by` text,
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`parent_id`) REFERENCES `backlog_items`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`owner_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE set null,
	CONSTRAINT "ck_backlog_item_type" CHECK("item_type" IN ('EPIC','FEATURE','STORY','TASK','BUG')),
	CONSTRAINT "ck_backlog_origin" CHECK("origin" IN ('LOCAL','AZURE_DEVOPS')),
	CONSTRAINT "ck_backlog_status" CHECK("status" IN ('DRAFT','READY','IN_PROGRESS','DONE','REMOVED')),
	CONSTRAINT "ck_backlog_delivery_state" CHECK("delivery_state" IN ('PROPOSED','READY','IN_PROGRESS','VALIDATION','DONE','REMOVED','UNMAPPED')),
	CONSTRAINT "ck_backlog_nonnegative_estimate" CHECK("estimate_hours" IS NULL OR "estimate_hours" >= 0),
	CONSTRAINT "ck_backlog_nonnegative_points" CHECK("story_points" IS NULL OR "story_points" >= 0),
	CONSTRAINT "ck_backlog_nonnegative_remaining" CHECK("remaining_work" IS NULL OR "remaining_work" >= 0),
	CONSTRAINT "ck_backlog_origin_external" CHECK(("origin"='LOCAL' AND "external_id" IS NULL AND "external_revision" IS NULL AND "source_url" IS NULL) OR ("origin"='AZURE_DEVOPS' AND "external_id" IS NOT NULL AND "external_revision" IS NOT NULL AND "source_url" IS NOT NULL)),
	CONSTRAINT "ck_backlog_blocked_reason" CHECK("blocked"=0 OR length(trim(COALESCE("blocked_reason",'')))>0)
);
--> statement-breakpoint
INSERT INTO `__new_backlog_items`("id", "business_id", "project_id", "parent_id", "item_type", "external_type", "external_state", "external_parent_id", "external_owner", "external_iteration_id", "external_iteration_path", "origin", "title", "description", "story_actor", "story_capability", "business_value", "priority", "estimate_hours", "story_points", "remaining_work", "owner_user_id", "status", "delivery_state", "blocked", "blocked_reason", "external_id", "external_revision", "source_url", "source_updated_at", "synced_at", "source_missing_at", "record_status", "archived_at", "version", "created_at", "created_by", "updated_at", "updated_by") SELECT "id", "business_id", "project_id", "parent_id", "item_type", "external_type", NULL, NULL, NULL, NULL, NULL, "origin", "title", "description", "story_actor", "story_capability", "business_value", "priority", "estimate_hours", "story_points", NULL, "owner_user_id", "status", "delivery_state", "blocked", "blocked_reason", "external_id", "external_revision", "source_url", "source_updated_at", "synced_at", NULL, "record_status", "archived_at", "version", "created_at", "created_by", "updated_at", "updated_by" FROM `backlog_items`;--> statement-breakpoint
DROP TABLE `backlog_items`;--> statement-breakpoint
ALTER TABLE `__new_backlog_items` RENAME TO `backlog_items`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
CREATE UNIQUE INDEX `uq_backlog_items_business_id` ON `backlog_items` (`business_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `uq_backlog_items_external` ON `backlog_items` (`project_id`,`origin`,`external_id`);--> statement-breakpoint
CREATE INDEX `idx_backlog_items_project_parent` ON `backlog_items` (`project_id`,`parent_id`);--> statement-breakpoint
CREATE INDEX `idx_backlog_items_project_status` ON `backlog_items` (`project_id`,`status`,`record_status`);--> statement-breakpoint
CREATE INDEX `idx_backlog_items_owner_status` ON `backlog_items` (`owner_user_id`,`status`);--> statement-breakpoint
CREATE INDEX `idx_backlog_items_origin_sync` ON `backlog_items` (`origin`,`synced_at`);--> statement-breakpoint
CREATE INDEX `idx_backlog_items_external_iteration` ON `backlog_items` (`project_id`,`external_iteration_id`,`delivery_state`);--> statement-breakpoint
CREATE TRIGGER `trg_story_ready_insert`
BEFORE INSERT ON `backlog_items`
WHEN NEW.`origin`='LOCAL' AND NEW.`item_type`='STORY' AND NEW.`status`='READY'
BEGIN
  SELECT RAISE(ABORT, 'STORY_NOT_READY');
END;--> statement-breakpoint
CREATE TRIGGER `trg_story_ready_update`
BEFORE UPDATE OF `status`, `story_actor`, `story_capability`, `business_value` ON `backlog_items`
WHEN NEW.`origin`='LOCAL' AND NEW.`item_type`='STORY' AND NEW.`status`='READY' AND (
  length(trim(COALESCE(NEW.`story_actor`,'')))=0 OR
  length(trim(COALESCE(NEW.`story_capability`,'')))=0 OR
  length(trim(COALESCE(NEW.`business_value`,'')))=0 OR
  NOT EXISTS (SELECT 1 FROM `acceptance_criteria` WHERE `backlog_item_id`=NEW.`id`)
)
BEGIN
  SELECT RAISE(ABORT, 'STORY_NOT_READY');
END;--> statement-breakpoint
CREATE TRIGGER `trg_dependency_ready_update`
BEFORE UPDATE OF `status` ON `backlog_items`
WHEN NEW.`origin`='LOCAL' AND NEW.`status`='READY' AND EXISTS (
  SELECT 1 FROM `backlog_dependencies` d JOIN `backlog_items` p ON p.`id`=d.`predecessor_item_id`
  WHERE d.`successor_item_id`=NEW.`id` AND d.`dependency_type` IN ('BLOCKS','REQUIRES') AND p.`status`<>'DONE'
)
BEGIN
  SELECT RAISE(ABORT, 'UNRESOLVED_DEPENDENCY');
END;--> statement-breakpoint
CREATE TRIGGER `trg_dependency_predecessor_regression`
BEFORE UPDATE OF `status` ON `backlog_items`
WHEN NEW.`origin`='LOCAL' AND OLD.`status`='DONE' AND NEW.`status`<>'DONE' AND EXISTS (
  SELECT 1 FROM `backlog_dependencies` d JOIN `backlog_items` s ON s.`id`=d.`successor_item_id`
  WHERE d.`predecessor_item_id`=NEW.`id` AND d.`dependency_type` IN ('BLOCKS','REQUIRES') AND s.`status`='READY'
)
BEGIN
  SELECT RAISE(ABORT, 'READY_SUCCESSOR_DEPENDS_ON_ITEM');
END;
