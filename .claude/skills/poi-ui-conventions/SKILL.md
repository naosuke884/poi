---
name: poi-ui-conventions
description: The established look, shared UI pieces, Japanese copy style, and accessibility / mobile rules of poi's frontend (src/, React + Mantine 9). Use it for any change to what users see or touch in poi — adding or editing components, styles or CSS modules, buttons, menus, tooltips, toasts / notifications, modals, error or loading states, header items, the landing page, legal pages, mobile or touch layout, dark mode — and for any change to UI wording or messages, even when the request never says "design" or "UI". Read it before writing JSX or CSS under src/ so new UI reuses the existing pieces and matches the app instead of introducing a new style. Not for researching library upgrades, regenerating image assets such as og.png, or pasting in legal text supplied by someone else.
---

# poi UI conventions

poi's UI is deliberately quiet: stock Mantine, one document-like board, the user's notes as the main thing on screen.
Most UI commits in the history *removed* emphasis (light instead of filled buttons, no accent colours in headings, no cards on the landing page).
Match what is there; do not introduce a new visual language.

**Relationship to `frontend-design:frontend-design`**: that skill pushes distinctive, new aesthetics.
For changes inside poi's existing UI, the conventions here win.
Use frontend-design only when the user explicitly asks for a new visual direction (a redesign, a new look), and even then keep the rules under "Accessibility & mobile" and "Copy".

**Where files go** is covered by the `route-colocation` skill — read it before adding a .tsx / .ts / .module.css; this skill does not repeat it.

## Theme and styling

