import { describe, expect, it } from "vite-plus/test";

import { charsetOf, parsePreview, TITLE_MAX_LENGTH } from "./parse-preview";

describe("parsePreview", () => {
  it("og:title と og:site_name を取り、属性の順番や引用符の種類によらない", () => {
    const html = `<head><meta content='記事の題名' property="og:title"><meta property=og:site_name content="サイト"></head>`;
    expect(parsePreview(html)).toEqual({ title: "記事の題名", siteName: "サイト" });
  });

  it("data-content や data-name など、名前の後ろが同じ別の属性は見ない", () => {
    const html = `<meta data-name="x" data-content="tracking" property="og:title" content="本当の題名">`;
    expect(parsePreview(html)).toEqual({ title: "本当の題名", siteName: null });
  });

  it("引用符の中の > でタグを切らない", () => {
    expect(
      parsePreview(
        `<meta property="og:title" content="Docs > API"><meta content='A > B' property="og:site_name">`,
      ),
    ).toEqual({ title: "Docs > API", siteName: "A > B" });
  });

  it("引用符の中の name= は属性と見なさず、引用符のすぐ後に続く属性も読む", () => {
    expect(
      parsePreview(`<meta content="user name=email" property="og:title"><title>Home</title>`),
    ).toEqual({ title: "user name=email", siteName: null });
    expect(parsePreview(`<meta property="og:title"content="詰めた属性">`)).toEqual({
      title: "詰めた属性",
      siteName: null,
    });
  });

  it("og:title が無ければ twitter:title、それも無ければ <title> を使う", () => {
    expect(parsePreview(`<meta name="twitter:title" content="T">`)).toEqual({
      title: "T",
      siteName: null,
    });
    expect(parsePreview(`<title>\n  題名 &amp; 副題 &#x3042;\n</title>`)).toEqual({
      title: "題名 & 副題 あ",
      siteName: null,
    });
  });

  it("題名が無い・空なら null", () => {
    expect(parsePreview("<p>本文だけ</p>")).toBeNull();
    expect(parsePreview("<title>   </title>")).toBeNull();
  });

  it("長すぎる題名は切って … を付ける", () => {
    const { title } = parsePreview(`<title>${"あ".repeat(500)}</title>`)!;
    expect(title).toHaveLength(TITLE_MAX_LENGTH);
    expect(title.endsWith("…")).toBe(true);
  });

  it("切るところに絵文字や合成した文字があっても、途中で割らない", () => {
    const head = "あ".repeat(TITLE_MAX_LENGTH - 2);
    expect(parsePreview(`<title>${head}😀😀😀</title>`)!.title).toBe(`${head}😀…`);
    expect(parsePreview(`<title>${head}👨‍👩‍👧👨‍👩‍👧👨‍👩‍👧</title>`)!.title).toBe(`${head}👨‍👩‍👧…`);
    expect(parsePreview(`<title>${head}か\u3099か\u3099か\u3099</title>`)!.title).toBe(
      `${head}か\u3099…`,
    );
  });
});

