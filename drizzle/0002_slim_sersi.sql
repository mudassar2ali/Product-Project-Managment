CREATE TABLE `project_stage_weights` (
	`id` text PRIMARY KEY NOT NULL,
	`project_id` text NOT NULL,
	`stage` text NOT NULL,
	`weight` integer NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`created_by` text,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_by` text,
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `uq_project_stage_weight` ON `project_stage_weights` (`project_id`,`stage`);--> statement-breakpoint
CREATE INDEX `idx_project_stage_weights_project` ON `project_stage_weights` (`project_id`);--> statement-breakpoint
CREATE TABLE `projects` (
	`id` text PRIMARY KEY NOT NULL,
	`business_id` text NOT NULL,
	`name` text NOT NULL,
	`code` text NOT NULL,
	`product_id` text NOT NULL,
	`project_manager_id` text,
	`product_manager_id` text,
	`engineering_lead_id` text,
	`business_owner_id` text,
	`description` text DEFAULT '' NOT NULL,
	`objective` text DEFAULT '' NOT NULL,
	`business_value` text DEFAULT '' NOT NULL,
	`scope` text DEFAULT '' NOT NULL,
	`out_of_scope` text DEFAULT '' NOT NULL,
	`start_date` text,
	`target_end_date` text,
	`actual_end_date` text,
	`priority` text DEFAULT 'Medium' NOT NULL,
	`status` text DEFAULT 'Active' NOT NULL,
	`health` text DEFAULT 'On Track' NOT NULL,
	`overall_progress` integer DEFAULT 0 NOT NULL,
	`requirements_progress` integer DEFAULT 0 NOT NULL,
	`design_progress` integer DEFAULT 0 NOT NULL,
	`development_progress` integer DEFAULT 0 NOT NULL,
	`qa_progress` integer DEFAULT 0 NOT NULL,
	`uat_progress` integer DEFAULT 0 NOT NULL,
	`sign_off_progress` integer DEFAULT 0 NOT NULL,
	`deployment_progress` integer DEFAULT 0 NOT NULL,
	`sign_off_status` text DEFAULT 'Pending' NOT NULL,
	`release_status` text DEFAULT 'Not Planned' NOT NULL,
	`budget_amount` integer DEFAULT 0 NOT NULL,
	`budget_currency` text DEFAULT 'USD' NOT NULL,
	`market` text DEFAULT '' NOT NULL,
	`customer` text DEFAULT '' NOT NULL,
	`comments` text DEFAULT '' NOT NULL,
	`health_override_reason` text,
	`record_status` text DEFAULT 'ACTIVE' NOT NULL,
	`archived_at` text,
	`version` integer DEFAULT 1 NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`created_by` text,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_by` text,
	FOREIGN KEY (`product_id`) REFERENCES `products`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`project_manager_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`product_manager_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`engineering_lead_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`business_owner_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE UNIQUE INDEX `uq_projects_business_id` ON `projects` (`business_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `uq_projects_code` ON `projects` (`code`);--> statement-breakpoint
CREATE INDEX `idx_projects_product_status` ON `projects` (`product_id`,`status`);--> statement-breakpoint
CREATE INDEX `idx_projects_health_status` ON `projects` (`health`,`status`);--> statement-breakpoint
CREATE INDEX `idx_projects_target_end` ON `projects` (`target_end_date`);--> statement-breakpoint
CREATE INDEX `idx_projects_project_manager` ON `projects` (`project_manager_id`);--> statement-breakpoint
CREATE INDEX `idx_projects_record_status` ON `projects` (`record_status`);