- The theme is almost default (`createTheme` in `src/main.tsx`, `defaultColorScheme="auto"`): the Inter font and one brand colour, `ai` (藍, shade 6 = `#3a5a9b`), set as `primaryColor` with `primaryShade: { light: 6, dark: 7 }`, plus `headings.textWrap: "balance"` so wrapped headings get even lines (the line count stays the same, so the board's view / editor heights still match). The same indigo is in `public/icon.svg`, the PWA icons and `og.png`; change them together. No other custom colours, radius or spacing. Use the primary colour through `--mantine-primary-color-*` or `color="ai"`, never the hex. Do not add theme overrides for a single component; the rest of the look comes from Mantine defaults.
- Fonts: Inter (latin subset only, `src/fonts.css`, preloaded in `index.html`) for Latin; Japanese falls through to the system font. Don't add web fonts for Japanese or other subsets (they would also have to be precached for offline).
- Dark mode is automatic via the OS. There is no toggle. Therefore **use Mantine CSS variables for every colour** (`var(--mantine-color-text)`, `--mantine-color-dimmed`, `--mantine-color-default-border`, `--mantine-primary-color-filled`, `--mantine-color-<name>-filled` / `-light`, `--mantine-color-body`) or Mantine colour props (`c="dimmed"`, `color="red"`). Never hard-code hex values in components — they break in dark mode. The only literal colours are the `theme-color` metas in `index.html` (`#ffffff` / `#242424` = Mantine's body colours), the inline `<style>` next to them that paints `html` `#242424` under `prefers-color-scheme: dark` (with `<meta name="color-scheme" content="light dark">`, so the first frame before Mantine's JS runs is not white), and the manifest `theme_color` in `vite.config.ts`; keep those in sync if the background ever changes.
- Styling order of preference, as the code does it:
  1. Mantine component props (`size`, `variant`, `c`, `fz`, `lh`, `mt`, `maw`, `visibleFrom` / `hiddenFrom`, …).
  2. A small inline `style={{…}}` for one-off layout (flex, safe-area `calc()`, scroll margins).
  3. A colocated CSS Module (`X.module.css`, `import classes from "./X.module.css"`) for selectors props can't express: `:focus-visible`, `:fullscreen`, descendant styling of rendered Markdown, CodeMirror overrides via `:global(...)`.
  CSS Modules use only Mantine variables (`--mantine-spacing-*`, `--mantine-radius-*`, `--mantine-shadow-*`, `--mantine-font-size-*`). PostCSS has `postcss-preset-mantine` and breakpoint variables (`$mantine-breakpoint-sm` etc.) if a media query is needed.
- Comment every CSS rule and non-obvious prop with *why* (in Japanese, like the rest of `src/`). The existing CSS explains each value; keep that up.
- Body text on the board is `fz="md"` with `lh={1.7}` (Japanese needs the extra leading). `MarkdownView` and `SectionEditor.module.css` must keep identical font size, line height, heading sizes (h1 1.75rem / h2 1.375rem / h3 1.125rem / h4–6 1rem) and heading top margins, so switching a section between view and editor never shifts layout. Change both together. Headings in `MarkdownView` inherit the 1.7 line height, and blocks have no bottom margins: the gap between blocks is exactly the source's blank lines (one body line each, marked by `rehypeBlankLines` as `data-blank-lines`), like the editor shows them. The まとめ view passes `sourceBlankLines={false}` because its joins add blank lines the user never wrote.
- Icons: no icon library. Use `Svg` from `(board)/-components/board/TablerIcon.tsx` with pasted Tabler outline paths (`aria-hidden`, `currentColor`), or `PlusIcon`. Don't add `@tabler/icons-react` or similar.
- Emphasis is scarce: primary actions on the board are `variant="light"` (e.g. `AddSectionButton`), secondary ones `variant="default"` or `subtle`, divider-level buttons `size="xs"` with `c="dimmed"`, destructive ones red (`CloseButton c="red"`, `Menu.Item color="red"`). Filled (default variant) buttons are kept to a single clear action in a small context: the landing CTA, a modal's primary button, `リロード` in the update notice, the header's `ログイン`.

## Shared pieces — reuse these

| Need | Use | Notes |
|---|---|---|
| Toast / notification (undo, operation error, update available) | `BottomLeftNotice` (`src/components/`) | Bottom-left, safe-area aware, aligned to the board edge via `affixInset`. `raised` puts it on the row above (the corner is the undo toast's). Bottom-right is reserved for the mobile add-section FAB. Announced as `role="status"` by default (Mantine's default `alert` would interrupt); pass `role="alert"` for errors. The close button is named from the title (`「更新があります」を閉じる`) so several toasts stay distinguishable; a toast without a title passes `closeLabel` (`エラーを閉じる`) (#124). There is no `@mantine/notifications`; don't add it. |
| Undo instead of confirm | `useUndoableDelete` + `BottomLeftNotice` with a `元に戻す` button (`variant="default"`, `size="xs"`), shown 8 s | Deletions of user content apply immediately and offer undo; no confirm dialog. This holds for bulk deletions too (a group, the whole board): one undo toast restores everything removed, with a past-tense title such as `すべてのセクションを削除しました`. |
| Confirm an irreversible action | Mantine modal like `DeleteAccountConfirmModal`: `centered`, no title and no close button, body text + left-aligned `Group`. Without a title Mantine sets no `aria-labelledby`, and `<Modal aria-label>` lands on the root, not on `role="dialog"`, so build it from `Modal.Root` / `Overlay` / `Content aria-label="…の確認"` / `Body` (#123) | Cancel is the filled primary button with `data-autofocus`; the destructive button is `color="red" variant="outline"` and comes first. Not `window.confirm`. |
| Form modal | `TtlSettingModal` pattern: `Modal title centered`, contents in a `<form onSubmit>` (`preventDefault`, then save) so Enter in a field submits (#129), `Stack gap="md"`, `Skeleton` while loading, inline `Text c="red" role="alert"` for errors, `Group gap="sm"` with `保存` (`type="submit"`, loading) then `キャンセル` (`variant="default"`) | Render modals outside `Menu.Dropdown` (it unmounts on close). |
| Close a modal with Android back | `useCloseWatcher(opened, onClose)` (`(root)/-lib/use-close-watcher.ts`) | Every modal calls it (#122). Mantine closes only on Esc / outside click, so without it the back button / gesture moves the router or leaves the app. Where `CloseWatcher` exists it makes back close just the modal; elsewhere it does nothing. `onClose` may run twice on Esc (Mantine + the watcher), so keep it idempotent (set the open state to false). If a modal outside `(root)` needs it, move the hook to `src/lib/` (route-colocation). |
| Page-specific header controls | `HeaderSlot` (`src/components/HeaderSlot.tsx`) | The header (`AppHeader`) must not know about pages. The same applies to the user menu: a page-specific menu item needs a slot/registration mechanism whose provider sits in `__root.tsx` above both the header and `<Outlet/>` — a context provided inside the page is invisible to the header, so the item would never work. Items registered this way still follow the host's rules — e.g. `UserMenu` disables server-backed items while offline, so apply its `offline` flag to page items too. Header group is `wrap="nowrap"` inside a 56px header — keep additions compact (`size="xs"`), hide text on small screens. |
| Route load failure | `RouteErrorFallback` (router `defaultErrorComponent`) | Offline → yellow `Alert`, otherwise red; `再試行` + `トップへ戻る`. Throw from loaders instead of rendering ad-hoc error UI. |
| Offline state | `useOnline` / `useOnBackOnline` (`(root)/-lib/use-online.ts`), `OfflineBanner` | Disable server-backed actions while offline (`disabled={offline}`) and say why (`オフライン (ログアウトはオンラインで)`). |
| Busy state | Mantine `loading` on the button, or `<Loader size="xs" aria-label="…中…">` (`RUNNING_LABELS`) | Disable other conflicting actions while one runs (`busy`). |
| Small action feedback (copy, screenshot) | `SectionActions`' pattern: tooltip + check / × icon for 1.5 s, mirrored in a hidden live region | No toast for these. Keep the ActionIcon's variant colour gray; colour only the icon via `c` (otherwise the hover background flashes). |
| Buttons used next to the editor | `onMouseDown={keepEditorFocus}` (`(board)/-lib/keep-editor-focus.ts`) | Without it the editor blurs, the layout jumps and the click misses. Every board/header/divider button has it. |
| Fixed-position bottom elements | `Affix` + `affixInset(side)` + `env(safe-area-inset-bottom)` (+ `useKeyboardInset()` for things that must clear the soft keyboard) | Aligns to the board's edge on wide screens. |
| Legal / static text pages | `LegalPage` (`(legal)/-components/`) | `Typography fz="md" lh={1.7}`, `最終更新日`, `トップへ戻る`. |
| Contact address | `ContactLink` / `CONTACT_URL` | Never hard-code the email. |

## Copy (Japanese UI text)

- All UI text, `aria-label`s, tooltips and user-facing error messages are Japanese. Never show a browser / library error message (English) to users — catch and replace it (`失敗しました`, see `SectionActions`).
- Spacing: put a half-width space between Japanese and Latin letters / numbers (`30 日`, `Google でログイン`, `セクション 3`, `2026 年 9 月 24 日`). Parenthetical notes use half-width parentheses with a leading space: `保存期間 (日数)`, `(Enter で編集)`. The ellipsis is `…` (`保存中…`, `ここに書く…`).
- Tone: plain polite form (です / ます) for sentences, short noun phrases for controls. Buttons and menu items are verb-noun or noun: `セクションを追加`, `アカウントを追加`, `保存`, `キャンセル`, `再試行`, `リロード`, `元に戻す`, `削除する` (in the confirm), `ログアウト`. Tooltips are shortest form (`コピー`, `スクショ`, `削除`); the `aria-label` names the target (`セクション 3 を削除`).
- Results are past tense: `セクションを削除しました`, `コピーしました`, `画像を保存しました`. Errors say what failed and what to do: `保存できませんでした。接続を確認して、もう一度お試しください。` / `…一度ログアウトして再ログインし、もう一度お試しください`.
- Use the product's own nouns consistently: 板 (the board), セクション, 見出し, まとめ / タイムライン (view modes), 保存期間, オフライン, ホーム画面に追加. On the landing page, describe what the user can do, not implementation terms (no "PWA").
- Full inventory of existing strings (reuse the exact wording): [references/ui-strings.md](references/ui-strings.md).

## Accessibility & mobile

These came from dedicated fix commits; keep them when touching nearby code.

- **Keyboard**: interactive things are real buttons (`UnstyledButton`, `ActionIcon`, `<button type="button">`), not clickable divs; if a div must act as one (`MarkdownView`), give it `role="button"`, `tabIndex={0}`, Enter handling and a label hinting the key (`(Enter で編集)`). Focus rings appear only on `:focus-visible` (`outline: 2px solid var(--mantine-primary-color-filled)`). Don't remove the skip link (`SkipLink` → `#main`, `tabIndex={-1}` on `AppShell.Main`).
- **Screen readers**: icon-only controls need a Japanese `aria-label` and decorative images `alt=""` (the avatar, the logo). Tooltips aren't read out, so status changes go through a live region: persistent `role="status"` container (`SaveStatusIcon`) or `VisuallyHidden role="status" aria-live="polite"` (`SectionActions`); errors use `role="alert"`. Keep the live region mounted even when empty so later changes are announced.
- **Touch vs hover**: tooltips triggered by tap linger on touch devices — disable them with `useMediaQuery("(hover: none)")` (see `ViewToggle`). Touch-only features check `(hover: none) and (pointer: coarse)` (see `useInstallApp`). The board opens with every section as rendered Markdown and nothing focused; don't autofocus the editor on load (on touch it pops the soft keyboard).
- **Safe areas**: `index.html` uses `viewport-fit=cover`, so anything at a screen edge adds `env(safe-area-inset-*)` (header, main padding in `__root.tsx`, `BottomLeftNotice`, FAB). Editor font size stays ≥ 16px so iOS doesn't zoom on focus.
- **Narrow screens**: the header must fit one 56px row (`wrap="nowrap"`); hide labels below a breakpoint (`visibleFrom="xs"` for the user name) and move actions (add-section is in the header from `sm`, a bottom-right FAB below it). User-written content wraps with `overflow-wrap: anywhere`. Japanese headings / lists on marketing text and page titles (landing hero, legal pages and their headings) use `word-break: auto-phrase`. Legal body text uses `text-wrap: pretty` (`LegalPage.module.css`); board text never gets `pretty` or `auto-phrase`, because the editor (CodeMirror) would wrap differently and lines would move on every switch.
- **Reduced motion**: the only animation, the landing demo video, doesn't autoplay under `useReducedMotion()`. Anything new that moves on its own must do the same.
- **Forced colors (Windows high contrast)**: backgrounds are repainted as `Canvas`, so a line or bar drawn as a `background` on an empty box disappears. Draw such lines with borders in a CSS Module and, where two lines must stay distinguishable, set system colours under `@media (forced-colors: active)` (`LifeLine.module.css`, #130).
- **Contrast**: don't use `c="dimmed"` for small body text that must be read (FeatureList keeps the body at normal colour for AA); dimmed is for labels, hints and footers.

## Before finishing

- Check light and dark mode, a narrow (~360px) touch viewport and a desktop width; tab through the changed UI.
- `npm run lint` (Biome) and `npm run typecheck`; `npm test` if board behaviour changed.
