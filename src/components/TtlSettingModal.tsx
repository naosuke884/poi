import { Button, Group, Modal, Select, Skeleton, Stack, Text } from "@mantine/core";
import { useEffect, useState } from "react";
import { MEMO_TTL_CHOICES } from "@worker/memo/constants";
import { api } from "@/lib/api";

/**
 * セクションの保存期間 (書いてから削除されるまでの日数) の設定モーダル (UserMenu から開く)。
 * 開いたときに現在値を取得し (GET /api/settings)、保存 (PUT /api/settings) すると
 * いま保存されている全セクションにも新しい期限 (作成日 + 日数) が適用される。
 * 短くしたときは、新しい期限を過ぎたセクションがその場で消える (サーバが見せなくなる) ので、
 * 本文でそのことを断っておく。保存後の板の取り直しは親 (onSaved) に任せる
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
  // 現在の選択 (Select は文字列で扱う)。取得が終わるまでは null でスケルトンを出す
  const [value, setValue] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  // 開くたびに現在値を取り直す (別の端末で変えた値が残らないように)
  useEffect(() => {
    if (!opened) return;
    setValue(null);
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
    return () => {
      cancelled = true;
    };
  }, [opened]);

  const save = async () => {
    if (value === null) return;
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
      <Stack gap="md">
        <Text size="sm">
          セクションが書かれてから自動で削除されるまでの日数です。
          いま保存されているセクションにも新しい期限が適用されます
          (短くすると、期限を過ぎたセクションはすぐに消えます)。
        </Text>
        {value === null && error === null ? (
          <Skeleton h={60} />
        ) : (
          <Select
            label="削除までの日数"
            data={MEMO_TTL_CHOICES.map((d) => ({ value: String(d), label: `${d} 日` }))}
            value={value}
            onChange={setValue}
            allowDeselect={false}
            disabled={value === null}
          />
        )}
        {error && (
          <Text size="sm" c="red" role="alert">
            {error}
          </Text>
        )}
        <Group gap="sm">
          <Button onClick={() => void save()} loading={saving} disabled={value === null}>
            保存
          </Button>
          <Button variant="default" onClick={onClose} disabled={saving}>
            キャンセル
          </Button>
        </Group>
      </Stack>
    </Modal>
  );
}
