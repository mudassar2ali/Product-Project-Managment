CREATE TABLE `azure_sprint_snapshots` (
	`id` text PRIMARY KEY NOT NULL,
	`link_id` text NOT NULL,
	`iteration_id` text NOT NULL,
	`iteration_name` text NOT NULL,
	`path` text NOT NULL,
	`start_date` text,
	`finish_date` text,
	`total_items` integer NOT NULL,
	`completed_items` integer NOT NULL,
	`active_items` integer NOT NULL,
	`progress` integer NOT NULL,
	`days_remaining` integer,
	`health` text NOT NULL,
	`source_revision` text NOT NULL,
	`calculated_at` text NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`created_by` text,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_by` text,
	FOREIGN KEY (`link_id`) REFERENCES `azure_project_links`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `uq_azure_sprint_snapshot_revision` ON `azure_sprint_snapshots` (`link_id`,`iteration_id`,`source_revision`);--> statement-breakpoint
CREATE INDEX `idx_azure_sprint_snapshots_link_time` ON `azure_sprint_snapshots` (`link_id`,`calculated_at`);