describe("parsePreview: 行儀の悪い HTML", () => {
  it("= の直後でない引用符 (値の中のインチ記号やアポストロフィ) は値の始まりと見なさず、後ろのタグを読み違えない", () => {
    const tail = `<title>T</title><a href="/x" id=a">`;
    expect(
      parsePreview(
        `<meta name="description" content="A 27" monitor"><meta property="og:title" content="Real">${tail}`,
      ),
    ).toEqual({ title: "Real", siteName: null });
    expect(
      parsePreview(
        `<meta name=description content=It's><meta property="og:title" content="Real"><title>Fallback</title><p>Don't</p>`,
      ),
    ).toEqual({ title: "Real", siteName: null });
  });

  it("小文字にすると長さの変わる文字 (İ) があっても、題名やタグの位置がずれない", () => {
    expect(parsePreview("<title>İstanbul Haberleri</title>")!.title).toBe("İstanbul Haberleri");
    expect(
      parsePreview(
        '<title>İstanbul</title><meta  property="og:title" content="Real"><meta property="og:site_name" content="S">',
      ),
    ).toEqual({ title: "Real", siteName: "S" });
  });

  it("別のタグの属性値・コメント・script の中の <title> や <meta> は読まない", () => {
    expect(
      parsePreview(
        '<meta name="description" content="Use the <title> element"><title>Real</title>',
      ),
    ).toEqual({ title: "Real", siteName: null });
    expect(
      parsePreview('<!-- <meta property="og:title" content="Old"> --><title>Real</title>'),
    ).toEqual({ title: "Real", siteName: null });
    expect(
      parsePreview('<script>const t = "<title>Fake</title>";</script><title>Real</title>'),
    ).toEqual({ title: "Real", siteName: null });
  });

  it("中身の空の meta は、後ろにある同じキーや name の方を隠さない", () => {
    expect(
      parsePreview(
        '<meta property="og:title" content=""><meta property="og:title" content="Real"><title>T</title>',
      ),
    ).toEqual({ title: "Real", siteName: null });
    expect(parsePreview('<meta property="" name="og:title" content="X">')).toEqual({
      title: "X",
      siteName: null,
    });
  });

  it("長い題名の前の空白 (文字参照で書いたものも) は数えず、文字参照で書いた空白も詰める", () => {
    expect(parsePreview(`<title>${" ".repeat(4000)}Real</title>`)!.title).toBe("Real");
    expect(parsePreview(`<title>${"&#32;".repeat(700)}Real</title>`)!.title).toBe("Real");
    expect(parsePreview(`<title>${"&nbsp;".repeat(540)}Real</title>`)!.title).toBe("Real");
    expect(parsePreview("<title>&#10;&#10;Hello&#9;&#9;World&nbsp;&nbsp;x</title>")!.title).toBe(
      "Hello World x",
    );
  });

  it("文字数 (書記素) が上限に収まっても、長すぎて途中で切った題名には … を付ける", () => {
    // 1 文字が 25 単位 (a と結合文字 24 個) の 150 文字
    const title = parsePreview(`<title>${`a${"\u0301".repeat(24)}`.repeat(150)}</title>`)!.title;
    expect(title.endsWith("…")).toBe(true);
  });

  it("空のコメント (<!--> / <!--->) や --!> で終わるコメントの後ろも読む", () => {
    expect(parsePreview("<!--><title>Real</title>")!.title).toBe("Real");
    expect(parsePreview("<!---><title>Real</title>")!.title).toBe("Real");
    expect(parsePreview("<head><!-- banner --!><title>Real</title></head>")!.title).toBe("Real");
  });

  it("終わりのタグの名前の後ろは HTML の空白 (半角) でだけ区切る", () => {
    expect(
      parsePreview(
        '<head><script>s = "</script\u00a0><title>Fake</title>";</script><title>Real</title></head>',
      )!.title,
    ).toBe("Real");
  });

  it("Object の持つ名前 (constructor など) の文字参照は、知らない名前としてそのまま見せる", () => {
    expect(parsePreview("<title>A &constructor; &toString; B</title>")!.title).toBe(
      "A &constructor; &toString; B",
    );
  });

  it("128〜159 の番号の文字参照は、ブラウザと同じく windows-1252 の記号にする", () => {
    expect(parsePreview("<title>News &#151; Today&#146;s &#133;</title>")!.title).toBe(
      "News — Today’s …",
    );
  });

  it("<body> から先 (SVG のアイコンの <title> など) は読まない", () => {
    expect(
      parsePreview("<head><title>Page</title></head><body><svg><title>Icon</title></svg>"),
    ).toEqual({ title: "Page", siteName: null });
    expect(parsePreview("<head></head><body><svg><title>Menu</title></svg>")).toBeNull();
  });

  it("noembed / noframes の中の <title> は読まず、名前が続く別の終わりのタグで題名を終わらせない", () => {
    expect(parsePreview("<noembed><title>Fake</title></noembed><title>Real</title>")!.title).toBe(
      "Real",
    );
    expect(parsePreview("<noframes><title>Fake</title></noframes><title>Real</title>")!.title).toBe(
      "Real",
    );
    expect(parsePreview("<title>abc</titlex>def</title>")!.title).toBe("abc</titlex>def");
    expect(
      parsePreview(
        '<script>a = "</scripts"; b = "<title>Fake</title>"</script><title>Real</title>',
      )!.title,
    ).toBe("Real");
  });

  it("meta- で始まる別の要素は <meta> と見なさない", () => {
    expect(
      parsePreview(`<meta-card property="og:title" content="Fake"></meta-card><title>Real</title>`),
    ).toEqual({ title: "Real", siteName: null });
  });

  it("文字参照を戻すと空になる og:title は飛ばして、次の候補を使う", () => {
    expect(parsePreview(`<meta property="og:title" content="&nbsp;"><title>Real</title>`)).toEqual({
      title: "Real",
      siteName: null,
    });
  });

  it("全角の空白は詰めない (HTML が詰めるのは半角の空白だけ)", () => {
    expect(parsePreview("<title>ポイ　メモ</title>")!.title).toBe("ポイ　メモ");
    // 引用符の無い値も、全角の空白では終わらない
    expect(parsePreview("<meta property=og:title content=記事　題名>")!.title).toBe("記事　題名");
  });

  it("題名によく使う記号の文字参照を戻し、対になっていないサロゲートは置き換え文字にする", () => {
    expect(parsePreview("<title>A &mdash; B &hellip; &rsquo;&laquo;&raquo;</title>")!.title).toBe(
      "A — B … ’«»",
    );
    expect(parsePreview("<title>&#xD800;x</title>")!.title).toBe("\uFFFDx");
  });

  it("閉じない引用符や閉じないタグが大量に並んでも、すぐに終わる (取ってくる上限の 128 KiB で)", () => {
    const size = 128 * 1024;
    for (const unit of [
      '<meta "',
      "<meta '",
      "<meta ",
      '<meta a="x" ',
      "<title ",
      "<meta <title ",
      "<!--a-->",
      "<!--a--!>",
    ]) {
      const html = unit.repeat(Math.ceil(size / unit.length));
      const started = performance.now();
      parsePreview(html);
      charsetOf(null, html.slice(0, 1024));
      // 線形なら数 ms。ゆとりを大きく取る (2 乗で増える書き方だと 1 秒を超える)
      expect(performance.now() - started).toBeLessThan(500);
    }
    const started = performance.now();
    parsePreview(`<title>${"あ".repeat(size)}</title>`);
    expect(performance.now() - started).toBeLessThan(500);
  });
});

