CREATE TABLE `release_scope_items` (
	`id` text PRIMARY KEY NOT NULL,
	`release_id` text NOT NULL,
	`backlog_item_id` text NOT NULL,
	`added_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`removed_at` text,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`created_by` text,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_by` text,
	FOREIGN KEY (`release_id`) REFERENCES `releases`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`backlog_item_id`) REFERENCES `backlog_items`(`id`) ON UPDATE no action ON DELETE restrict
);
--> statement-breakpoint
CREATE UNIQUE INDEX `uq_release_scope_active` ON `release_scope_items` (`release_id`,`backlog_item_id`) WHERE "release_scope_items"."removed_at" IS NULL;--> statement-breakpoint
CREATE INDEX `idx_release_scope_backlog_item` ON `release_scope_items` (`backlog_item_id`,`removed_at`);--> statement-breakpoint
CREATE INDEX `idx_release_scope_release` ON `release_scope_items` (`release_id`,`removed_at`);--> statement-breakpoint
CREATE TABLE `releases` (
	`id` text PRIMARY KEY NOT NULL,
	`business_id` text NOT NULL,
	`project_id` text NOT NULL,
	`name` text NOT NULL,
	`release_type` text DEFAULT 'MINOR' NOT NULL,
	`target_version` text DEFAULT '' NOT NULL,
	`planned_date` text,
	`status` text DEFAULT 'PLANNING' NOT NULL,
	`scope_locked_at` text,
	`released_at` text,
	`owner_user_id` text,
	`record_status` text DEFAULT 'ACTIVE' NOT NULL,
	`version` integer DEFAULT 1 NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`created_by` text,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_by` text,
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`owner_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE set null,
	CONSTRAINT "ck_release_type" CHECK("releases"."release_type" IN ('MAJOR','MINOR','PATCH','HOTFIX')),
	CONSTRAINT "ck_release_status" CHECK("releases"."status" IN ('PLANNING','SCOPE_LOCKED','IN_UAT','READY_FOR_SIGNOFF','APPROVED','APPROVED_WITH_CONDITIONS','REJECTED','RELEASED','ROLLED_BACK','CANCELLED')),
	CONSTRAINT "ck_release_fields" CHECK(length(trim("releases"."name")) BETWEEN 1 AND 200 AND length("releases"."target_version")<=40 AND "releases"."version">0),
	CONSTRAINT "ck_release_scope_locked_consistency" CHECK("releases"."scope_locked_at" IS NULL OR "releases"."status" <> 'PLANNING'),
	CONSTRAINT "ck_release_released_consistency" CHECK("releases"."status" <> 'RELEASED' OR "releases"."released_at" IS NOT NULL)
);
--> statement-breakpoint
CREATE UNIQUE INDEX `uq_releases_business_id` ON `releases` (`business_id`);--> statement-breakpoint
CREATE INDEX `idx_releases_project_status` ON `releases` (`project_id`,`status`);--> statement-breakpoint
CREATE INDEX `idx_releases_planned_date` ON `releases` (`planned_date`);