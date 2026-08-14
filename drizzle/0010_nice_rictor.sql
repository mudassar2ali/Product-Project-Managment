CREATE TABLE `acceptance_criteria` (
	`id` text PRIMARY KEY NOT NULL,
	`backlog_item_id` text NOT NULL,
	`sequence` integer NOT NULL,
	`given_text` text NOT NULL,
	`when_text` text NOT NULL,
	`then_text` text NOT NULL,
	`status` text DEFAULT 'DRAFT' NOT NULL,
	`version` integer DEFAULT 1 NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`created_by` text,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_by` text,
	FOREIGN KEY (`backlog_item_id`) REFERENCES `backlog_items`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "ck_acceptance_sequence" CHECK("acceptance_criteria"."sequence">0),
	CONSTRAINT "ck_acceptance_status" CHECK("acceptance_criteria"."status" IN ('DRAFT','READY','MET','NOT_MET')),
	CONSTRAINT "ck_acceptance_complete" CHECK(length(trim("acceptance_criteria"."given_text"))>0 AND length(trim("acceptance_criteria"."when_text"))>0 AND length(trim("acceptance_criteria"."then_text"))>0)
);
--> statement-breakpoint
CREATE UNIQUE INDEX `uq_acceptance_criteria_sequence` ON `acceptance_criteria` (`backlog_item_id`,`sequence`);--> statement-breakpoint
CREATE INDEX `idx_acceptance_criteria_item_status` ON `acceptance_criteria` (`backlog_item_id`,`status`);--> statement-breakpoint
CREATE TABLE `backlog_dependencies` (
	`id` text PRIMARY KEY NOT NULL,
	`predecessor_item_id` text NOT NULL,
	`successor_item_id` text NOT NULL,
	`dependency_type` text NOT NULL,
	`origin` text DEFAULT 'LOCAL' NOT NULL,
	`external_relation_id` text,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`created_by` text,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_by` text,
	FOREIGN KEY (`predecessor_item_id`) REFERENCES `backlog_items`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`successor_item_id`) REFERENCES `backlog_items`(`id`) ON UPDATE no action ON DELETE restrict,
	CONSTRAINT "ck_backlog_dependency_not_self" CHECK("backlog_dependencies"."predecessor_item_id"<>"backlog_dependencies"."successor_item_id"),
	CONSTRAINT "ck_backlog_dependency_type" CHECK("backlog_dependencies"."dependency_type" IN ('BLOCKS','REQUIRES','RELATES_TO')),
	CONSTRAINT "ck_backlog_dependency_origin" CHECK("backlog_dependencies"."origin" IN ('LOCAL','AZURE_DEVOPS'))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `uq_backlog_dependency_edge` ON `backlog_dependencies` (`predecessor_item_id`,`successor_item_id`,`dependency_type`);--> statement-breakpoint
CREATE INDEX `idx_backlog_dependencies_successor` ON `backlog_dependencies` (`successor_item_id`,`dependency_type`);--> statement-breakpoint
CREATE TABLE `backlog_items` (
	`id` text PRIMARY KEY NOT NULL,
	`business_id` text NOT NULL,
	`project_id` text NOT NULL,
	`parent_id` text,
	`item_type` text NOT NULL,
	`external_type` text,
	`origin` text DEFAULT 'LOCAL' NOT NULL,
	`title` text NOT NULL,
	`description` text DEFAULT '' NOT NULL,
	`story_actor` text,
	`story_capability` text,
	`business_value` text DEFAULT '' NOT NULL,
	`priority` text DEFAULT 'MEDIUM' NOT NULL,
	`estimate_hours` integer,
	`story_points` integer,
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
	CONSTRAINT "ck_backlog_item_type" CHECK("backlog_items"."item_type" IN ('EPIC','FEATURE','STORY','TASK','BUG')),
	CONSTRAINT "ck_backlog_origin" CHECK("backlog_items"."origin" IN ('LOCAL','AZURE_DEVOPS')),
	CONSTRAINT "ck_backlog_status" CHECK("backlog_items"."status" IN ('DRAFT','READY','IN_PROGRESS','DONE','REMOVED')),
	CONSTRAINT "ck_backlog_delivery_state" CHECK("backlog_items"."delivery_state" IN ('PROPOSED','READY','IN_PROGRESS','VALIDATION','DONE','REMOVED','UNMAPPED')),
	CONSTRAINT "ck_backlog_nonnegative_estimate" CHECK("backlog_items"."estimate_hours" IS NULL OR "backlog_items"."estimate_hours" >= 0),
	CONSTRAINT "ck_backlog_nonnegative_points" CHECK("backlog_items"."story_points" IS NULL OR "backlog_items"."story_points" >= 0),
	CONSTRAINT "ck_backlog_origin_external" CHECK(("backlog_items"."origin"='LOCAL' AND "backlog_items"."external_id" IS NULL AND "backlog_items"."external_revision" IS NULL AND "backlog_items"."source_url" IS NULL) OR ("backlog_items"."origin"='AZURE_DEVOPS' AND "backlog_items"."external_id" IS NOT NULL AND "backlog_items"."external_revision" IS NOT NULL AND "backlog_items"."source_url" IS NOT NULL)),
	CONSTRAINT "ck_backlog_blocked_reason" CHECK("backlog_items"."blocked"=0 OR length(trim(COALESCE("backlog_items"."blocked_reason",'')))>0)
);
--> statement-breakpoint
CREATE UNIQUE INDEX `uq_backlog_items_business_id` ON `backlog_items` (`business_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `uq_backlog_items_external` ON `backlog_items` (`project_id`,`origin`,`external_id`);--> statement-breakpoint
CREATE INDEX `idx_backlog_items_project_parent` ON `backlog_items` (`project_id`,`parent_id`);--> statement-breakpoint
CREATE INDEX `idx_backlog_items_project_status` ON `backlog_items` (`project_id`,`status`,`record_status`);--> statement-breakpoint
CREATE INDEX `idx_backlog_items_owner_status` ON `backlog_items` (`owner_user_id`,`status`);--> statement-breakpoint
CREATE INDEX `idx_backlog_items_origin_sync` ON `backlog_items` (`origin`,`synced_at`);