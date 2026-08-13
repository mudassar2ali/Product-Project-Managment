CREATE TABLE `azure_project_links` (
	`id` text PRIMARY KEY NOT NULL,
	`project_id` text NOT NULL,
	`connection_id` text NOT NULL,
	`azure_project_id` text NOT NULL,
	`azure_project_name` text NOT NULL,
	`azure_team_id` text,
	`azure_team_name` text,
	`status` text DEFAULT 'ACTIVE' NOT NULL,
	`last_validated_at` text,
	`last_validation_status` text DEFAULT 'NOT_VALIDATED' NOT NULL,
	`record_status` text DEFAULT 'ACTIVE' NOT NULL,
	`version` integer DEFAULT 1 NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`created_by` text,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_by` text,
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`connection_id`) REFERENCES `azure_connections`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `uq_azure_project_links_internal_project` ON `azure_project_links` (`project_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `uq_azure_project_links_external_scope` ON `azure_project_links` (`connection_id`,`azure_project_id`,`azure_team_id`);--> statement-breakpoint
CREATE INDEX `idx_azure_project_links_connection` ON `azure_project_links` (`connection_id`,`record_status`);