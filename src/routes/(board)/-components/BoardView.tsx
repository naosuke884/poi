import { Alert, Stack } from "@mantine/core";
import { useRef } from "react";
import { formatDateTime } from "../-lib/board";
import type { TopPage } from "../-lib/board-loader";
import { Board } from "./board/Board";

/** ログイン済みのときの板 (オフラインでキャッシュしか無ければ閲覧専用の注意書きを添える) */
export function BoardView({
  // userId は context.session からではなく loader の結果から取る: アカウント切り替え (UserMenu の setActive →
  // router.invalidate) では beforeLoad (context) が先に確定し、loader が終わるまで sections は前のアカウントの
  // まま一度描画される。context の userId で key を作るとその瞬間に前の内容のまま作り直してしまい、
  // 新しい板が来ても key が変わらず表示が 1 回前のままになる (issue #52)。
  // loader の userId なら sections と必ず同じアカウントで、板の到着と同時に key が変わる
  data: { sections, revision, ttlDays, offline, cachedAt, userId },
}: {
  data: Extract<TopPage, { kind: "board" }>;
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
    <Stack style={{ flex: 1 }}>
      {readOnly && (
        <Alert color="yellow" role="status">
          {`オフラインのため閲覧のみです (${cachedAt !== null ? formatDateTime(cachedAt) : "前回取得"} 時点の内容)。`}
          オンラインに戻ると自動的に最新の内容を読み込みます。
        </Alert>
      )}
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
    </Stack>
  );
}