describe("charsetOf", () => {
  it("<meta> の charset 属性と http-equiv の content だけを見る (説明文の中の charset= は見ない)。meta の utf-16 は utf-8", () => {
    expect(
      charsetOf(
        null,
        '<meta name="description" content="How to set charset=utf-16 in HTML"><meta charset="euc-jp">',
      ),
    ).toBe("euc-jp");
    expect(charsetOf(null, '<meta charset="utf-16">')).toBe("utf-8");
    expect(charsetOf(null, '<meta charset="x-user-defined">')).toBe("windows-1252");
    // ラベルは文字コードの名前に直してから比べ、知らないラベルは見なかったことにする
    expect(charsetOf(null, '<meta charset="unicode">')).toBe("utf-8");
    expect(charsetOf("text/html; charset=bogus", '<meta charset="shift_jis">')).toBe("shift_jis");
    expect(charsetOf(null, '<meta charset="bogus"><meta charset="euc-jp">')).toBe("euc-jp");
  });

  it("Content-Type の charset を先に見て、無ければ <meta charset>、それも無ければ utf-8", () => {
    expect(charsetOf("text/html; charset=Shift_JIS", '<meta charset="euc-jp">')).toBe("shift_jis");
    expect(charsetOf("text/html", '<meta charset="EUC-JP">')).toBe("euc-jp");
    expect(
      charsetOf(null, '<meta http-equiv="Content-Type" content="text/html; charset=shift_jis">'),
    ).toBe("shift_jis");
    expect(charsetOf(null, "<html>")).toBe("utf-8");
  });
});
