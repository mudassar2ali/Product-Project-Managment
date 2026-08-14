CREATE TABLE `sprint_memberships` (
	`id` text PRIMARY KEY NOT NULL,
	`sprint_id` text NOT NULL,
	`backlog_item_id` text NOT NULL,
	`planned_points` integer DEFAULT 0 NOT NULL,
	`planned_hours` integer DEFAULT 0 NOT NULL,
	`sequence` integer NOT NULL,
	`carried_from_membership_id` text,
	`added_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`removed_at` text,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`created_by` text,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_by` text,
	FOREIGN KEY (`sprint_id`) REFERENCES `sprints`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`backlog_item_id`) REFERENCES `backlog_items`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`carried_from_membership_id`) REFERENCES `sprint_memberships`(`id`) ON UPDATE no action ON DELETE set null,
	CONSTRAINT "ck_sprint_membership_values" CHECK("sprint_memberships"."sequence">0 AND "sprint_memberships"."planned_points">=0 AND "sprint_memberships"."planned_hours">=0)
);
--> statement-breakpoint
CREATE UNIQUE INDEX `uq_sprint_membership_item` ON `sprint_memberships` (`sprint_id`,`backlog_item_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `uq_sprint_membership_sequence` ON `sprint_memberships` (`sprint_id`,`sequence`);--> statement-breakpoint
CREATE INDEX `idx_sprint_membership_backlog` ON `sprint_memberships` (`backlog_item_id`,`sprint_id`);--> statement-breakpoint
CREATE TABLE `sprints` (
	`id` text PRIMARY KEY NOT NULL,
	`business_id` text NOT NULL,
	`project_id` text NOT NULL,
	`name` text NOT NULL,
	`goal` text DEFAULT '' NOT NULL,
	`origin` text DEFAULT 'LOCAL' NOT NULL,
	`external_id` text,
	`external_path` text,
	`start_date` text NOT NULL,
	`end_date` text NOT NULL,
	`status` text DEFAULT 'PLANNED' NOT NULL,
	`capacity_hours` integer DEFAULT 0 NOT NULL,
	`committed_points` integer DEFAULT 0 NOT NULL,
	`activated_at` text,
	`completed_at` text,
	`record_status` text DEFAULT 'ACTIVE' NOT NULL,
	`archived_at` text,
	`version` integer DEFAULT 1 NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`created_by` text,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_by` text,
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "ck_sprint_origin" CHECK("sprints"."origin" IN ('LOCAL','AZURE_DEVOPS')),
	CONSTRAINT "ck_sprint_status" CHECK("sprints"."status" IN ('PLANNED','ACTIVE','COMPLETED')),
	CONSTRAINT "ck_sprint_dates" CHECK("sprints"."end_date" >= "sprints"."start_date"),
	CONSTRAINT "ck_sprint_capacity" CHECK("sprints"."capacity_hours" >= 0 AND "sprints"."committed_points" >= 0),
	CONSTRAINT "ck_sprint_origin_external" CHECK(("sprints"."origin"='LOCAL' AND "sprints"."external_id" IS NULL AND "sprints"."external_path" IS NULL) OR ("sprints"."origin"='AZURE_DEVOPS' AND "sprints"."external_id" IS NOT NULL AND "sprints"."external_path" IS NOT NULL))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `uq_sprints_business_id` ON `sprints` (`business_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `uq_sprints_external` ON `sprints` (`project_id`,`origin`,`external_id`);--> statement-breakpoint
CREATE INDEX `idx_sprints_project_status_dates` ON `sprints` (`project_id`,`status`,`start_date`,`end_date`);--> statement-breakpoint
CREATE INDEX `idx_sprints_origin_status` ON `sprints` (`origin`,`status`);