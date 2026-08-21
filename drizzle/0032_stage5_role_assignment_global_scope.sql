PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_user_role_assignments` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`role_id` text NOT NULL,
	`scope_type` text DEFAULT 'GLOBAL' NOT NULL,
	`scope_id` text DEFAULT '*' NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`created_by` text,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_by` text,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`role_id`) REFERENCES `roles`(`id`) ON UPDATE no action ON DELETE restrict,
	CONSTRAINT "ck_user_role_assignment_scope_global" CHECK("__new_user_role_assignments"."scope_type"='GLOBAL' AND "__new_user_role_assignments"."scope_id"='*')
);
--> statement-breakpoint
INSERT INTO `__new_user_role_assignments`("id", "user_id", "role_id", "scope_type", "scope_id", "created_at", "created_by", "updated_at", "updated_by") SELECT "id", "user_id", "role_id", "scope_type", "scope_id", "created_at", "created_by", "updated_at", "updated_by" FROM `user_role_assignments`;--> statement-breakpoint
DROP TABLE `user_role_assignments`;--> statement-breakpoint
ALTER TABLE `__new_user_role_assignments` RENAME TO `user_role_assignments`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
CREATE UNIQUE INDEX `uq_user_role_scope` ON `user_role_assignments` (`user_id`,`role_id`,`scope_type`,`scope_id`);--> statement-breakpoint
CREATE INDEX `idx_user_role_assignments_user` ON `user_role_assignments` (`user_id`);--> statement-breakpoint
CREATE INDEX `idx_user_role_assignments_role_scope` ON `user_role_assignments` (`role_id`,`scope_type`,`scope_id`);--> statement-breakpoint
INSERT INTO `roles` (`id`,`code`,`name`,`system_role`,`created_by`,`updated_by`) VALUES
  ('role_administrator','ADMINISTRATOR','Administrator',1,'SYSTEM','SYSTEM'),
  ('role_product_development_manager','PRODUCT_DEVELOPMENT_MANAGER','Product Development Manager',1,'SYSTEM','SYSTEM'),
  ('role_product_manager','PRODUCT_MANAGER','Product Manager',1,'SYSTEM','SYSTEM'),
  ('role_business_analyst','BUSINESS_ANALYST','Business Analyst',1,'SYSTEM','SYSTEM'),
  ('role_engineering_lead','ENGINEERING_LEAD','Engineering Lead',1,'SYSTEM','SYSTEM'),
  ('role_developer','DEVELOPER','Developer',1,'SYSTEM','SYSTEM'),
  ('role_qa','QA','QA',1,'SYSTEM','SYSTEM'),
  ('role_finance','FINANCE','Finance',1,'SYSTEM','SYSTEM'),
  ('role_compliance_legal','COMPLIANCE_LEGAL','Compliance / Legal',1,'SYSTEM','SYSTEM'),
  ('role_stakeholder_approver','STAKEHOLDER_APPROVER','Stakeholder / Approver',1,'SYSTEM','SYSTEM'),
  ('role_executive_viewer','EXECUTIVE_VIEWER','Executive / Viewer',1,'SYSTEM','SYSTEM');