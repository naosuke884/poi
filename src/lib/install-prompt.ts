import { useSyncExternalStore } from "react";

// ホーム画面への追加 (PWA インストール) の状態を持つモジュール。
//
// Chromium 系は「インストールできる」と判断した時点で beforeinstallprompt を 1 度だけ投げてくる。
// これは React のマウントより先に飛んでくることがあるので、受け取りはコンポーネントではなく
// モジュール読み込み時 (main.tsx から import) に済ませておく。
// 既定のミニ情報バーは preventDefault() で抑え、メニューから押されたときに prompt() する。
//
// iOS の Safari はこのイベントを実装していない (インストールの API も無い) ので、
// その場合はメニューから手順を案内するだけになる。

type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
};

/** ホーム画面から (スタンドアロンで) 開かれているか = すでに追加済み */
function isStandalone(): boolean {
  try {
    if (window.matchMedia("(display-mode: standalone)").matches) return true;
  } catch {
    // matchMedia が無い / 古い環境
  }
  // iOS Safari は display-mode を返さないので独自プロパティを見る
  return (navigator as Navigator & { standalone?: boolean }).standalone === true;
}

export type InstallState = {
  /** ブラウザのインストールダイアログを出せる (Chromium 系で beforeinstallprompt を受け取り済み) */
  canPrompt: boolean;
  /** すでにホーム画面から開かれている */
  installed: boolean;
};

let deferred: BeforeInstallPromptEvent | null = null;
// useSyncExternalStore は同じ状態なら同じ参照を返す必要があるので、変化したときだけ作り直す
let snapshot: InstallState = { canPrompt: false, installed: false };
const listeners = new Set<() => void>();

function update(next: InstallState) {
  if (next.canPrompt === snapshot.canPrompt && next.installed === snapshot.installed) return;
  snapshot = next;
  for (const listener of listeners) listener();
}

if (typeof window !== "undefined") {
  snapshot = { canPrompt: false, installed: isStandalone() };
  window.addEventListener("beforeinstallprompt", (event) => {
    event.preventDefault();
    deferred = event as BeforeInstallPromptEvent;
    update({ ...snapshot, canPrompt: true });
  });
  window.addEventListener("appinstalled", () => {
    // 追加された後もタブ自体はブラウザのままなので、display-mode ではなくこのイベントで導線を隠す
    deferred = null;
    update({ canPrompt: false, installed: true });
  });
}

function subscribe(onChange: () => void) {
  listeners.add(onChange);
  return () => listeners.delete(onChange);
}

const getSnapshot = () => snapshot;
const getServerSnapshot = (): InstallState => ({ canPrompt: false, installed: false });

export function useInstallState(): InstallState {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}

/**
 * ブラウザのインストールダイアログを出す。出せた場合だけ true
 * (beforeinstallprompt を受け取っていない = iOS などでは false。呼び出し側は手順の案内に切り替える)。
 * prompt() は 1 回しか使えないので、閉じられたら破棄してメニューからは手順の案内に切り替わる。
 */
export async function promptInstall(): Promise<boolean> {
  const event = deferred;
  if (!event) return false;
  deferred = null;
  update({ ...snapshot, canPrompt: false });
  try {
    await event.prompt();
  } catch {
    // ユーザー操作から離れて呼ばれた場合など。案内にフォールバックできるよう false を返す
    return false;
  }
  return true;
}
