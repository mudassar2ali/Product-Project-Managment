CREATE TABLE `deployment_records` (
	`id` text PRIMARY KEY NOT NULL,
	`release_id` text NOT NULL,
	`environment_id` text NOT NULL,
	`status` text DEFAULT 'PLANNED' NOT NULL,
	`deployed_by_user_id` text,
	`started_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`completed_at` text,
	`deployment_reference` text DEFAULT '' NOT NULL,
	`rollback_of_id` text,
	`notes` text DEFAULT '' NOT NULL,
	`version` integer DEFAULT 1 NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`created_by` text,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_by` text,
	FOREIGN KEY (`release_id`) REFERENCES `releases`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`environment_id`) REFERENCES `release_environments`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`deployed_by_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`rollback_of_id`) REFERENCES `deployment_records`(`id`) ON UPDATE no action ON DELETE restrict,
	CONSTRAINT "ck_deployment_status" CHECK("deployment_records"."status" IN ('PLANNED','IN_PROGRESS','SUCCEEDED','FAILED','ROLLED_BACK')),
	CONSTRAINT "ck_deployment_completion" CHECK(
    ("deployment_records"."status" IN ('SUCCEEDED','FAILED','ROLLED_BACK') AND "deployment_records"."completed_at" IS NOT NULL)
    OR ("deployment_records"."status" IN ('PLANNED','IN_PROGRESS') AND "deployment_records"."completed_at" IS NULL)
  ),
	CONSTRAINT "ck_deployment_rollback" CHECK(
    ("deployment_records"."status"='ROLLED_BACK' AND "deployment_records"."rollback_of_id" IS NOT NULL)
    OR ("deployment_records"."status"<>'ROLLED_BACK' AND "deployment_records"."rollback_of_id" IS NULL)
  ),
	CONSTRAINT "ck_deployment_rollback_not_self" CHECK("deployment_records"."rollback_of_id" IS NULL OR "deployment_records"."rollback_of_id"<>"deployment_records"."id"),
	CONSTRAINT "ck_deployment_fields" CHECK(length("deployment_records"."deployment_reference")<=500 AND length("deployment_records"."notes")<=2000 AND "deployment_records"."version">0)
);
--> statement-breakpoint
CREATE INDEX `idx_deployment_records_release_status` ON `deployment_records` (`release_id`,`status`);--> statement-breakpoint
CREATE INDEX `idx_deployment_records_environment` ON `deployment_records` (`environment_id`,`status`);--> statement-breakpoint
CREATE TABLE `release_environments` (
	`id` text PRIMARY KEY NOT NULL,
	`project_id` text NOT NULL,
	`code` text NOT NULL,
	`name` text NOT NULL,
	`tier` text DEFAULT 'NON_PROD' NOT NULL,
	`active` integer DEFAULT true NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`created_by` text,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_by` text,
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "ck_release_environment_tier" CHECK("release_environments"."tier" IN ('NON_PROD','PROD')),
	CONSTRAINT "ck_release_environment_fields" CHECK(length(trim("release_environments"."code")) BETWEEN 1 AND 40 AND length(trim("release_environments"."name")) BETWEEN 1 AND 120)
);
--> statement-breakpoint
CREATE UNIQUE INDEX `uq_release_environments_project_code` ON `release_environments` (`project_id`,`code`);--> statement-breakpoint
CREATE INDEX `idx_release_environments_project_active` ON `release_environments` (`project_id`,`active`);