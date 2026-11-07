import { MEMO_TTL_CHOICES } from "@shared/constants";
import { useEffect, useId, useState } from "react";

import { Button } from "@/components/Button";
import { api } from "@/lib/api";

import { countPastPeriod } from "../../../-lib/ttl-past-period";
import { Modal } from "../../Modal";

import classes from "./modal-content.module.css";
import skeleton from "./skeleton.module.css";
import radio from "./TtlSettingModal.module.css";

/**
 * セクションの保存期間 (書いてから削除されるまでの日数) の設定モーダル (UserMenu から開く)。
 * 開いたときに現在値と板のセクションの作成日時を取得し (GET /api/settings, /api/board)、保存 (PUT /api/settings) すると
 * いま保存されている全セクションにも新しい期限 (作成日 + 日数) が適用される。
 * 作成日 + 日数をもう過ぎているセクションは消さずに、今の期限と「保存した時点 + 日数」の早い方を期限にする
 * (HAY-59。以前はその場で消えて元に戻せなかったので、赤字で数を出して保存ボタンも赤にしていた: #106)。
 * そうしたセクションがあれば、期限がいつになるのか分かるよう保存の前にその数を出す。
 * 板の取得に失敗したときは数を出せないだけで、保存はできる。保存後の板の取り直しは親 (onSaved) に任せる
 */
export function TtlSettingModal({
  opened,
  onClose,
  onSaved,
}: {
  opened: boolean;
  onClose: () => void;
  /** 保存が成功したとき (閉じる前) に呼ぶ。板の再取得など */
  onSaved: () => void;
}) {
  // 現在の選択 (ラジオの value に合わせて文字列で扱う)。取得が終わるまでは null でスケルトンを出す
  const [value, setValue] = useState<string | null>(null);
  // 板のセクションの作成日時 (選んだ日数をもう過ぎている数を数える用)。取れなければ null
  const [createdAts, setCreatedAts] = useState<string[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const labelId = useId();
  const radioName = useId();

  // 開くたびに現在値を取り直す (別の端末で変えた値が残らないように)
  useEffect(() => {
    if (!opened) return;
    setValue(null);
    setCreatedAts(null);
    setError(null);
    let cancelled = false;
    void (async () => {
      try {
        const res = await api.settings.$get();
        if (!res.ok) throw new Error(`設定の取得に失敗しました (${res.status})`);
        const { memoTtlDays } = await res.json();
        if (!cancelled) setValue(String(memoTtlDays));
      } catch {
        if (!cancelled)
          setError("設定を取得できませんでした。接続を確認して、開き直してください。");
      }
    })();
    void (async () => {
      try {
        const res = await api.board.$get();
        if (!res.ok) return;
        const { sections } = await res.json();
        if (!cancelled) setCreatedAts(sections.map((s) => s.createdAt));
      } catch {
        // 数を出せないだけなので、エラーにはしない
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [opened]);

  const pastPeriod = value !== null && createdAts ? countPastPeriod(createdAts, Number(value)) : 0;

  const save = async () => {
    // Enter での送信は保存ボタンの disabled / loading を通らないので、ここでも弾く
    if (value === null || saving) return;
    setSaving(true);
    setError(null);
    try {
      const res = await api.settings.$put({ json: { memoTtlDays: Number(value) } });
      if (!res.ok) throw new Error(`保存に失敗しました (${res.status})`);
      onSaved();
      onClose();
    } catch {
      setError("保存できませんでした。接続を確認して、もう一度お試しください。");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal opened={opened} onClose={onClose} title="保存期間">
      {/* form にして、ラジオで Enter を押しても保存できるようにする (#129) */}
      <form
        onSubmit={(e) => {
          e.preventDefault();
          void save();
        }}
      >
        <div className={classes.stack}>
          <p className={classes.text}>セクションが書かれてから自動で削除されるまでの日数です。</p>
          {value === null && error === null ? (
            <div className={`${skeleton.skeleton} ${radio.skeleton}`} />
          ) : (
            <div className={radio.field}>
              <div id={labelId} className={radio.label}>
                削除までの日数
              </div>
              {/* 選択肢は 7 つだけなので、ドロップダウン (モーダルからはみ出してボタンを隠す) にせず並べる */}
              <div role="radiogroup" aria-labelledby={labelId}>
                <div className={radio.choices}>
                  {MEMO_TTL_CHOICES.map((d) => (
                    <label key={d} className={radio.choice}>
                      <span className={radio.control}>
                        <input
                          type="radio"
                          name={radioName}
                          value={String(d)}
                          checked={value === String(d)}
                          onChange={(e) => setValue(e.currentTarget.value)}
                          disabled={value === null}
                          className={radio.input}
                        />
                        <svg viewBox="0 0 5 5" aria-hidden="true" className={radio.dot}>
                          <circle cx="2.5" cy="2.5" r="2.5" fill="currentColor" />
                        </svg>
                      </span>
                      <span className={radio.choiceLabel}>{`${d} 日`}</span>
                    </label>
                  ))}
                </div>
              </div>
              {/* 作成日から数えると思って選ぶと、もう過ぎているセクションがすぐ消えると誤解するので、前もって数を出す。
                  選び直すたびに読み上げるよう、live region は空でも置いておく (空のときは余白も付けない) */}
              <p
                className={`${classes.text} ${pastPeriod > 0 ? radio.notice : ""}`}
                role="status"
                aria-live="polite"
              >
                {pastPeriod > 0 &&
                  `保存すると、書いてから ${value} 日を過ぎているセクション ${pastPeriod} 個は、遅くとも今日から ${value} 日後に削除されます。`}
              </p>
            </div>
          )}
          {error && (
            <p className={classes.error} role="alert">
              {error}
            </p>
          )}
          <div className={classes.actions}>
            <Button type="submit" loading={saving} disabled={value === null}>
              保存
            </Button>
            <Button variant="default" onClick={onClose} disabled={saving}>
              キャンセル
            </Button>
          </div>
        </div>
      </form>
    </Modal>
  );
}
