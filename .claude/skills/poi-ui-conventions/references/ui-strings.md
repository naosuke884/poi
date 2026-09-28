# Existing UI strings

Reuse these exact wordings for the same concepts. Collected from src/ (grep the string to find its source).

## Contents
- Actions (buttons, menu items, tooltips)
- Status, results, notices
- Errors
- Accessibility labels
- Page / modal titles and fixed text

## Actions

| String | Where |
|---|---|
| `セクションを追加` | header button (sm+), mobile FAB (aria-label + tooltip) |
| `コピー` / `スクショ` / `削除` | divider tooltips (`SectionActions`, `SectionRow`, `OrganizedView`) |
| `元に戻す` | undo button in the delete toast |
| `再試行` | `RouteErrorFallback`; `(クリックで再試行)` appended to save-status tooltips |
| `トップへ戻る` | `RouteErrorFallback`, `NotFound`, `LegalPage` |
| `リロード` | `PwaUpdateBanner` |
| `保存` / `キャンセル` | `TtlSettingModal` |
| `削除する` / `キャンセル` | account-deletion confirm (`DeleteAccountConfirmModal`, dialog name `アカウント削除の確認`) |
| `ログイン` | header, when signed out and not on `/` |
| `Google でログインして始める` | landing CTA |
| `アカウントを追加` / `ホーム画面に追加` / `保存期間の設定` / `利用規約` / `プライバシーポリシー` / `問い合わせ` / `ログアウト` / `アカウント削除` | `UserMenu` items, in this order |
| `タイムライン` / `見出しごとにまとめる` | `ViewToggle` tooltips |
| `「<title>」を閉じる` / `エラーを閉じる` / `通知を閉じる` | close button label of `BottomLeftNotice` (from the title; `closeLabel` for the untitled error toast; fallback) |

## Status, results, notices

- Save status (`SaveStatusIcon`): `保存済み`, `未保存の変更があります`, `保存中…`, `オフラインです。オンライン復帰後に再保存してください`, `保存に失敗: <detail>`
- Action results: `コピーしました`, `画像をコピーしました`, `画像を保存しました`, `失敗しました`
- Undo toast titles: `セクションを削除しました`, `<subject>を削除しました` (group, e.g. `「買い物」のまとめを削除しました`)
- `更新があります` (PWA update notice title)
- Offline: `オフラインです` (Alert title), `表示しているのは前回取得した内容です。編集はオンラインに戻ってから保存されます。`, `オフラインのため閲覧のみです (<日時> 時点の内容)。オンラインに戻ると自動的に最新の内容を読み込みます。`, menu label `オフライン (ログアウトはオンラインで)`
- Divider label for an unsaved section: `新しいセクション`; organized view labels: `見出しなし`, `<n> か所`, joined with ` · `
- Empty organized view: `まだメモがありません。タイムラインで書いたメモが、ここに見出しごとにまとまります。`
- Busy labels (`RUNNING_LABELS`, read out by `RunningStatus`): `ログアウト中…`, `アカウント削除中…`, `アカウント切り替え中…`
- Editor placeholder (only section): `ここに書く…` / `セクションごとに <n> 日で消えます` / `空行 2 つで次のセクションへ` / `Markdown が使えます (# 見出し、- 箇条書き)` / `Tab でインデント、Esc で編集をやめる`

## Errors

Pattern: what failed + what to do. Connection problems say `接続を確認して…`.

- `エラーが発生しました` (generic Alert title)
- `ログインを開始できませんでした。接続を確認してもう一度お試しください`
- `設定を取得できませんでした。接続を確認して、開き直してください。`
- `保存できませんでした。接続を確認して、もう一度お試しください。`
- `オフラインのためログアウトできません` / `…アカウントを削除できません` / `…アカウントを切り替えられません`
- `ログアウトできませんでした。時間をおいてもう一度お試しください`
- `アカウントを削除できませんでした。一度ログアウトして再ログインし、もう一度お試しください`
- `切り替えられませんでした。もう一度そのアカウントでログインしてください`
- `ページが見つかりません。` (404)

Note: sentence-final `。` is inconsistent today — the modal / inline errors in `TtlSettingModal` end with `。`, the `useAccountActions` and `LandingHero` ones don't. Match the file you're editing.

## Accessibility labels

- Sections: `セクション <n>`; view: `セクション <n> (Enter で編集)`; editor: `セクション <n> (Esc で編集をやめる)`
- `<subject> をコピー`, `<subject> を画像にする`, `<subject> を削除`
- `保存を再試行`, `板の表示方法`, `デモ動画を全画面で見る`, `本文へ移動` (skip link)
- VisuallyHidden view names: `タイムライン (書いた順の表示)`, `まとめ (見出しごとにまとめた表示)`

## Titles and fixed text

- Modals: `保存期間` (radio group label `削除までの日数`, options `<n> 日`; warning when shortening `保存すると、書いてから <n> 日を過ぎたセクション <m> 個がすぐに消えます (元に戻せません)。`), `ホーム画面に追加`; the delete confirm has no title: `アカウントを削除しますか？` / `メモした内容はすべて消え、元に戻せません。`
- Landing: `<n> 日で消えるメモ帳`; consent line `ログインすると、利用規約とプライバシーポリシーに同意したものとみなします。`; features `<n> 日たつと、勝手に消える`, `メモをシェアできる`, `Markdown で整えて書ける`
- Legal: `最終更新日: <yyyy> 年 <m> 月 <d> 日`
