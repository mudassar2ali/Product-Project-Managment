CREATE TABLE `daily_burndown_snapshots` (
	`id` text PRIMARY KEY NOT NULL,
	`sprint_id` text NOT NULL,
	`metric_snapshot_id` text NOT NULL,
	`snapshot_date` text NOT NULL,
	`planned_scope` integer NOT NULL,
	`remaining_scope` integer NOT NULL,
	`completed_scope` integer NOT NULL,
	`ideal_remaining_scope` integer NOT NULL,
	`scope_change` integer DEFAULT 0 NOT NULL,
	`source_origin` text NOT NULL,
	`source_revision` text NOT NULL,
	`calculated_at` text NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`created_by` text,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_by` text,
	FOREIGN KEY (`sprint_id`) REFERENCES `sprints`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`metric_snapshot_id`) REFERENCES `sprint_metric_snapshots`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "ck_daily_burndown_source" CHECK("daily_burndown_snapshots"."source_origin" IN ('LOCAL','AZURE_DEVOPS')),
	CONSTRAINT "ck_daily_burndown_values" CHECK("daily_burndown_snapshots"."planned_scope">=0 AND "daily_burndown_snapshots"."remaining_scope">=0 AND "daily_burndown_snapshots"."completed_scope">=0 AND "daily_burndown_snapshots"."ideal_remaining_scope">=0)
);
--> statement-breakpoint
CREATE UNIQUE INDEX `uq_daily_burndown_source_revision` ON `daily_burndown_snapshots` (`sprint_id`,`snapshot_date`,`source_revision`);--> statement-breakpoint
CREATE INDEX `idx_daily_burndown_sprint_date` ON `daily_burndown_snapshots` (`sprint_id`,`snapshot_date`);--> statement-breakpoint
CREATE TABLE `delivery_metric_policies` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`health_tolerance_percentage` integer DEFAULT 15 NOT NULL,
	`blocker_threshold` integer DEFAULT 3 NOT NULL,
	`zero_progress_days` integer DEFAULT 2 NOT NULL,
	`velocity_lookback` integer DEFAULT 6 NOT NULL,
	`active` integer DEFAULT true NOT NULL,
	`version` integer DEFAULT 1 NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`created_by` text,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_by` text,
	CONSTRAINT "ck_delivery_metric_policy_values" CHECK("delivery_metric_policies"."health_tolerance_percentage" BETWEEN 0 AND 100 AND "delivery_metric_policies"."blocker_threshold">0 AND "delivery_metric_policies"."zero_progress_days">=0 AND "delivery_metric_policies"."velocity_lookback" BETWEEN 1 AND 24)
);
--> statement-breakpoint
CREATE UNIQUE INDEX `uq_delivery_metric_policy_active` ON `delivery_metric_policies` (`active`) WHERE "delivery_metric_policies"."active"=1;--> statement-breakpoint
INSERT INTO `delivery_metric_policies` (`id`,`name`,`health_tolerance_percentage`,`blocker_threshold`,`zero_progress_days`,`velocity_lookback`,`active`,`created_by`,`updated_by`) VALUES ('DEFAULT','Default Stage 2 delivery health policy',15,3,2,6,1,'SYSTEM','SYSTEM');--> statement-breakpoint
CREATE TABLE `sprint_metric_snapshots` (
	`id` text PRIMARY KEY NOT NULL,
	`sprint_id` text NOT NULL,
	`link_id` text,
	`sync_run_id` text,
	`policy_id` text NOT NULL,
	`source_origin` text NOT NULL,
	`source_revision` text NOT NULL,
	`planned_points` integer NOT NULL,
	`completed_points` integer NOT NULL,
	`planned_items` integer NOT NULL,
	`completed_items` integer NOT NULL,
	`remaining_work` integer NOT NULL,
	`bug_count` integer NOT NULL,
	`open_bug_count` integer NOT NULL,
	`blocker_count` integer NOT NULL,
	`carryover_count` integer NOT NULL,
	`carryover_points` integer NOT NULL,
	`elapsed_days` integer NOT NULL,
	`total_days` integer NOT NULL,
	`progress` integer NOT NULL,
	`expected_progress` integer NOT NULL,
	`health` text NOT NULL,
	`completion_method` text NOT NULL,
	`numerator` integer,
	`denominator` integer,
	`formula` text NOT NULL,
	`health_tolerance_percentage` integer NOT NULL,
	`blocker_threshold` integer NOT NULL,
	`zero_progress_days` integer NOT NULL,
	`velocity_lookback` integer NOT NULL,
	`calculated_at` text NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`created_by` text,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_by` text,
	FOREIGN KEY (`sprint_id`) REFERENCES `sprints`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`link_id`) REFERENCES `azure_project_links`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`sync_run_id`) REFERENCES `azure_sync_runs`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`policy_id`) REFERENCES `delivery_metric_policies`(`id`) ON UPDATE no action ON DELETE restrict,
	CONSTRAINT "ck_sprint_metric_source" CHECK("sprint_metric_snapshots"."source_origin" IN ('LOCAL','AZURE_DEVOPS')),
	CONSTRAINT "ck_sprint_metric_health" CHECK("sprint_metric_snapshots"."health" IN ('ON_TRACK','AT_RISK','BLOCKED','COMPLETED')),
	CONSTRAINT "ck_sprint_metric_method" CHECK("sprint_metric_snapshots"."completion_method" IN ('POINTS','ITEM_COUNT','NOT_AVAILABLE')),
	CONSTRAINT "ck_sprint_metric_values" CHECK("sprint_metric_snapshots"."planned_points">=0 AND "sprint_metric_snapshots"."completed_points">=0 AND "sprint_metric_snapshots"."planned_items">=0 AND "sprint_metric_snapshots"."completed_items">=0 AND "sprint_metric_snapshots"."remaining_work">=0 AND "sprint_metric_snapshots"."bug_count">=0 AND "sprint_metric_snapshots"."open_bug_count">=0 AND "sprint_metric_snapshots"."blocker_count">=0 AND "sprint_metric_snapshots"."carryover_count">=0 AND "sprint_metric_snapshots"."carryover_points">=0 AND "sprint_metric_snapshots"."elapsed_days">=0 AND "sprint_metric_snapshots"."total_days">0 AND "sprint_metric_snapshots"."progress" BETWEEN 0 AND 100 AND "sprint_metric_snapshots"."expected_progress" BETWEEN 0 AND 100)
);
--> statement-breakpoint
CREATE UNIQUE INDEX `uq_sprint_metric_source_revision` ON `sprint_metric_snapshots` (`sprint_id`,`source_revision`);--> statement-breakpoint
CREATE INDEX `idx_sprint_metric_sprint_time` ON `sprint_metric_snapshots` (`sprint_id`,`calculated_at`);--> statement-breakpoint
CREATE INDEX `idx_sprint_metric_link_time` ON `sprint_metric_snapshots` (`link_id`,`calculated_at`);--> statement-breakpoint
ALTER TABLE `azure_sync_runs` ADD `iterations_seen` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `azure_sync_runs` ADD `sprints_inserted` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `azure_sync_runs` ADD `sprints_updated` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `azure_sync_runs` ADD `sprints_skipped` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `azure_sync_runs` ADD `metric_snapshots_inserted` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `azure_sync_runs` ADD `burndown_snapshots_inserted` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `sprints` ADD `source_revision` text;--> statement-breakpoint
ALTER TABLE `sprints` ADD `synced_at` text;
