CREATE TABLE `board` (
	`user_id` text PRIMARY KEY NOT NULL,
	`revision` text NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);
