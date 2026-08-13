CREATE TABLE `products` (
	`id` text PRIMARY KEY NOT NULL,
	`business_id` text NOT NULL,
	`name` text NOT NULL,
	`code` text NOT NULL,
	`description` text DEFAULT '' NOT NULL,
	`product_manager_id` text,
	`product_development_manager_id` text,
	`business_owner_id` text,
	`category` text DEFAULT 'General' NOT NULL,
	`market` text DEFAULT '' NOT NULL,
	`region` text DEFAULT '' NOT NULL,
	`customer_segment` text DEFAULT '' NOT NULL,
	`stage` text DEFAULT 'Idea' NOT NULL,
	`start_date` text,
	`target_launch_date` text,
	`actual_launch_date` text,
	`status` text DEFAULT 'Active' NOT NULL,
	`priority` text DEFAULT 'Medium' NOT NULL,
	`strategic_objective` text DEFAULT '' NOT NULL,
	`business_value` text DEFAULT '' NOT NULL,
	`progress` integer DEFAULT 0 NOT NULL,
	`notes` text DEFAULT '' NOT NULL,
	`record_status` text DEFAULT 'ACTIVE' NOT NULL,
	`archived_at` text,
	`version` integer DEFAULT 1 NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`created_by` text,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_by` text,
	FOREIGN KEY (`product_manager_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`product_development_manager_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`business_owner_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE UNIQUE INDEX `uq_products_business_id` ON `products` (`business_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `uq_products_code` ON `products` (`code`);--> statement-breakpoint
CREATE INDEX `idx_products_status_stage` ON `products` (`status`,`stage`);--> statement-breakpoint
CREATE INDEX `idx_products_manager` ON `products` (`product_manager_id`);--> statement-breakpoint
CREATE INDEX `idx_products_target_launch` ON `products` (`target_launch_date`);--> statement-breakpoint
CREATE INDEX `idx_products_record_status` ON `products` (`record_status`);