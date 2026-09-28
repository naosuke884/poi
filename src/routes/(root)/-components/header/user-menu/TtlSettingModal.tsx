import { Button, Group, Modal, Radio, Skeleton, Stack, Text } from "@mantine/core";
import { MEMO_TTL_CHOICES } from "@shared/constants";
import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { countExpiring } from "../../../-lib/ttl-expiring";

/**
 * セクションの保存期間 (書いてから削除されるまでの日数) の設定モーダル (UserMenu から開く)。
 * 開いたときに現在値と板のセクションの作成日時を取得し (GET /api/settings, /api/board)、保存 (PUT /api/settings) すると
 * いま保存されている全セクションにも新しい期限 (作成日 + 日数) が適用される。
 * 短くしたときは、新しい期限を過ぎたセクションがその場で消え (サーバが見せなくなる)、元に戻せない。
 * 選んだ日数で消えるセクションがあれば、保存の前にその数を出して保存ボタンを赤にする (#106)。
 * 板の取得に失敗したときは数を出せないので、説明文の断り書きだけになる。保存後の板の取り直しは親 (onSaved) に任せる
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
  // 現在の選択 (Radio は文字列で扱う)。取得が終わるまでは null でスケルトンを出す
  const [value, setValue] = useState<string | null>(null);
  // 板のセクションの作成日時 (消える数を数える用)。取れなければ null
  const [createdAts, setCreatedAts] = useState<string[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

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

  const expiring = value !== null && createdAts ? countExpiring(createdAts, Number(value)) : 0;

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
    <Modal opened={opened} onClose={onClose} title="保存期間" centered>
      {/* form にして、ラジオで Enter を押しても保存できるようにする (#129) */}
      <form
        onSubmit={(e) => {
          e.preventDefault();
          void save();
        }}
      >
        <Stack gap="md">
          <Text size="sm">セクションが書かれてから自動で削除されるまでの日数です。</Text>
          {value === null && error === null ? (
            <Skeleton h={60} />
          ) : (
            <div>
              {/* 選択肢は 7 つだけなので、ドロップダウン (モーダルからはみ出してボタンを隠す) にせず並べる */}
              <Radio.Group label="削除までの日数" value={value} onChange={setValue}>
                <Group gap="md" mt="xs">
                  {MEMO_TTL_CHOICES.map((d) => (
                    <Radio key={d} value={String(d)} label={`${d} 日`} disabled={value === null} />
                  ))}
                </Group>
              </Radio.Group>
              {/* 保存すると元に戻せないので、消える数を前もって出す。選び直すたびに読み上げるよう、
                  live region は空でも置いておく (空のときは余白も付けない) */}
              <Text size="sm" c="red" mt={expiring > 0 ? "sm" : 0} role="status" aria-live="polite">
                {expiring > 0 &&
                  `保存すると、書いてから ${value} 日を過ぎたセクション ${expiring} 個がすぐに消えます (元に戻せません)。`}
              </Text>
            </div>
          )}
          {error && (
            <Text size="sm" c="red" role="alert">
              {error}
            </Text>
          )}
          <Group gap="sm">
            <Button
              type="submit"
              loading={saving}
              disabled={value === null}
              color={expiring > 0 ? "red" : undefined}
            >
              保存
            </Button>
            <Button variant="default" onClick={onClose} disabled={saving}>
              キャンセル
            </Button>
          </Group>
        </Stack>
      </form>
    </Modal>
  );
}
