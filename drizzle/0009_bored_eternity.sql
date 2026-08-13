CREATE TABLE `ideas` (
	`id` text PRIMARY KEY NOT NULL,
	`business_id` text NOT NULL,
	`title` text NOT NULL,
	`summary` text DEFAULT '' NOT NULL,
	`problem` text DEFAULT '' NOT NULL,
	`proposed_value` text DEFAULT '' NOT NULL,
	`submitter` text DEFAULT '' NOT NULL,
	`category` text DEFAULT 'Product' NOT NULL,
	`status` text DEFAULT 'Submitted' NOT NULL,
	`value_score` integer DEFAULT 3 NOT NULL,
	`effort_score` integer DEFAULT 3 NOT NULL,
	`strategic_score` integer DEFAULT 3 NOT NULL,
	`review_notes` text DEFAULT '' NOT NULL,
	`converted_entity_type` text,
	`converted_entity_id` text,
	`converted_at` text,
	`record_status` text DEFAULT 'ACTIVE' NOT NULL,
	`version` integer DEFAULT 1 NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`created_by` text,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_by` text
);
--> statement-breakpoint
CREATE UNIQUE INDEX `uq_ideas_business_id` ON `ideas` (`business_id`);--> statement-breakpoint
CREATE INDEX `idx_ideas_status_score` ON `ideas` (`status`,`value_score`,`strategic_score`);--> statement-breakpoint
CREATE INDEX `idx_ideas_record_status` ON `ideas` (`record_status`);