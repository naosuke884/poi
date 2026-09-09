import { List, Modal, Stack, Text } from "@mantine/core";
import { useMediaQuery, useOs } from "@mantine/hooks";
import { useState } from "react";
import { promptInstall, useInstallState } from "@/lib/install-prompt";

/**
 * メニューの「ホーム画面に追加」(PWA のインストール導線)。
 *
 * 出すのはタッチ端末 (= スマホ / タブレット) で、まだホーム画面から開かれていないときだけ。
 * PC はヘッダーが狭くないしブラウザのアドレスバーにインストールボタンが出るので対象外。
 *
 * Chromium 系は beforeinstallprompt を受け取れているのでブラウザのインストールダイアログを出す。
 * iOS の Safari にはその API が無いため、共有メニューからの手順を Modal で案内する。
 *
 * Menu.Dropdown は閉じると中身ごとアンマウントされる (Modal も一緒に消える) ので、
 * Menu.Item と Modal は別々に置けるよう、状態はこのフックが持ち、Modal は Menu の外に描く。
 */
export function useInstallApp() {
  const os = useOs();
  // ホバーできない粗いポインタ = スマホ / タブレット。メニューを開く前から値が要るので即時評価する
  const touch = useMediaQuery("(hover: none) and (pointer: coarse)", false, {
    getInitialValueInEffect: false,
  });
  const { installed } = useInstallState();
  const [guideOpened, setGuideOpened] = useState(false);

  return {
    /** メニューに項目を出すか */
    available: touch && !installed,
    start: () => {
      void promptInstall().then((prompted) => {
        // ブラウザのダイアログを出せない (iOS など) ときは手順を案内する
        if (!prompted) setGuideOpened(true);
      });
    },
    /** <InstallGuideModal {...guide} /> にそのまま渡す */
    guide: { os, opened: guideOpened, onClose: () => setGuideOpened(false) },
  };
}

export function InstallGuideModal({
  os,
  opened,
  onClose,
}: {
  os: ReturnType<typeof useOs>;
  opened: boolean;
  onClose: () => void;
}) {
  return (
    <Modal opened={opened} onClose={onClose} title="ホーム画面に追加" centered>
      <Stack gap="md">
        <List type="ordered" spacing="xs" size="sm">
          {os === "ios" ? (
            <>
              <List.Item>画面下 (または上) の共有ボタン (□ に ↑) をタップ</List.Item>
              <List.Item>メニューを下にたどって「ホーム画面に追加」を選ぶ</List.Item>
              <List.Item>右上の「追加」をタップ</List.Item>
            </>
          ) : (
            <>
              <List.Item>ブラウザのメニュー (⋮ など) を開く</List.Item>
              <List.Item>「ホーム画面に追加」または「アプリをインストール」を選ぶ</List.Item>
            </>
          )}
        </List>
        <Text size="sm" c="dimmed">
          追加するとアプリのように全画面で開けて、オフラインでも前回の板を読めます。
        </Text>
      </Stack>
    </Modal>
  );
}
