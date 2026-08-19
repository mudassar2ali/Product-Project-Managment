CREATE TABLE `signoff_conditions` (
	`id` text PRIMARY KEY NOT NULL,
	`decision_id` text NOT NULL,
	`description` text NOT NULL,
	`owner_user_id` text,
	`due_at` text,
	`status` text DEFAULT 'OPEN' NOT NULL,
	`closure_evidence` text DEFAULT '' NOT NULL,
	`closed_by` text,
	`closed_at` text,
	`version` integer DEFAULT 1 NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`created_by` text,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_by` text,
	FOREIGN KEY (`decision_id`) REFERENCES `signoff_decisions`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`owner_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE restrict,
	CONSTRAINT "ck_signoff_condition_status" CHECK("signoff_conditions"."status" IN ('OPEN','IN_PROGRESS','SATISFIED','WAIVED')),
	CONSTRAINT "ck_signoff_condition_fields" CHECK(length(trim("signoff_conditions"."description")) BETWEEN 1 AND 2000 AND length("signoff_conditions"."closure_evidence")<=2000 AND "signoff_conditions"."version">0),
	CONSTRAINT "ck_signoff_condition_closure" CHECK(
    ("signoff_conditions"."status" IN ('OPEN','IN_PROGRESS') AND "signoff_conditions"."closed_by" IS NULL AND "signoff_conditions"."closed_at" IS NULL)
    OR ("signoff_conditions"."status" IN ('SATISFIED','WAIVED') AND "signoff_conditions"."closed_by" IS NOT NULL AND "signoff_conditions"."closed_at" IS NOT NULL AND length(trim("signoff_conditions"."closure_evidence"))>0)
  )
);
--> statement-breakpoint
CREATE INDEX `idx_signoff_conditions_decision` ON `signoff_conditions` (`decision_id`,`status`);--> statement-breakpoint
CREATE INDEX `idx_signoff_conditions_owner_status` ON `signoff_conditions` (`owner_user_id`,`status`);--> statement-breakpoint
CREATE INDEX `idx_signoff_conditions_due` ON `signoff_conditions` (`due_at`);--> statement-breakpoint
CREATE TABLE `signoff_decisions` (
	`id` text PRIMARY KEY NOT NULL,
	`signoff_lane_id` text NOT NULL,
	`decision` text NOT NULL,
	`approver_user_id` text NOT NULL,
	`comment` text DEFAULT '' NOT NULL,
	`decided_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`supersedes_decision_id` text,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`created_by` text,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_by` text,
	FOREIGN KEY (`signoff_lane_id`) REFERENCES `signoff_lanes`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`approver_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`supersedes_decision_id`) REFERENCES `signoff_decisions`(`id`) ON UPDATE no action ON DELETE restrict,
	CONSTRAINT "ck_signoff_decision_value" CHECK("signoff_decisions"."decision" IN ('APPROVED','APPROVED_WITH_CONDITIONS','REJECTED')),
	CONSTRAINT "ck_signoff_decision_comment" CHECK(length("signoff_decisions"."comment")<=4000),
	CONSTRAINT "ck_signoff_decision_not_self" CHECK("signoff_decisions"."supersedes_decision_id" IS NULL OR "signoff_decisions"."supersedes_decision_id"<>"signoff_decisions"."id")
);
--> statement-breakpoint
CREATE INDEX `idx_signoff_decisions_lane` ON `signoff_decisions` (`signoff_lane_id`,`decided_at`);--> statement-breakpoint
CREATE INDEX `idx_signoff_decisions_approver` ON `signoff_decisions` (`approver_user_id`);--> statement-breakpoint
CREATE TABLE `signoff_lanes` (
	`id` text PRIMARY KEY NOT NULL,
	`signoff_request_id` text NOT NULL,
	`lane_type` text NOT NULL,
	`required` integer DEFAULT true NOT NULL,
	`sequence` integer DEFAULT 1 NOT NULL,
	`assigned_approver_user_id` text,
	`status` text DEFAULT 'PENDING' NOT NULL,
	`due_at` text,
	`version` integer DEFAULT 1 NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`created_by` text,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_by` text,
	FOREIGN KEY (`signoff_request_id`) REFERENCES `signoff_requests`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`assigned_approver_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE restrict,
	CONSTRAINT "ck_signoff_lane_type" CHECK("signoff_lanes"."lane_type" IN ('PRODUCT','BUSINESS','ENGINEERING','ARCHITECTURE','QA','COMPLIANCE','LEGAL','FINANCE','OPERATIONS','EXECUTIVE_SPONSOR')),
	CONSTRAINT "ck_signoff_lane_status" CHECK("signoff_lanes"."status" IN ('PENDING','UNDER_REVIEW','APPROVED','APPROVED_WITH_CONDITIONS','REJECTED')),
	CONSTRAINT "ck_signoff_lane_numbers" CHECK("signoff_lanes"."sequence">0 AND "signoff_lanes"."version">0)
);
--> statement-breakpoint
CREATE UNIQUE INDEX `uq_signoff_lanes_request_type` ON `signoff_lanes` (`signoff_request_id`,`lane_type`);--> statement-breakpoint
CREATE INDEX `idx_signoff_lanes_approver_status` ON `signoff_lanes` (`assigned_approver_user_id`,`status`);--> statement-breakpoint
CREATE INDEX `idx_signoff_lanes_due` ON `signoff_lanes` (`due_at`);--> statement-breakpoint
CREATE TABLE `signoff_requests` (
	`id` text PRIMARY KEY NOT NULL,
	`document_version_id` text,
	`requirement_revision_id` text,
	`status` text DEFAULT 'PENDING' NOT NULL,
	`requested_by` text NOT NULL,
	`requested_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`completed_at` text,
	`version` integer DEFAULT 1 NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`created_by` text,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_by` text,
	FOREIGN KEY (`document_version_id`) REFERENCES `governance_document_versions`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`requirement_revision_id`) REFERENCES `requirement_revisions`(`id`) ON UPDATE no action ON DELETE restrict,
	CONSTRAINT "ck_signoff_request_status" CHECK("signoff_requests"."status" IN ('PENDING','UNDER_REVIEW','APPROVED','APPROVED_WITH_CONDITIONS','REJECTED')),
	CONSTRAINT "ck_signoff_request_subject" CHECK(
    ("signoff_requests"."document_version_id" IS NOT NULL AND "signoff_requests"."requirement_revision_id" IS NULL)
    OR ("signoff_requests"."document_version_id" IS NULL AND "signoff_requests"."requirement_revision_id" IS NOT NULL)
  ),
	CONSTRAINT "ck_signoff_request_completion" CHECK(
    ("signoff_requests"."status" IN ('PENDING','UNDER_REVIEW') AND "signoff_requests"."completed_at" IS NULL)
    OR ("signoff_requests"."status" IN ('APPROVED','APPROVED_WITH_CONDITIONS','REJECTED') AND "signoff_requests"."completed_at" IS NOT NULL)
  ),
	CONSTRAINT "ck_signoff_request_numbers" CHECK("signoff_requests"."version">0)
);
--> statement-breakpoint
CREATE UNIQUE INDEX `uq_signoff_requests_active_document_version` ON `signoff_requests` (`document_version_id`) WHERE "signoff_requests"."status" IN ('PENDING','UNDER_REVIEW') AND "signoff_requests"."document_version_id" IS NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX `uq_signoff_requests_active_requirement_revision` ON `signoff_requests` (`requirement_revision_id`) WHERE "signoff_requests"."status" IN ('PENDING','UNDER_REVIEW') AND "signoff_requests"."requirement_revision_id" IS NOT NULL;--> statement-breakpoint
CREATE INDEX `idx_signoff_requests_document_version` ON `signoff_requests` (`document_version_id`,`status`);--> statement-breakpoint
CREATE INDEX `idx_signoff_requests_requirement_revision` ON `signoff_requests` (`requirement_revision_id`,`status`);--> statement-breakpoint
CREATE INDEX `idx_signoff_requests_status` ON `signoff_requests` (`status`,`requested_at`);--> statement-breakpoint
CREATE TRIGGER `trg_signoff_requests_transition`
BEFORE UPDATE OF status ON `signoff_requests`
WHEN NOT (
  (OLD.status='PENDING' AND NEW.status IN ('PENDING','UNDER_REVIEW','APPROVED','APPROVED_WITH_CONDITIONS','REJECTED'))
  OR (OLD.status='UNDER_REVIEW' AND NEW.status IN ('UNDER_REVIEW','APPROVED','APPROVED_WITH_CONDITIONS','REJECTED'))
  OR (OLD.status='APPROVED' AND NEW.status='APPROVED')
  OR (OLD.status='APPROVED_WITH_CONDITIONS' AND NEW.status='APPROVED_WITH_CONDITIONS')
  OR (OLD.status='REJECTED' AND NEW.status='REJECTED')
)
BEGIN
  SELECT RAISE(ABORT, 'SIGNOFF_REQUEST_TRANSITION_INVALID');
END;--> statement-breakpoint
CREATE TRIGGER `trg_signoff_requests_locked_identity_update`
BEFORE UPDATE ON `signoff_requests`
WHEN NEW.document_version_id IS NOT OLD.document_version_id
  OR NEW.requirement_revision_id IS NOT OLD.requirement_revision_id
  OR NEW.requested_by IS NOT OLD.requested_by
  OR NEW.requested_at IS NOT OLD.requested_at
BEGIN
  SELECT RAISE(ABORT, 'SIGNOFF_REQUEST_LOCKED');
END;--> statement-breakpoint
CREATE TRIGGER `trg_signoff_requests_locked_delete`
BEFORE DELETE ON `signoff_requests`
WHEN OLD.status<>'PENDING'
BEGIN
  SELECT RAISE(ABORT, 'SIGNOFF_REQUEST_LOCKED');
END;--> statement-breakpoint
CREATE TRIGGER `trg_signoff_lanes_locked_identity_update`
BEFORE UPDATE ON `signoff_lanes`
WHEN NEW.signoff_request_id IS NOT OLD.signoff_request_id
  OR NEW.lane_type IS NOT OLD.lane_type
  OR NEW.required IS NOT OLD.required
  OR NEW.sequence IS NOT OLD.sequence
BEGIN
  SELECT RAISE(ABORT, 'SIGNOFF_LANE_LOCKED');
END;--> statement-breakpoint
CREATE TRIGGER `trg_signoff_lanes_locked_delete`
BEFORE DELETE ON `signoff_lanes`
WHEN OLD.status<>'PENDING'
BEGIN
  SELECT RAISE(ABORT, 'SIGNOFF_LANE_LOCKED');
END;--> statement-breakpoint
CREATE TRIGGER `trg_signoff_decisions_immutable_update`
BEFORE UPDATE ON `signoff_decisions`
BEGIN
  SELECT RAISE(ABORT, 'SIGNOFF_DECISION_IMMUTABLE');
END;--> statement-breakpoint
CREATE TRIGGER `trg_signoff_decisions_immutable_delete`
BEFORE DELETE ON `signoff_decisions`
BEGIN
  SELECT RAISE(ABORT, 'SIGNOFF_DECISION_IMMUTABLE');
END;--> statement-breakpoint
CREATE TRIGGER `trg_signoff_conditions_transition`
BEFORE UPDATE OF status ON `signoff_conditions`
WHEN NOT (
  (OLD.status='OPEN' AND NEW.status IN ('OPEN','IN_PROGRESS','SATISFIED','WAIVED'))
  OR (OLD.status='IN_PROGRESS' AND NEW.status IN ('IN_PROGRESS','SATISFIED','WAIVED'))
  OR (OLD.status='SATISFIED' AND NEW.status='SATISFIED')
  OR (OLD.status='WAIVED' AND NEW.status='WAIVED')
)
BEGIN
  SELECT RAISE(ABORT, 'SIGNOFF_CONDITION_TRANSITION_INVALID');
END;--> statement-breakpoint
CREATE TRIGGER `trg_signoff_conditions_locked_identity_update`
BEFORE UPDATE ON `signoff_conditions`
WHEN OLD.status IN ('SATISFIED','WAIVED') AND (
  NEW.decision_id IS NOT OLD.decision_id
  OR NEW.description IS NOT OLD.description
  OR NEW.owner_user_id IS NOT OLD.owner_user_id
  OR NEW.due_at IS NOT OLD.due_at
)
BEGIN
  SELECT RAISE(ABORT, 'SIGNOFF_CONDITION_LOCKED');
END;--> statement-breakpoint
CREATE TRIGGER `trg_signoff_conditions_locked_delete`
BEFORE DELETE ON `signoff_conditions`
WHEN OLD.status<>'OPEN'
BEGIN
  SELECT RAISE(ABORT, 'SIGNOFF_CONDITION_LOCKED');
END;