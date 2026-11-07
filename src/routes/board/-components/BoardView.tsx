import { useRef } from "react";

import { Alert } from "@/components/Alert";
import { VisuallyHidden } from "@/components/VisuallyHidden";

import { formatDateTime } from "../-lib/data/board";
import type { BoardData } from "../-lib/data/board-loader";
import { Board } from "./board/Board";

import classes from "./BoardView.module.css";

/** ログイン済みのときの板 (オフラインでキャッシュしか無ければ閲覧専用の注意書きを添える) */
export function BoardView({
  // userId は context.session からではなく loader の結果から取る: アカウント切り替え (UserMenu の setActive →
  // router.invalidate) では beforeLoad (context) が先に確定し、loader が終わるまで sections は前のアカウントの
  // まま一度描画される。context の userId で key を作るとその瞬間に前の内容のまま作り直してしまい、
  // 新しい板が来ても key が変わらず表示が 1 回前のままになる (issue #52)。
  // loader の userId なら sections と必ず同じアカウントで、板の到着と同時に key が変わる
  data: { sections, revision, ttlDays, offline, cachedAt, userId },
}: {
  data: BoardData;
}) {
  // 一度でもオンラインで (最新の内容で) 開いたかどうか。
  // オンラインで開いた後にオフラインになり、復帰時の再取得 (OfflineBanner の router.invalidate) が
  // まだ失敗して loader がキャッシュを返しても、編集中の板を閲覧専用に作り直さない
  // (作り直すとオフラインで入力した未保存分がキャッシュの内容で上書きされて失われる)。
  // 閲覧専用にするのは、最初からキャッシュでしか開けていないときだけ
  const liveRef = useRef(false);
  if (!offline) liveRef.current = true;
  const readOnly = offline && !liveRef.current;
  // 保持日数は最後にオンラインで取れた値を渡し続ける。オフラインの再取得 (キャッシュ) では不明 (undefined) に
  // なるが、そこで既定値に戻すと Board が「保持日数が変わった」と見て期限を引き直してしまう
  const ttlDaysRef = useRef(ttlDays);
  if (ttlDays !== undefined) ttlDaysRef.current = ttlDays;
  return (
    // 並びの間隔 (gap) は付けず、注意書きとの間隔は Alert の下の余白で取る (常在の空のライブリージョンに間隔が付かないように)
    <div className={classes.root}>
      {/* 見出しで画面の構造をたどれるよう、画面には出さない h1 を置く (板の見た目はメモだけにしておく。#120)。
          ページを移ったときのフォーカス先にもなる (tabIndex={-1}。#121) */}
      <VisuallyHidden as="h1" tabIndex={-1}>
        板
      </VisuallyHidden>
      {/* ライブリージョンは中身と同時に挿入されると読み上げられないことが多いので、入れ物は常に置いておき
          Alert だけを出し入れする (#126)。Alert の既定の role="alert" は入れ物と二重になるので note にする */}
      <div role="status">
        {readOnly && (
          <Alert tone="attention" role="note" className={classes.offlineNote}>
            {`オフラインのため閲覧のみです (${cachedAt !== null ? formatDateTime(cachedAt) : "前回取得"} 時点の内容)。`}
            オンラインに戻ると自動的に最新の内容を読み込みます。
          </Alert>
        )}
      </div>
      {/* キャッシュ表示 (閲覧のみ) → オンライン復帰で最新を取得したときは作り直して最新の内容にする。
          編集中 (readOnly でない) 間は offline フラグが変わっても作り直さない (未保存分を保持するため)。
          アカウント切り替えでは userId (loader 由来。上記) が変わるので、作り直して切り替え先の板にする (issue #52) */}
      <Board
        key={`${userId}-${readOnly ? "offline" : "online"}`}
        sections={sections}
        revision={revision}
        userId={userId}
        readOnly={readOnly}
        ttlDays={ttlDaysRef.current}
      />
    </div>
  );
}
