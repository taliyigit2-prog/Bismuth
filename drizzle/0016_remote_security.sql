ALTER TABLE `sessions` ADD `locked_at` text;--> statement-breakpoint
ALTER TABLE `users` ADD `remote_failed_attempts` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `users` ADD `remote_locked_until` text;