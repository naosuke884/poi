// @vitest-environment jsdom
import { EditorSelection, EditorState, type Extension } from "@codemirror/state";
import { type Command, EditorView } from "@codemirror/view";
import { afterEach, describe, expect, it } from "vitest";
import { insertNewlineContinueList } from "@/lib/list-continue";
import { forceListMarkers, hashStartsHeading, spaceAfterHashStartsHeading } from "@/lib/list-force";
import { indentLess, indentMoreOrInsertTab, spaceIndentsListItem } from "@/lib/list-indent";

// Enter / Tab / 自動の箇条書きなど、エディタの編集コマンドの結果をテキストで確かめる。
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
  return doc.slice(0, head) + "|" + doc.slice(head);
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

  it("いちばん外の空の項目はセクションの区切りにする", () => {
    expect(run(insertNewlineContinueList, "- a\n- |")).toBe("- a\n\n\n|");
  });

  it("セクションが空の項目だけなら何もしない", () => {
    expect(run(insertNewlineContinueList, "- |")).toBe("- |");
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

describe("常に箇条書き (forceListMarkers)", () => {
  const ext = [forceListMarkers, hashStartsHeading, spaceAfterHashStartsHeading];

  it("記号の無い行に書くと `- ` を足す", () => {
    const view = editor("|", ext);
    type(view, "a");
    expect(text(view)).toBe("- a|");
  });

  it("見出しの行には足さない", () => {
    const view = editor("# |", ext);
    type(view, "a");
    expect(text(view)).toBe("# a|");
  });

  it("インデントした見出しの行にも足さない (表示でも見出しになる)", () => {
    for (const doc of ["    # |", "\t# |", "\t\t## |"]) {
      const view = editor(doc, ext);
      type(view, "a");
      expect(text(view)).toBe(doc.replace("|", "a|"));
    }
  });

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
