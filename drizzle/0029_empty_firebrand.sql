CREATE TABLE `release_readiness_snapshots` (
	`id` text PRIMARY KEY NOT NULL,
	`release_id` text NOT NULL,
	`source_revision` text NOT NULL,
	`scope_item_count` integer NOT NULL,
	`scope_done_count` integer NOT NULL,
	`uat_test_case_count` integer NOT NULL,
	`uat_passed_count` integer NOT NULL,
	`uat_failed_count` integer NOT NULL,
	`uat_blocked_count` integer NOT NULL,
	`uat_not_executed_count` integer NOT NULL,
	`open_defect_count` integer NOT NULL,
	`critical_open_defect_count` integer NOT NULL,
	`signoff_status` text,
	`readiness` text NOT NULL,
	`formula` text NOT NULL,
	`calculated_at` text NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`created_by` text,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_by` text,
	FOREIGN KEY (`release_id`) REFERENCES `releases`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "ck_release_readiness_state" CHECK("release_readiness_snapshots"."readiness" IN ('READY','AT_RISK','BLOCKED','NOT_READY')),
	CONSTRAINT "ck_release_readiness_signoff_status" CHECK("release_readiness_snapshots"."signoff_status" IS NULL OR "release_readiness_snapshots"."signoff_status" IN ('PENDING','UNDER_REVIEW','APPROVED','APPROVED_WITH_CONDITIONS','REJECTED')),
	CONSTRAINT "ck_release_readiness_values" CHECK(
    "release_readiness_snapshots"."scope_item_count">=0 AND "release_readiness_snapshots"."scope_done_count">=0 AND "release_readiness_snapshots"."scope_done_count"<="release_readiness_snapshots"."scope_item_count"
    AND "release_readiness_snapshots"."uat_test_case_count">=0 AND "release_readiness_snapshots"."uat_passed_count">=0 AND "release_readiness_snapshots"."uat_failed_count">=0
    AND "release_readiness_snapshots"."uat_blocked_count">=0 AND "release_readiness_snapshots"."uat_not_executed_count">=0
    AND "release_readiness_snapshots"."open_defect_count">=0 AND "release_readiness_snapshots"."critical_open_defect_count">=0 AND "release_readiness_snapshots"."critical_open_defect_count"<="release_readiness_snapshots"."open_defect_count"
  )
);
--> statement-breakpoint
CREATE UNIQUE INDEX `uq_release_readiness_source_revision` ON `release_readiness_snapshots` (`release_id`,`source_revision`);--> statement-breakpoint
CREATE INDEX `idx_release_readiness_release_time` ON `release_readiness_snapshots` (`release_id`,`calculated_at`);