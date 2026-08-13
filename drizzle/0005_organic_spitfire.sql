CREATE TABLE `azure_delivery_snapshots` (
	`id` text PRIMARY KEY NOT NULL,
	`link_id` text NOT NULL,
	`sync_run_id` text NOT NULL,
	`source_revision` text NOT NULL,
	`total_items` integer NOT NULL,
	`completed_items` integer NOT NULL,
	`active_items` integer NOT NULL,
	`other_items` integer NOT NULL,
	`progress` integer NOT NULL,
	`calculated_at` text NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`created_by` text,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_by` text,
	FOREIGN KEY (`link_id`) REFERENCES `azure_project_links`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`sync_run_id`) REFERENCES `azure_sync_runs`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `uq_azure_delivery_snapshots_revision` ON `azure_delivery_snapshots` (`link_id`,`source_revision`);--> statement-breakpoint
CREATE INDEX `idx_azure_delivery_snapshots_link_time` ON `azure_delivery_snapshots` (`link_id`,`calculated_at`);--> statement-breakpoint
CREATE TABLE `azure_sync_runs` (
	`id` text PRIMARY KEY NOT NULL,
	`link_id` text NOT NULL,
	`status` text NOT NULL,
	`trigger` text DEFAULT 'MANUAL' NOT NULL,
	`started_at` text NOT NULL,
	`completed_at` text,
	`items_seen` integer DEFAULT 0 NOT NULL,
	`items_completed` integer DEFAULT 0 NOT NULL,
	`progress` integer,
	`error_code` text,
	`error_message` text,
	`correlation_id` text NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`created_by` text,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_by` text,
	FOREIGN KEY (`link_id`) REFERENCES `azure_project_links`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `idx_azure_sync_runs_link_time` ON `azure_sync_runs` (`link_id`,`started_at`);--> statement-breakpoint
CREATE INDEX `idx_azure_sync_runs_status` ON `azure_sync_runs` (`status`,`started_at`);