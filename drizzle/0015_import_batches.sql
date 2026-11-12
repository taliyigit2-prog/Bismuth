CREATE TABLE `import_batches` (
	`id` text PRIMARY KEY NOT NULL,
	`template` text NOT NULL,
	`file_name` text NOT NULL,
	`file_sha256` text NOT NULL,
	`summary_json` text NOT NULL,
	`created_by` text,
	`voided_at` text,
	`voided_by` text,
	`void_reason` text,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `import_batches_created_idx` ON `import_batches` (`created_at`);--> statement-breakpoint
CREATE TABLE `import_rows` (
	`id` text PRIMARY KEY NOT NULL,
	`batch_id` text NOT NULL,
	`fingerprint` text NOT NULL,
	`row` integer NOT NULL,
	`entity` text NOT NULL,
	`entity_id` text NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`batch_id`) REFERENCES `import_batches`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `import_rows_fingerprint_idx` ON `import_rows` (`fingerprint`);--> statement-breakpoint
CREATE INDEX `import_rows_batch_idx` ON `import_rows` (`batch_id`);