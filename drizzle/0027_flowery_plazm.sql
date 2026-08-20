CREATE TABLE `uat_campaigns` (
	`id` text PRIMARY KEY NOT NULL,
	`business_id` text NOT NULL,
	`release_id` text NOT NULL,
	`name` text NOT NULL,
	`status` text DEFAULT 'DRAFT' NOT NULL,
	`entry_criteria` text DEFAULT '' NOT NULL,
	`exit_criteria` text DEFAULT '' NOT NULL,
	`planned_start_date` text,
	`planned_end_date` text,
	`started_at` text,
	`completed_at` text,
	`owner_user_id` text,
	`record_status` text DEFAULT 'ACTIVE' NOT NULL,
	`version` integer DEFAULT 1 NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`created_by` text,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_by` text,
	FOREIGN KEY (`release_id`) REFERENCES `releases`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`owner_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE set null,
	CONSTRAINT "ck_uat_campaign_status" CHECK("uat_campaigns"."status" IN ('DRAFT','PLANNED','IN_PROGRESS','COMPLETED','CANCELLED')),
	CONSTRAINT "ck_uat_campaign_fields" CHECK(length(trim("uat_campaigns"."name")) BETWEEN 1 AND 200 AND length("uat_campaigns"."entry_criteria")<=4000 AND length("uat_campaigns"."exit_criteria")<=4000 AND "uat_campaigns"."version">0),
	CONSTRAINT "ck_uat_campaign_started_consistency" CHECK(
    ("uat_campaigns"."status" IN ('IN_PROGRESS','COMPLETED') AND "uat_campaigns"."started_at" IS NOT NULL)
    OR ("uat_campaigns"."status" IN ('DRAFT','PLANNED','CANCELLED') AND "uat_campaigns"."started_at" IS NULL)
  ),
	CONSTRAINT "ck_uat_campaign_completed_consistency" CHECK(
    ("uat_campaigns"."status" IN ('COMPLETED','CANCELLED') AND "uat_campaigns"."completed_at" IS NOT NULL)
    OR ("uat_campaigns"."status" IN ('DRAFT','PLANNED','IN_PROGRESS') AND "uat_campaigns"."completed_at" IS NULL)
  )
);
--> statement-breakpoint
CREATE UNIQUE INDEX `uq_uat_campaigns_business_id` ON `uat_campaigns` (`business_id`);--> statement-breakpoint
CREATE INDEX `idx_uat_campaigns_release_status` ON `uat_campaigns` (`release_id`,`status`);--> statement-breakpoint
CREATE TABLE `uat_test_cases` (
	`id` text PRIMARY KEY NOT NULL,
	`business_id` text NOT NULL,
	`campaign_id` text NOT NULL,
	`requirement_id` text,
	`backlog_item_id` text,
	`title` text NOT NULL,
	`preconditions` text DEFAULT '' NOT NULL,
	`steps` text NOT NULL,
	`expected_result` text NOT NULL,
	`priority` text DEFAULT 'MEDIUM' NOT NULL,
	`status` text DEFAULT 'DRAFT' NOT NULL,
	`version` integer DEFAULT 1 NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`created_by` text,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_by` text,
	FOREIGN KEY (`campaign_id`) REFERENCES `uat_campaigns`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`requirement_id`) REFERENCES `requirements`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`backlog_item_id`) REFERENCES `backlog_items`(`id`) ON UPDATE no action ON DELETE set null,
	CONSTRAINT "ck_uat_test_case_priority" CHECK("uat_test_cases"."priority" IN ('LOW','MEDIUM','HIGH','CRITICAL')),
	CONSTRAINT "ck_uat_test_case_status" CHECK("uat_test_cases"."status" IN ('DRAFT','READY','RETIRED')),
	CONSTRAINT "ck_uat_test_case_fields" CHECK(
    length(trim("uat_test_cases"."title")) BETWEEN 1 AND 200
    AND length(trim("uat_test_cases"."steps")) BETWEEN 1 AND 8000
    AND length(trim("uat_test_cases"."expected_result")) BETWEEN 1 AND 4000
    AND length("uat_test_cases"."preconditions")<=2000
    AND "uat_test_cases"."version">0
  )
);
--> statement-breakpoint
CREATE UNIQUE INDEX `uq_uat_test_cases_business_id` ON `uat_test_cases` (`business_id`);--> statement-breakpoint
CREATE INDEX `idx_uat_test_cases_campaign_status` ON `uat_test_cases` (`campaign_id`,`status`);--> statement-breakpoint
CREATE INDEX `idx_uat_test_cases_requirement` ON `uat_test_cases` (`requirement_id`);