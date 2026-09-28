import { Button, Group, Modal, Stack, Text } from "@mantine/core";

/**
 * アカウント削除の確認モーダル (UserMenu から開く)。
 *
 * 見出しは付けない (本文だけで足りる)。閉じるのはキャンセル / Esc / 外側クリック。
 * 見出しが無いと Mantine は aria-labelledby を付けず、名前の無い「ダイアログ」と読み上げられる。
 * <Modal aria-label> はルートに付くだけで role="dialog" の要素に届かないので、
 * Modal.Root で組み立てて Modal.Content (= role="dialog") に直接 aria-label を付ける (#123)
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
    <Modal.Root opened={opened} onClose={onClose} centered>
      <Modal.Overlay />
      <Modal.Content aria-label="アカウント削除の確認">
        <Modal.Body>
          <Stack gap="md">
            <Text size="sm">
              アカウントを削除しますか？
              <br />
              メモした内容はすべて消え、元に戻せません。
            </Text>
            {/* 取り返しがつかない操作なので、キャンセルを主ボタン (塗り + 初期フォーカス) にして強調する */}
            <Group gap="sm">
              <Button
                color="red"
                variant="outline"
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
            </Group>
          </Stack>
        </Modal.Body>
      </Modal.Content>
    </Modal.Root>
  );
}
