CREATE TABLE `damage_deposits` (
	`id` text PRIMARY KEY NOT NULL,
	`reservation_id` text NOT NULL,
	`amount_minor` integer NOT NULL,
	`currency` text NOT NULL,
	`method_id` text NOT NULL,
	`taken_date` text NOT NULL,
	`status` text DEFAULT 'held' NOT NULL,
	`settled_date` text,
	`settled_at` text,
	`settled_by` text,
	`settle_note` text,
	`converted_charge_id` text,
	`note` text,
	`created_by` text,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`reservation_id`) REFERENCES `reservations`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`method_id`) REFERENCES `payment_methods`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `damage_deposits_reservation_idx` ON `damage_deposits` (`reservation_id`);--> statement-breakpoint
CREATE INDEX `damage_deposits_status_idx` ON `damage_deposits` (`status`);