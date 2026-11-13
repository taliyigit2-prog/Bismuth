DROP INDEX `room_nights_room_date_slot_unique`;--> statement-breakpoint
ALTER TABLE `room_nights` ADD `start_time` text;--> statement-breakpoint
ALTER TABLE `room_nights` ADD `end_time` text;--> statement-breakpoint
CREATE UNIQUE INDEX `room_nights_night_unique` ON `room_nights` (`room_id`,`date`) WHERE "room_nights"."slot" = 'night';--> statement-breakpoint
CREATE UNIQUE INDEX `room_nights_day_start_unique` ON `room_nights` (`room_id`,`date`,`start_time`) WHERE "room_nights"."slot" = 'day' and "room_nights"."start_time" is not null;--> statement-breakpoint
CREATE UNIQUE INDEX `room_nights_day_whole_unique` ON `room_nights` (`room_id`,`date`) WHERE "room_nights"."slot" = 'day' and "room_nights"."start_time" is null;--> statement-breakpoint
CREATE INDEX `room_nights_room_date_idx` ON `room_nights` (`room_id`,`date`,`slot`,`start_time`);--> statement-breakpoint
ALTER TABLE `room_types` ADD `hourly_price_minor` integer;--> statement-breakpoint
-- S-100: reception may refund by default. Only a system reception row still at the old default 'none' moves to
-- 'edit' ('view' and 'edit' are kept); the audit row is written first, with the same condition as the update.
INSERT INTO `audit_log` (`id`, `ts`, `entity`, `entity_id`, `action`, `before_json`, `after_json`, `reason`)
SELECT 'mig0019-' || rp.`role_id`, strftime('%Y-%m-%dT%H:%M:%fZ', 'now'), 'role_permission',
       rp.`role_id` || ':payments.refund', 'update', '{"level":"none"}', '{"level":"edit"}', 'migration_0019_s100'
FROM `role_permissions` rp JOIN `roles` r ON r.`id` = rp.`role_id`
WHERE r.`code` = 'reception' AND r.`is_system` = 1 AND rp.`permission` = 'payments.refund' AND rp.`level` = 'none';--> statement-breakpoint
UPDATE `role_permissions` SET `level` = 'edit'
WHERE `permission` = 'payments.refund' AND `level` = 'none'
  AND `role_id` IN (SELECT `id` FROM `roles` WHERE `code` = 'reception' AND `is_system` = 1);
