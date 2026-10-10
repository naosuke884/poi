// @vitest-environment jsdom
import { EditorSelection, EditorState, type Extension } from "@codemirror/state";
import { type Command, EditorView } from "@codemirror/view";
import { afterEach, describe, expect, it } from "vite-plus/test";

import { insertNewlineContinueList } from "./list-continue";
import { indentLess, indentMoreOrInsertTab, spaceIndentsListItem } from "./list-indent";
import {
  deleteListMarkerBackward,
  deleteListMarkerForward,
  hashStartsHeading,
  spaceAfterHashStartsHeading,
} from "./list-markers";

// Enter / Tab / Backspace / 見出しの書き出しなど、エディタの編集コマンドの結果をテキストで確かめる。
// doc の `|` がカーソル位置 (取り除いてから置く)

const views: EditorView[] = [];
afterEach(() => {
  for (const v of views.splice(0)) v.destroy();
});

function editor(doc: string, extensions: Extension = []): EditorView {
  const at = doc.indexOf("|");
  const view = new EditorView({
    state: EditorState.create({
      doc: doc.replace("|", ""),
      selection: EditorSelection.cursor(at < 0 ? 0 : at),
      extensions,
    }),
    parent: document.body,
  });
  views.push(view);
  return view;
}

/** doc と、カーソル位置に `|` を差し込んだ文字列 */
function text(view: EditorView): string {
  const doc = view.state.doc.toString();
  const head = view.state.selection.main.head;
  return `${doc.slice(0, head)}|${doc.slice(head)}`;
}

function run(command: Command, doc: string, extensions: Extension = []): string {
  const view = editor(doc, extensions);
  command(view);
  return text(view);
}

/** 文字の入力 (inputHandler を通してから、通らなければ普通に挿入する) */
function type(view: EditorView, input: string) {
  for (const ch of input) {
    const { from, to } = view.state.selection.main;
    const handled = view.state
      .facet(EditorView.inputHandler)
      .some((h) =>
        h(view, from, to, ch, () => view.state.update({ changes: { from, to, insert: ch } })),
      );
    if (!handled)
      view.dispatch({
        changes: { from, to, insert: ch },
        selection: EditorSelection.cursor(from + ch.length),
        userEvent: "input.type",
      });
  }
}

describe("Enter (insertNewlineContinueList)", () => {
  it("項目を同じ階層・同じ記号で続ける", () => {
    expect(run(insertNewlineContinueList, "- a|")).toBe("- a\n- |");
    expect(run(insertNewlineContinueList, "\t* a|")).toBe("\t* a\n\t* |");
  });

  it("番号付きは次の番号にする", () => {
    expect(run(insertNewlineContinueList, "1. a|")).toBe("1. a\n2. |");
    expect(run(insertNewlineContinueList, "9) a|")).toBe("9) a\n10) |");
  });

  it("インデントのある空の項目は 1 段戻す", () => {
    expect(run(insertNewlineContinueList, "- a\n\t- |")).toBe("- a\n- |");
  });

  it("いちばん外の空の項目は記号を消し、空行を挟んでリストを抜ける (#104)", () => {
    expect(run(insertNewlineContinueList, "- a\n- |")).toBe("- a\n\n|");
    expect(run(insertNewlineContinueList, "- |")).toBe("|");
  });

  it("リストを抜けた後の Enter は普通の改行 (もう 1 回で空行 2 つ = セクション区切り)", () => {
    const view = editor("- a\n- |");
    for (let i = 0; i < 2; i++) insertNewlineContinueList(view);
    expect(text(view)).toBe("- a\n\n\n|");
  });

  it("リストの外は普通の改行", () => {
    expect(run(insertNewlineContinueList, "# 見出し|")).toBe("# 見出し\n|");
  });
});

