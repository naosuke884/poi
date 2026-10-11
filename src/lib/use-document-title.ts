import { pageTitle } from "@shared/site";
import { useEffect } from "react";

/** タブや履歴に出る文書のタイトル。トップ (ランディング) は TOP_TITLE、他は「利用規約 | poi」の形 */
export const documentTitle = pageTitle;

/**
 * 表示中のページに合わせて document.title を変える (#121)。
 * index.html の <title> は最初の表示用で、SPA の遷移では変わらないので、ルートが描画するページごとに呼ぶ
 * (呼ばないページがあると前のページのタイトルが残る)
 */
export function useDocumentTitle(page?: string) {
  useTitle(documentTitle(page));
}

/** ページ名を付けず、title をそのまま文書のタイトルにする (板) */
export function useTitle(title: string) {
  useEffect(() => {
    document.title = title;
  }, [title]);
}
