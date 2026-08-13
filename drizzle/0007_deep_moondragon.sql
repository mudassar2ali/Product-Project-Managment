CREATE TABLE `milestones` (
	`id` text PRIMARY KEY NOT NULL,
	`business_id` text NOT NULL,
	`project_id` text NOT NULL,
	`name` text NOT NULL,
	`description` text DEFAULT '' NOT NULL,
	`type` text DEFAULT 'Delivery' NOT NULL,
	`planned_date` text NOT NULL,
	`actual_date` text,
	`status` text DEFAULT 'Planned' NOT NULL,
	`owner` text DEFAULT '' NOT NULL,
	`notes` text DEFAULT '' NOT NULL,
	`record_status` text DEFAULT 'ACTIVE' NOT NULL,
	`archived_at` text,
	`version` integer DEFAULT 1 NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`created_by` text,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_by` text,
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `uq_milestones_business_id` ON `milestones` (`business_id`);--> statement-breakpoint
CREATE INDEX `idx_milestones_project_date` ON `milestones` (`project_id`,`planned_date`);--> statement-breakpoint
CREATE INDEX `idx_milestones_status_date` ON `milestones` (`status`,`planned_date`);--> statement-breakpoint
CREATE INDEX `idx_milestones_record_status` ON `milestones` (`record_status`);