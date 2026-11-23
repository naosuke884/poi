// @vitest-environment jsdom
import { EditorSelection, EditorState } from "@codemirror/state";
import { type Command, EditorView } from "@codemirror/view";
import { afterEach, describe, expect, it } from "vite-plus/test";

import { toggleHeading, toggleList } from "./format-commands";

// 書式のツールバーのコマンドの結果をテキストで確かめる。doc の `|` がカーソル位置、`[` `]` が選択の範囲

const views: EditorView[] = [];
afterEach(() => {
  for (const v of views.splice(0)) v.destroy();
});

function run(command: Command, doc: string): string {
  const marks = { cursor: doc.indexOf("|"), from: doc.indexOf("["), to: doc.indexOf("]") };
  const plain = doc.replace(/[|[\]]/g, "");
  const selection =
    marks.from >= 0
      ? EditorSelection.range(marks.from, marks.to - 1)
      : EditorSelection.cursor(Math.max(0, marks.cursor));
  const view = new EditorView({
    state: EditorState.create({ doc: plain, selection }),
    parent: document.body,
  });
  views.push(view);
  command(view);
  const out = view.state.doc.toString();
  const head = view.state.selection.main.head;
  return `${out.slice(0, head)}|${out.slice(head)}`;
}

describe("toggleHeading", () => {
  it("カーソルのある行を見出しにし、カーソルは本文の同じ位置に残す", () => {
    expect(run(toggleHeading(1), "買|い物")).toBe("# 買|い物");
    expect(run(toggleHeading(2), "|買い物")).toBe("## |買い物");
  });

  it("同じ大きさの見出しなら見出しをやめ、違う大きさなら付け替える", () => {
    expect(run(toggleHeading(1), "# 買い物|")).toBe("買い物|");
    expect(run(toggleHeading(2), "# 買い物|")).toBe("## 買い物|");
  });

  it("箇条書きの項目を見出しにするときは、記号とインデントを外す", () => {
    expect(run(toggleHeading(1), "\t- 牛乳|")).toBe("# 牛乳|");
  });
  it("# だけの行 (中身の無い見出し) も見出しとして扱う", () => {
    expect(run(toggleHeading(1), "#|")).toBe("|");
    expect(run(toggleHeading(2), "#|")).toBe("## |");
    expect(run(toggleList("bullet"), "##|")).toBe("- |");
  });
});

describe("toggleList", () => {
  it("箇条書きにし、もう一度で記号を外す (インデントは残す)", () => {
    expect(run(toggleList("bullet"), "牛乳|")).toBe("- 牛乳|");
    expect(run(toggleList("bullet"), "\t- 牛乳|")).toBe("\t牛乳|");
  });

  it("選択が触れている行をまとめて番号付きにし、1 から振る", () => {
    expect(run(toggleList("ordered"), "[牛乳\n卵\nパン]")).toBe("1. 牛乳\n2. 卵\n3. パン|");
  });

  it("タブと空白が混ざっていても、インデントの桁で階層を見て番号を振る", () => {
    expect(run(toggleList("ordered"), "[  - a\n\t- b\n  - c]")).toBe("  1. a\n\t1. b\n  2. c|");
  });

  it("番号は階層 (インデント) ごとに 1 から振る", () => {
    expect(run(toggleList("ordered"), "[- a\n  - b\n  - c\n- d\n  - e]")).toBe(
      "1. a\n  1. b\n  2. c\n2. d\n  1. e|",
    );
  });

  it("別の種類の箇条書きや見出しは付け替える", () => {
    expect(run(toggleList("ordered"), "- 牛乳|")).toBe("1. 牛乳|");
    expect(run(toggleList("bullet"), "## 買い物|")).toBe("- 買い物|");
  });

  it("選択の途中の空行には記号を付けず、番号も空行を飛ばして振り、もう一度で外せる", () => {
    expect(run(toggleList("ordered"), "[牛乳\n\n卵]")).toBe("1. 牛乳\n\n2. 卵|");
    expect(run(toggleList("ordered"), "[1. 牛乳\n\n2. 卵]")).toBe("牛乳\n\n卵|");
    expect(run(toggleHeading(1), "[# 牛乳\n\n# 卵]")).toBe("牛乳\n\n卵|");
  });

  it("空の行にカーソルを置いて押したら、その行に記号を付ける", () => {
    expect(run(toggleList("bullet"), "牛乳\n|")).toBe("牛乳\n- |");
  });

  it("一部の行だけが箇条書きなら、全部を箇条書きにそろえる", () => {
    expect(run(toggleList("bullet"), "[- 牛乳\n卵]")).toBe("- 牛乳\n- 卵|");
  });
});
