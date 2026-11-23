DROP TABLE `user_setting`;--> statement-breakpoint
-- user_setting は保存期間を 30 日固定にした push からどこからも読み書きしていない (前の Worker が読んでいたので、
-- その push では落とさなかった)。あわせて drizzle/0012 の UPDATE をもう一度流す: 0012 を流してから新しい Worker に
-- 替わるまでの間に、前の Worker が 31 日以上の設定で作った行が残っているため。何度流しても結果は同じ
UPDATE `memo` SET `expires_at` = `created_at` + 2592000000 WHERE `expires_at` > `created_at` + 2592000000;
