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
| `コピー` / `スクショ` / `削除` | tooltips of the card's top-row buttons (`SectionActions`) |
| `元に戻す` | undo button in the delete toast |
| `再試行` | `RouteErrorFallback`; `(クリックで再試行)` appended to save-status tooltips |
| `トップへ戻る` | `RouteErrorFallback`, `NotFound`, `DocPage` |
| `リロード` | `PwaUpdateBanner` |
| `削除する` / `キャンセル` | account-deletion confirm (`DeleteAccountConfirmModal`, dialog name `アカウント削除の確認`) |
| `Google でログインして始める` | header, when signed out (`LoginButton`; starts Google OAuth directly) |
| `ログイン` | header in an in-app browser (X etc.), when signed out and not on `/`; links to the landing |
| `URL をコピー` | landing hero in an in-app browser (X etc.), where the header shows no login button, after `アプリ内のブラウザでは Google でログインできません。Safari や Chrome などのブラウザで開いてください。`; result `URL をコピーしました。Safari や Chrome に貼り付けて開いてください` / `コピーできませんでした。画面のメニューから「ブラウザで開く」を選んでください` |
| `アカウントを追加` / `ホーム画面に追加` / `利用規約` / `プライバシーポリシー` / `問い合わせ` / `ログアウト` / `アカウント削除` | `UserMenu` items, in this order |
| `タグ` / `<tag>` | tooltip of the top row's tag button (`SectionTagButton`): `タグ` while untagged; with a tag the button shows only the tag's icon, and the tooltip is the full name (no tooltip on touch: the name shows in the popover and the filter bar). `aria-label` `セクション <n> のタグを選ぶ`, or `<tag> (セクション <n> のタグを選ぶ)` when tagged (visible name first, unbracketed, for label-in-name) |
| `削除` / `削除する` / `キャンセル` | tag popover (`SectionTags`): the delete button in a tag's `…` row, then confirm / cancel (no sentence: the user wants the UI to speak, not text). Creating a tag is a `+` row with the pill (read as `<name>を作る`); selecting, creating and renaming have no other buttons: Enter submits, Esc cancels |
| `「<title>」を閉じる` / `エラーを閉じる` / `通知を閉じる` | close button label of `BottomLeftNotice` (from the title; `closeLabel` for the untitled error toast; fallback) |

## Status, results, notices

- Save status (`SaveStatusIcon`): `保存済み`, `未保存の変更があります`, `保存中…`, `オフラインです。オンライン復帰後に再保存してください`, `保存に失敗: <detail>`
- Action results: `コピーしました`, `画像をコピーしました`, `画像を保存しました`, `失敗しました`
- Undo toast title: `セクションを削除しました`
- Tags (`SectionTags`): popover group `セクション <n> のタグを選ぶ`; search input `タグを探すか、新しく作る` (after ↑↓ only — not on every keystroke — a hidden polite status announces the Enter target: `「<tag>」を付ける` / `「<name>」を作って付ける`) (placeholder `タグ…`; description `名前を打つと、いちばん近いタグが選ばれる。↑↓ で選び直して Enter で付ける。無い名前は最後の作る行で作って付ける`); no visible caption; current tag's × `タグ「<tag>」を外す`; row menu `タグ「<tag>」の名前を変える・削除する`; rename input `タグ「<tag>」の新しい名前` (description `Enter で名前を変える、Esc でやめる`); errors `タグを登録できませんでした。接続を確認して、もう一度お試しください。`, `タグは <n> 個までです。使わないタグの登録を消してください。`, `タグの登録を消せませんでした。接続を確認して、もう一度お試しください。`, `タグの名前を変えられませんでした。接続を確認して、もう一度お試しください。`, `「<name>」というタグはもうあります。別の名前にしてください。`, `「<name>」というタグは、別の場所で登録が消されています。`
- Tag filter (`TagFilterBar`): group `タグで絞り込む`, buttons `すべて` / `<tag>` / `タグなし`; empty states `「<tag>」のメモはまだありません。`, `タグなしのメモはまだありません。`
- `更新があります` (PWA update notice title)
- Offline: `オフラインです` (Alert title), `表示しているのは前回取得した内容です。編集はオンラインに戻ってから保存されます。`, `オフラインのため閲覧のみです (<日時> 時点の内容)。オンラインに戻ると自動的に最新の内容を読み込みます。`, menu label `オフライン (ログアウトはオンラインで)`
- Top-row label for an unsaved section: `新しいセクション` (`LifeLabel`)
- Busy labels (`RUNNING_LABELS`, read out by `RunningStatus`): `ログアウト中…`, `アカウント削除中…`, `アカウント切り替え中…`
- Editor placeholder (only section): `ここに書く…` / `セクションごとに <n> 日で消えます` / `Markdown が使えます (# 見出し、- 箇条書き)` / `Tab でインデント、Esc で編集をやめる`

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
- 404 (`NotFound`): heading `ページが見つかりません`, lead `URL が間違っているか、ページが移動または削除された可能性があります。`, button `トップへ戻る`

Note: sentence-final `。` is inconsistent today — the errors from `useAccountActions` and `LoginButton` don't end with `。`, the save errors on the board do. Match the file you're editing.

## Accessibility labels

- Sections: `セクション <n>`; view: `セクション <n> (Enter で編集)`; editor: `セクション <n>` with the description (`aria-describedby`) `Esc で編集をやめる`
- `<subject> をコピー`, `<subject> を画像にする`, `<subject> を削除`
- `保存を再試行`, `本文へ移動` (skip link)
- Formatting toolbar (`SectionToolbar`): toolbar `セクション <n> の書式`
- VisuallyHidden board heading (`h1`): `板`

## Titles and fixed text

- Modals: `ホーム画面に追加`; the delete confirm has no title: `アカウントを削除しますか？` / `メモした内容はすべて消え、元に戻せません。`
- Landing: `<n> 日で消えるメモ帳`; section heading `とくちょう`; features `書いてから <n> 日で、ひとつずつ消える`, `タグで絞り込んで、読み返せる`, `残したいものは、ワンクリックで持ち出せる`, `ホーム画面から、すぐ書ける`
- Document titles (`useDocumentTitle`): `poi` (top), `使い方とよくある質問 | poi`, `利用規約 | poi`, `プライバシーポリシー | poi`, `ページが見つかりません | poi`, `エラーが発生しました | poi` / `オフラインです | poi`
- Legal: `最終更新日: <yyyy> 年 <m> 月 <d> 日`
- Footer (`SiteFooter`, landing and text pages), one row in this order: `ドキュメント` (`/docs/guide`) / `利用規約` / `プライバシーポリシー` / `問い合わせ` (mailto, `ContactLink`). No copyright line
