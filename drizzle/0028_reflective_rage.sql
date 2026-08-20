CREATE TABLE `defects` (
	`id` text PRIMARY KEY NOT NULL,
	`business_id` text NOT NULL,
	`project_id` text NOT NULL,
	`release_id` text,
	`source` text DEFAULT 'UAT' NOT NULL,
	`severity` text DEFAULT 'MEDIUM' NOT NULL,
	`status` text DEFAULT 'OPEN' NOT NULL,
	`title` text NOT NULL,
	`description` text DEFAULT '' NOT NULL,
	`steps_to_reproduce` text DEFAULT '' NOT NULL,
	`reported_by_user_id` text,
	`assigned_to_user_id` text,
	`backlog_item_id` text,
	`duplicate_of_id` text,
	`reported_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`resolved_at` text,
	`closed_at` text,
	`version` integer DEFAULT 1 NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`created_by` text,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_by` text,
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`release_id`) REFERENCES `releases`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`reported_by_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`assigned_to_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`backlog_item_id`) REFERENCES `backlog_items`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`duplicate_of_id`) REFERENCES `defects`(`id`) ON UPDATE no action ON DELETE restrict,
	CONSTRAINT "ck_defect_source" CHECK("defects"."source" IN ('UAT','QA','PRODUCTION','INTERNAL')),
	CONSTRAINT "ck_defect_severity" CHECK("defects"."severity" IN ('CRITICAL','HIGH','MEDIUM','LOW')),
	CONSTRAINT "ck_defect_status" CHECK("defects"."status" IN ('OPEN','IN_PROGRESS','FIXED','VERIFIED','CLOSED','DEFERRED','DUPLICATE')),
	CONSTRAINT "ck_defect_fields" CHECK(length(trim("defects"."title")) BETWEEN 1 AND 200 AND length("defects"."description")<=4000 AND length("defects"."steps_to_reproduce")<=4000 AND "defects"."version">0),
	CONSTRAINT "ck_defect_resolution_consistency" CHECK(
    ("defects"."status" IN ('FIXED','VERIFIED','CLOSED') AND "defects"."resolved_at" IS NOT NULL)
    OR ("defects"."status" NOT IN ('FIXED','VERIFIED','CLOSED') AND "defects"."resolved_at" IS NULL)
  ),
	CONSTRAINT "ck_defect_closure_consistency" CHECK(
    ("defects"."status" IN ('CLOSED','DUPLICATE','DEFERRED') AND "defects"."closed_at" IS NOT NULL)
    OR ("defects"."status" NOT IN ('CLOSED','DUPLICATE','DEFERRED') AND "defects"."closed_at" IS NULL)
  ),
	CONSTRAINT "ck_defect_duplicate_consistency" CHECK(
    ("defects"."status"='DUPLICATE' AND "defects"."duplicate_of_id" IS NOT NULL)
    OR ("defects"."status"<>'DUPLICATE' AND "defects"."duplicate_of_id" IS NULL)
  )
);
--> statement-breakpoint
CREATE UNIQUE INDEX `uq_defects_business_id` ON `defects` (`business_id`);--> statement-breakpoint
CREATE INDEX `idx_defects_project_status_severity` ON `defects` (`project_id`,`status`,`severity`);--> statement-breakpoint
CREATE INDEX `idx_defects_assignee` ON `defects` (`assigned_to_user_id`);--> statement-breakpoint
CREATE INDEX `idx_defects_release` ON `defects` (`release_id`);--> statement-breakpoint
CREATE TABLE `uat_test_executions` (
	`id` text PRIMARY KEY NOT NULL,
	`test_case_id` text NOT NULL,
	`execution_number` integer NOT NULL,
	`result` text NOT NULL,
	`executed_by_user_id` text,
	`executed_at` text,
	`actual_result` text DEFAULT '' NOT NULL,
	`evidence_reference` text DEFAULT '' NOT NULL,
	`defect_id` text,
	`version` integer DEFAULT 1 NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`created_by` text,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_by` text,
	FOREIGN KEY (`test_case_id`) REFERENCES `uat_test_cases`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`executed_by_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`defect_id`) REFERENCES `defects`(`id`) ON UPDATE no action ON DELETE set null,
	CONSTRAINT "ck_uat_execution_result" CHECK("uat_test_executions"."result" IN ('PASS','FAIL','BLOCKED','NOT_EXECUTED')),
	CONSTRAINT "ck_uat_execution_number" CHECK("uat_test_executions"."execution_number">0),
	CONSTRAINT "ck_uat_execution_evidence_consistency" CHECK(
    ("uat_test_executions"."result"<>'NOT_EXECUTED' AND "uat_test_executions"."executed_at" IS NOT NULL AND "uat_test_executions"."executed_by_user_id" IS NOT NULL)
    OR ("uat_test_executions"."result"='NOT_EXECUTED' AND "uat_test_executions"."executed_at" IS NULL AND "uat_test_executions"."executed_by_user_id" IS NULL)
  ),
	CONSTRAINT "ck_uat_execution_fields" CHECK(length("uat_test_executions"."actual_result")<=4000 AND length("uat_test_executions"."evidence_reference")<=500 AND "uat_test_executions"."version">0)
);
--> statement-breakpoint
CREATE UNIQUE INDEX `uq_uat_test_executions_case_number` ON `uat_test_executions` (`test_case_id`,`execution_number`);--> statement-breakpoint
CREATE INDEX `idx_uat_test_executions_test_case` ON `uat_test_executions` (`test_case_id`);--> statement-breakpoint
CREATE INDEX `idx_uat_test_executions_defect` ON `uat_test_executions` (`defect_id`);