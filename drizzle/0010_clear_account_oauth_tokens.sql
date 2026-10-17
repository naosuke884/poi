-- Google のトークンは保存しないようにした (worker/auth/index.ts の databaseHooks。HAY-37) ので、
-- それより前に保存された分も消す。アプリはどこでも読んでいないので、消しても動作は変わらない
UPDATE `account` SET `access_token` = NULL, `refresh_token` = NULL, `id_token` = NULL WHERE `access_token` IS NOT NULL OR `refresh_token` IS NOT NULL OR `id_token` IS NOT NULL;
