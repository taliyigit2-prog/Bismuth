ALTER TABLE `charges` ADD `amount_base_minor` integer;--> statement-breakpoint
ALTER TABLE `kbs_stay_rows` ADD `assigned_iso2` text;--> statement-breakpoint
UPDATE `charges` SET `amount_base_minor` = `amount_minor` WHERE `currency` = coalesce((SELECT json_extract(`value_json`, '$') FROM `settings` WHERE `key` = 'hotel.baseCurrency'), 'TRY');
