CREATE TABLE `azure_connections` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`organization` text NOT NULL,
	`organization_url` text NOT NULL,
	`auth_type` text DEFAULT 'ENTRA_APPLICATION' NOT NULL,
	`credential_binding` text NOT NULL,
	`status` text DEFAULT 'NOT_TESTED' NOT NULL,
	`sync_frequency` text DEFAULT 'HOURLY' NOT NULL,
	`last_tested_at` text,
	`last_successful_at` text,
	`last_error_code` text,
	`last_error_message` text,
	`enabled` integer DEFAULT true NOT NULL,
	`record_status` text DEFAULT 'ACTIVE' NOT NULL,
	`version` integer DEFAULT 1 NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`created_by` text,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_by` text
);
--> statement-breakpoint
CREATE UNIQUE INDEX `uq_azure_connections_organization` ON `azure_connections` (`organization`);--> statement-breakpoint
CREATE INDEX `idx_azure_connections_status` ON `azure_connections` (`status`,`enabled`);--> statement-breakpoint
CREATE INDEX `idx_azure_connections_record_status` ON `azure_connections` (`record_status`);