describe("Tab / Shift+Tab (list-indent)", () => {
  it("項目の行はどこにカーソルがあっても行頭にタブを足す", () => {
    expect(run(indentMoreOrInsertTab, "- a\n- b|c")).toBe("- a\n\t- b|c");
  });

  it("項目でない行はカーソル位置にタブを挿す", () => {
    expect(run(indentMoreOrInsertTab, "ab|")).toBe("ab\t|");
  });

  it("番号付きの項目は入れ子の先頭として 1 に振り直す", () => {
    expect(run(indentMoreOrInsertTab, "1. a\n2. b|")).toBe("1. a\n\t1. b|");
  });

  it("入れ子の兄弟の後ならその次の番号にする", () => {
    expect(run(indentMoreOrInsertTab, "1. a\n\t1. b\n3. c|")).toBe("1. a\n\t1. b\n\t2. c|");
  });

  it("選択の終わりが行頭ちょうどなら、その行はインデントしない", () => {
    const view = editor("- a\n- b\n- c");
    // 1〜2 行目を行単位で選択 (終わりは 3 行目の行頭)
    view.dispatch({ selection: EditorSelection.range(0, 8) });
    indentMoreOrInsertTab(view);
    expect(view.state.doc.toString()).toBe("\t- a\n\t- b\n- c");
    indentLess(view);
    expect(view.state.doc.toString()).toBe("- a\n- b\n- c");
  });

  it("Shift+Tab はタブ停止 1 つ分を消す", () => {
    expect(run(indentLess, "\t\t- a|")).toBe("\t- a|");
    expect(run(indentLess, "  - a|")).toBe("- a|");
  });

  it("記号の直後のスペースはインデントにする", () => {
    const view = editor("- a\n- |", [spaceIndentsListItem]);
    type(view, " ");
    expect(text(view)).toBe("- a\n\t- |");
  });
});

describe("Backspace / Delete (deleteListMarkerBackward / Forward)", () => {
  it("記号の直後の Backspace は記号を消して普通の行に戻す (#104)", () => {
    expect(run(deleteListMarkerBackward, "- a\n- |b")).toBe("- a\n|b");
    expect(run(deleteListMarkerBackward, "- a\n1. |")).toBe("- a\n|");
  });

  it("インデントした項目では 1 段戻す", () => {
    expect(run(deleteListMarkerBackward, "- a\n\t- |b")).toBe("- a\n- |b");
  });

  it("doc の先頭 (セクションの結合) と記号より右では何もしない", () => {
    const view = editor("|- a");
    expect(deleteListMarkerBackward(view)).toBe(false);
    expect(run(deleteListMarkerBackward, "- a|")).toBe("- a|");
  });

  it("行末の Delete は次の項目の記号ごと結合する", () => {
    expect(run(deleteListMarkerForward, "- a|\n- b")).toBe("- a|b");
  });

  it("行末でない・最後の行・次の行が項目でない・範囲を選んでいるときは Delete で何もしない", () => {
    for (const doc of ["- |a\n- b", "- a\n- b|", "- a|\nb"]) {
      const view = editor(doc);
      expect(deleteListMarkerForward(view)).toBe(false);
      expect(text(view)).toBe(doc);
    }
    const view = editor("- a\n- b");
    view.dispatch({ selection: EditorSelection.range(2, 3) });
    expect(deleteListMarkerForward(view)).toBe(false);
    expect(view.state.doc.toString()).toBe("- a\n- b");
  });
});

describe("記号を自動で足さない (#104)", () => {
  it("記号の無い行に書いてもそのまま", () => {
    const view = editor("- a\n|");
    type(view, "b");
    expect(text(view)).toBe("- a\nb|");
  });
});

describe("見出しの書き出し", () => {
  const ext = [hashStartsHeading, spaceAfterHashStartsHeading];

  it("空の項目で # を打つと見出しの書き出しにする", () => {
    const view = editor("- a\n\t- |", ext);
    type(view, "#");
    expect(text(view)).toBe("- a\n#|");
  });

  it("全角の ＃ も半角にして見出しにする", () => {
    const view = editor("- |", ext);
    type(view, "＃");
    expect(text(view)).toBe("#|");
  });

  it("後から # の直後にスペースを入れても見出しにする", () => {
    const view = editor("- #|foo", ext);
    type(view, " ");
    expect(text(view)).toBe("# |foo");
  });
});
