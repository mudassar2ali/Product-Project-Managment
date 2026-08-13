CREATE TABLE `raid_items` (
	`id` text PRIMARY KEY NOT NULL,
	`business_id` text NOT NULL,
	`project_id` text NOT NULL,
	`type` text NOT NULL,
	`title` text NOT NULL,
	`description` text DEFAULT '' NOT NULL,
	`owner` text DEFAULT '' NOT NULL,
	`probability` text DEFAULT 'Medium' NOT NULL,
	`impact` text DEFAULT 'Medium' NOT NULL,
	`status` text DEFAULT 'Open' NOT NULL,
	`due_date` text,
	`response_plan` text DEFAULT '' NOT NULL,
	`escalated` integer DEFAULT false NOT NULL,
	`escalated_at` text,
	`record_status` text DEFAULT 'ACTIVE' NOT NULL,
	`version` integer DEFAULT 1 NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`created_by` text,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_by` text,
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `uq_raid_items_business_id` ON `raid_items` (`business_id`);--> statement-breakpoint
CREATE INDEX `idx_raid_project_status` ON `raid_items` (`project_id`,`status`);--> statement-breakpoint
CREATE INDEX `idx_raid_attention` ON `raid_items` (`escalated`,`impact`,`status`);--> statement-breakpoint
CREATE INDEX `idx_raid_due_date` ON `raid_items` (`due_date`);