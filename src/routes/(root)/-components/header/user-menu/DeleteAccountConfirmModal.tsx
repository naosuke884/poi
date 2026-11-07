import { Button } from "@/components/Button";

import { Modal } from "../../Modal";

import classes from "./modal-content.module.css";

/**
 * アカウント削除の確認モーダル (UserMenu から開く)。
 *
 * 見出しは付けない (本文だけで足りる)。閉じるのはキャンセル / Esc / 外側クリック / 戻る操作。
 * 見出しが無いと名前の無い「ダイアログ」と読み上げられるので、aria-label で名前を付ける (#123)
 */
export function DeleteAccountConfirmModal({
  opened,
  onClose,
  onConfirm,
}: {
  opened: boolean;
  onClose: () => void;
  /** 「削除する」を押したとき (モーダルは呼ぶ前に閉じる) */
  onConfirm: () => void;
}) {
  return (
    <Modal opened={opened} onClose={onClose} aria-label="アカウント削除の確認">
      <div className={classes.stack}>
        <p className={classes.text}>
          アカウントを削除しますか？
          <br />
          メモした内容はすべて消え、元に戻せません。
        </p>
        {/* 取り返しがつかない操作なので、キャンセルを主ボタン (塗り + 初期フォーカス) にして強調する */}
        <div className={classes.actions}>
          <Button
            variant="outline-danger"
            onClick={() => {
              onClose();
              onConfirm();
            }}
          >
            削除する
          </Button>
          <Button data-autofocus onClick={onClose}>
            キャンセル
          </Button>
        </div>
      </div>
    </Modal>
  );
}
