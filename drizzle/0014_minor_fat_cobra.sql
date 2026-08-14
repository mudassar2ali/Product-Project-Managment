CREATE TABLE `sprint_baselines` (
	`id` text PRIMARY KEY NOT NULL,
	`sprint_id` text NOT NULL,
	`item_count` integer NOT NULL,
	`committed_points` integer NOT NULL,
	`committed_hours` integer NOT NULL,
	`membership_snapshot_json` text NOT NULL,
	`activated_at` text NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`created_by` text,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_by` text,
	FOREIGN KEY (`sprint_id`) REFERENCES `sprints`(`id`) ON UPDATE no action ON DELETE restrict,
	CONSTRAINT "ck_sprint_baseline_values" CHECK("sprint_baselines"."item_count">0 AND "sprint_baselines"."committed_points">=0 AND "sprint_baselines"."committed_hours">=0)
);
--> statement-breakpoint
CREATE UNIQUE INDEX `uq_sprint_baseline_sprint` ON `sprint_baselines` (`sprint_id`);--> statement-breakpoint
CREATE TABLE `sprint_completion_dispositions` (
	`id` text PRIMARY KEY NOT NULL,
	`sprint_id` text NOT NULL,
	`membership_id` text NOT NULL,
	`disposition` text NOT NULL,
	`target_sprint_id` text,
	`target_membership_id` text,
	`reason` text DEFAULT '' NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`created_by` text,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_by` text,
	FOREIGN KEY (`sprint_id`) REFERENCES `sprints`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`membership_id`) REFERENCES `sprint_memberships`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`target_sprint_id`) REFERENCES `sprints`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`target_membership_id`) REFERENCES `sprint_memberships`(`id`) ON UPDATE no action ON DELETE restrict,
	CONSTRAINT "ck_sprint_completion_disposition" CHECK("sprint_completion_dispositions"."disposition" IN ('COMPLETED','CARRYOVER','BACKLOG','REMOVED')),
	CONSTRAINT "ck_sprint_completion_target" CHECK(("sprint_completion_dispositions"."disposition"='CARRYOVER' AND "sprint_completion_dispositions"."target_sprint_id" IS NOT NULL) OR ("sprint_completion_dispositions"."disposition"<>'CARRYOVER' AND "sprint_completion_dispositions"."target_sprint_id" IS NULL))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `uq_sprint_completion_membership` ON `sprint_completion_dispositions` (`sprint_id`,`membership_id`);--> statement-breakpoint
CREATE INDEX `idx_sprint_completion_target` ON `sprint_completion_dispositions` (`target_sprint_id`,`disposition`);--> statement-breakpoint
CREATE UNIQUE INDEX `uq_sprints_one_active_local` ON `sprints` (`project_id`) WHERE "sprints"."status"='ACTIVE' AND "sprints"."origin"='LOCAL' AND "sprints"."record_status"='ACTIVE';