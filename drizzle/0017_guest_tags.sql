CREATE TABLE `guest_tag_links` (
	`guest_id` text NOT NULL,
	`tag_id` text NOT NULL,
	`created_by` text,
	`created_at` text NOT NULL,
	PRIMARY KEY(`guest_id`, `tag_id`),
	FOREIGN KEY (`guest_id`) REFERENCES `guests`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`tag_id`) REFERENCES `guest_tags`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `guest_tag_links_tag_idx` ON `guest_tag_links` (`tag_id`);--> statement-breakpoint
CREATE TABLE `guest_tags` (
	`id` text PRIMARY KEY NOT NULL,
	`code` text,
	`name` text,
	`name_i18n_json` text,
	`sort` integer DEFAULT 0 NOT NULL,
	`active` integer DEFAULT true NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `guest_tags_code_unique` ON `guest_tags` (`code`);