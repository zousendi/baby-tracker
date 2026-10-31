CREATE TABLE `notification_outbox` (
	`id` text PRIMARY KEY NOT NULL,
	`subscription_id` text NOT NULL,
	`kind` text NOT NULL,
	`record_id` text NOT NULL,
	`record_at` text,
	`reminder_minutes` integer DEFAULT 0 NOT NULL,
	`created_at` integer NOT NULL,
	`expires_at` integer NOT NULL,
	`attempts` integer DEFAULT 0 NOT NULL,
	`next_attempt_at` integer DEFAULT 0 NOT NULL,
	`lease_until` integer DEFAULT 0 NOT NULL,
	`delivered_at` integer,
	FOREIGN KEY (`subscription_id`) REFERENCES `notification_subscriptions`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `idx_notification_pending` ON `notification_outbox` (`delivered_at`,`next_attempt_at`,`expires_at`);--> statement-breakpoint
CREATE TABLE `notification_subscriptions` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`family_id` text NOT NULL,
	`session_hash` text NOT NULL,
	`endpoint` text NOT NULL,
	`p256dh` text NOT NULL,
	`auth` text NOT NULL,
	`language` text DEFAULT 'ja' NOT NULL,
	`family_events` integer DEFAULT 1 NOT NULL,
	`reminder_minutes` integer DEFAULT 0 NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`family_id`) REFERENCES `families`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `idx_notification_family` ON `notification_subscriptions` (`family_id`);