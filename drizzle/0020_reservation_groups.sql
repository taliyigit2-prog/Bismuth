CREATE TABLE `reservation_groups` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`leader_guest_id` text,
	`folio_mode` text DEFAULT 'single' NOT NULL,
	`voided_at` text,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`leader_guest_id`) REFERENCES `guests`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
ALTER TABLE `reservations` ADD `group_id` text REFERENCES reservation_groups(id);--> statement-breakpoint
CREATE INDEX `reservations_group_idx` ON `reservations` (`group_id`);