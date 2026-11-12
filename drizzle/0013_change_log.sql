CREATE TABLE `change_log` (
	`seq` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`epoch` integer NOT NULL,
	`tbl` text NOT NULL,
	`pk` text NOT NULL,
	`op` text NOT NULL,
	`row_json` text,
	`schema_version` integer NOT NULL,
	`ts` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `change_log_ts_idx` ON `change_log` (`ts`);--> statement-breakpoint
CREATE TABLE `replica_grants` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`device_id` text NOT NULL,
	`token_hash` text NOT NULL,
	`created_at` text NOT NULL,
	`last_seen_at` text,
	`revoked_at` text,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`device_id`) REFERENCES `devices`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `replica_grants_token_idx` ON `replica_grants` (`token_hash`);--> statement-breakpoint
CREATE INDEX `replica_grants_device_idx` ON `replica_grants` (`device_id`);