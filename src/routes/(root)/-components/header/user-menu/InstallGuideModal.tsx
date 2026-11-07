import { useState } from "react";

import { promptInstall, useInstallState } from "@/lib/install-prompt";
import { useMediaQuery } from "@/lib/use-media-query";

import { isIos } from "../../../-lib/is-ios";
import { Modal } from "../../Modal";

import list from "./InstallGuideModal.module.css";
import classes from "./modal-content.module.css";

/**
 * メニューの「ホーム画面に追加」(PWA のインストール導線)。
 *
 * 出すのはタッチ端末 (= スマホ / タブレット) で、まだホーム画面から開かれていないときだけ。
 * PC はヘッダーが狭くないしブラウザのアドレスバーにインストールボタンが出るので対象外。
 *
 * Chromium 系は beforeinstallprompt を受け取れているのでブラウザのインストールダイアログを出す。
 * iOS の Safari にはその API が無いため、共有メニューからの手順を Modal で案内する。
 *
 * メニューは閉じると中身ごとアンマウントされる (中に置いた Modal も一緒に消える) ので、
 * メニューの項目と Modal は別々に置けるよう、状態はこのフックが持ち、Modal はメニューの外に描く。
 */
export function useInstallApp() {
  // ホバーできない粗いポインタ = スマホ / タブレット。メニューを開く前から値が要るので、最初の描画から実際の値を使う
  const touch = useMediaQuery("(hover: none) and (pointer: coarse)");
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
    guide: { opened: guideOpened, onClose: () => setGuideOpened(false) },
  };
}

export function InstallGuideModal({ opened, onClose }: { opened: boolean; onClose: () => void }) {
  return (
    <Modal opened={opened} onClose={onClose} title="ホーム画面に追加">
      <div className={classes.stack}>
        <ol className={list.steps}>
          {isIos() ? (
            <>
              <li>画面下 (または上) の共有ボタン (□ に ↑) をタップ</li>
              <li>メニューを下にたどって「ホーム画面に追加」を選ぶ</li>
              <li>右上の「追加」をタップ</li>
            </>
          ) : (
            <>
              <li>ブラウザのメニュー (⋮ など) を開く</li>
              <li>「ホーム画面に追加」または「アプリをインストール」を選ぶ</li>
            </>
          )}
        </ol>
        <p className={classes.muted}>
          追加するとアプリのように全画面で開けて、オフラインでも前回の板を読めます。
        </p>
      </div>
    </Modal>
  );
}
