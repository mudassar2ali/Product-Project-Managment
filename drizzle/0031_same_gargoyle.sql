CREATE TABLE `requirement_uat_links` (
	`id` text PRIMARY KEY NOT NULL,
	`requirement_id` text NOT NULL,
	`uat_test_case_id` text NOT NULL,
	`link_type` text DEFAULT 'VALIDATES' NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`created_by` text,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_by` text,
	FOREIGN KEY (`requirement_id`) REFERENCES `requirements`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`uat_test_case_id`) REFERENCES `uat_test_cases`(`id`) ON UPDATE no action ON DELETE restrict,
	CONSTRAINT "ck_requirement_uat_link_type" CHECK("requirement_uat_links"."link_type" IN ('VALIDATES'))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `uq_requirement_uat_links_edge` ON `requirement_uat_links` (`requirement_id`,`uat_test_case_id`,`link_type`);--> statement-breakpoint
CREATE INDEX `idx_requirement_uat_links_requirement` ON `requirement_uat_links` (`requirement_id`);--> statement-breakpoint
CREATE INDEX `idx_requirement_uat_links_test_case` ON `requirement_uat_links` (`uat_test_case_id`);