/**
 * ボタンの onMouseDown に渡すと、押しても編集中のエディタ (SectionEditor) からフォーカスが外れない。
 * blur するとエディタが Markdown 表示に切り替わってレイアウトが動き、クリックが押したボタンから外れてしまうため、
 * 板と一緒に使うボタン (ヘッダー・区切り線・右下の追加ボタンなど) には付けておく
 */
export const keepEditorFocus = (e: { preventDefault(): void }) => e.preventDefault();
