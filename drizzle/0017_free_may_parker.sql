CREATE TABLE `operational_events` (
	`id` text PRIMARY KEY NOT NULL,
	`operation` text NOT NULL,
	`outcome` text NOT NULL,
	`duration_ms` integer DEFAULT 0 NOT NULL,
	`status_code` integer NOT NULL,
	`entity_type` text,
	`entity_id` text,
	`actor_user_id` text,
	`correlation_id` text NOT NULL,
	`details_json` text DEFAULT '{}' NOT NULL,
	`occurred_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`actor_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE set null,
	CONSTRAINT "ck_operational_event_outcome" CHECK("operational_events"."outcome" IN ('SUCCESS','REJECTED','ERROR','RATE_LIMITED')),
	CONSTRAINT "ck_operational_event_values" CHECK("operational_events"."duration_ms">=0 AND "operational_events"."status_code" BETWEEN 100 AND 599)
);
--> statement-breakpoint
CREATE INDEX `idx_operational_events_operation_time` ON `operational_events` (`operation`,`occurred_at`);--> statement-breakpoint
CREATE INDEX `idx_operational_events_outcome_time` ON `operational_events` (`outcome`,`occurred_at`);--> statement-breakpoint
CREATE INDEX `idx_operational_events_correlation` ON `operational_events` (`correlation_id`);--> statement-breakpoint
CREATE INDEX `idx_operational_events_actor_time` ON `operational_events` (`actor_user_id`,`occurred_at`);--> statement-breakpoint
CREATE TABLE `operational_policies` (
	`key` text PRIMARY KEY NOT NULL,
	`category` text NOT NULL,
	`integer_value` integer,
	`text_value` text,
	`description` text NOT NULL,
	`enforced` integer DEFAULT true NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`created_by` text,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_by` text,
	CONSTRAINT "ck_operational_policy_value" CHECK("operational_policies"."integer_value" IS NOT NULL OR "operational_policies"."text_value" IS NOT NULL)
);
--> statement-breakpoint
CREATE INDEX `idx_operational_policies_category` ON `operational_policies` (`category`,`key`);--> statement-breakpoint
CREATE TABLE `operational_rate_limits` (
	`operation` text NOT NULL,
	`scope_key` text NOT NULL,
	`window_start` integer NOT NULL,
	`request_count` integer DEFAULT 1 NOT NULL,
	`limit_value` integer NOT NULL,
	`window_seconds` integer NOT NULL,
	`expires_at` text NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	PRIMARY KEY(`operation`, `scope_key`, `window_start`),
	CONSTRAINT "ck_operational_rate_limit_values" CHECK("operational_rate_limits"."request_count">0 AND "operational_rate_limits"."limit_value">0 AND "operational_rate_limits"."window_seconds">0 AND "operational_rate_limits"."request_count"<="operational_rate_limits"."limit_value")
);
--> statement-breakpoint
CREATE INDEX `idx_operational_rate_limits_expiry` ON `operational_rate_limits` (`expires_at`);--> statement-breakpoint
CREATE INDEX `idx_operational_rate_limits_operation_window` ON `operational_rate_limits` (`operation`,`window_start`);--> statement-breakpoint
INSERT INTO `operational_policies` (`key`,`category`,`integer_value`,`description`,`enforced`,`created_by`,`updated_by`) VALUES
  ('ADVANCED_SYNC_LIMIT','RATE_LIMIT',5,'Accepted advanced synchronization requests per caller and Azure Project link window.',1,'SYSTEM','SYSTEM'),
  ('ADVANCED_SYNC_WINDOW_SECONDS','RATE_LIMIT',300,'Advanced synchronization fixed-window duration in seconds.',1,'SYSTEM','SYSTEM'),
  ('REPORT_EXPORT_LIMIT','RATE_LIMIT',30,'Accepted report export requests per caller window.',1,'SYSTEM','SYSTEM'),
  ('REPORT_EXPORT_WINDOW_SECONDS','RATE_LIMIT',300,'Report export fixed-window duration in seconds.',1,'SYSTEM','SYSTEM'),
  ('AUDIT_RETENTION_DAYS','RETENTION',365,'Minimum hot retention for immutable governance audit evidence; automatic deletion is disabled.',1,'SYSTEM','SYSTEM'),
  ('TELEMETRY_RETENTION_DAYS','RETENTION',30,'Target retention for sanitized operational telemetry; purge automation requires archive approval.',0,'SYSTEM','SYSTEM');--> statement-breakpoint
CREATE TRIGGER `trg_audit_logs_immutable_update`
BEFORE UPDATE ON `audit_logs`
BEGIN
  SELECT RAISE(ABORT, 'AUDIT_IMMUTABLE');
END;--> statement-breakpoint
CREATE TRIGGER `trg_audit_logs_immutable_delete`
BEFORE DELETE ON `audit_logs`
BEGIN
  SELECT RAISE(ABORT, 'AUDIT_IMMUTABLE');
END;
