CREATE TABLE `camera_events` (
	`id` text PRIMARY KEY NOT NULL,
	`kind` text NOT NULL,
	`occurred_at` text NOT NULL,
	`state` text DEFAULT 'new' NOT NULL,
	`track_ref` text,
	`source_ref` text,
	`guest_id` text,
	`crop_enc` blob,
	`expires_at` text,
	`seen_by` text,
	`seen_at` text,
	`handled_by` text,
	`handled_at` text,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`guest_id`) REFERENCES `guests`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`seen_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`handled_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `camera_events_occurred_idx` ON `camera_events` (`occurred_at`);--> statement-breakpoint
CREATE INDEX `camera_events_state_idx` ON `camera_events` (`state`,`occurred_at`);--> statement-breakpoint
CREATE INDEX `camera_events_guest_idx` ON `camera_events` (`guest_id`);--> statement-breakpoint
CREATE INDEX `camera_events_expires_idx` ON `camera_events` (`expires_at`);--> statement-breakpoint
CREATE UNIQUE INDEX `camera_events_source_unique` ON `camera_events` (`source_ref`);--> statement-breakpoint
CREATE TABLE `guest_faces` (
	`id` text PRIMARY KEY NOT NULL,
	`guest_id` text NOT NULL,
	`reservation_id` text,
	`embedding_enc` blob NOT NULL,
	`crop_enc` blob,
	`model` text NOT NULL,
	`model_version` text,
	`enrolled_at` text NOT NULL,
	`enrolled_by` text NOT NULL,
	`expires_at` text,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`guest_id`) REFERENCES `guests`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`reservation_id`) REFERENCES `reservations`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`enrolled_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `guest_faces_guest_idx` ON `guest_faces` (`guest_id`);--> statement-breakpoint
CREATE INDEX `guest_faces_reservation_idx` ON `guest_faces` (`reservation_id`);--> statement-breakpoint
CREATE INDEX `guest_faces_expires_idx` ON `guest_faces` (`expires_at`);