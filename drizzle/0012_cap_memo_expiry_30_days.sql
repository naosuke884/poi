-- 保存期間の設定 (1〜90 日) を無くし 30 日固定にした (MEMO_TTL_DAYS) が、それより前に 31 日以上の設定で作られた
-- セクションは、作成時に決めた期限 (expires_at) のまま残っている。期限を「作成日時 + 30 日」(memoExpiresAt と同じ
-- created_at + 30 * 86400000 ミリ秒。日単位の丸めは無い) で頭打ちにする。
-- 頭打ちにした結果もう期限を過ぎた行は、API の expires_at > now の絞り込みですぐ見えなくなり、次の Cron の後始末で中身が消える。
-- 期限を早めるだけなので、いま動いている Worker (migrate してから deploy する間) もそのまま正しく扱える。
-- 30 日以下の期限の行は変えないので、何度流しても結果は同じ
UPDATE `memo` SET `expires_at` = `created_at` + 2592000000 WHERE `expires_at` > `created_at` + 2592000000;
