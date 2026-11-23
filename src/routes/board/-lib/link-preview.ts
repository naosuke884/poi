import type { InferResponseType } from "hono/client";
import { type RefObject, useEffect, useReducer } from "react";

import { api } from "@/lib/api";

type LinkPreview = InferResponseType<(typeof api)["link-preview"]["$post"], 200>["preview"];

/**
 * 取れなかった URL を、もう一度取りに行くまで待つ時間。待たずに取り直すと、表示と編集を行き来して
 * リンクを描き直すたびに問い合わせが飛び、リンクの多い板ではレート制限 (1 分に 60 回) を使い切ってしまう
 * (断られた問い合わせも数えられるので、いつまでも題名が出ない)
 */
const RETRY_MS = 60_000;

// 取りに行っている / 取り終えたプレビュー (URL → 題名とサイト名、取れなかったら null)。ページを開いている間だけ持つ
// (端末には残さない: 残すと保存期間を過ぎたメモの中身 (URL と題名) が端末に残る)。
// 通信できなかったときは持たず、RETRY_MS たった後にそのリンクがまた描かれたとき (表示と編集の行き来や、開き直し) に
// 取りに行き直す (つながってから、もう一度取れるように)。画面に出たままのリンクを時間で取り直さないのは、
// 取れない URL が並ぶ板で、出ている間ずっと問い合わせが続いてレート制限を使うため
const inFlight = new Map<string, Promise<void>>();
const failedAt = new Map<string, number>();
// 取り終えたもの。表示と編集を行き来して描き直すたびに、一瞬 URL に戻って見えないように、最初の描画から使う
const settled = new Map<string, LinkPreview>();

/** url のプレビューを取り、settled に入れる (同じ URL を同時に何度も取りに行かない)。失敗しても reject しない */
function loadLinkPreview(url: string): Promise<void> {
  // 同じ URL の別のリンクが先に取り終えていれば取りに行かない (画面に近づくまで待っていたリンクなど)
  if (settled.has(url)) return Promise.resolve();
  const pending = inFlight.get(url);
  if (pending) return pending;
  const failed = failedAt.get(url);
  if (failed !== undefined && Date.now() - failed < RETRY_MS) return Promise.resolve();
  const promise = (async () => {
    try {
      const res = await api["link-preview"].$post({ json: { url } });
      if (!res.ok) throw new Error(`プレビューを取れませんでした (${res.status})`);
      settled.set(url, (await res.json()).preview);
      failedAt.delete(url);
    } catch {
      failedAt.set(url, Date.now());
    } finally {
      inFlight.delete(url);
    }
  })();
  inFlight.set(url, promise);
  return promise;
}

/**
 * リンクの行き先のページの題名。url が null なら取りに行かない。取れるまでと取れなかったときは null。
 * el が画面に近づいてから取りに行く (開いただけで、板じゅうのリンクを取りに行かないように)
 */
export function useLinkTitle(url: string | null, el: RefObject<HTMLElement | null>): string | null {
  // 題名そのものは settled から読む (URL ごとに持つので、URL が変わった直後に前の URL の題名を出さない)。
  // ここでは取り終えたときに描き直すだけ
  const [, loaded] = useReducer((n: number) => n + 1, 0);
  useEffect(() => {
    if (!url || settled.has(url)) return;
    let alive = true;
    const load = () =>
      void loadLinkPreview(url).then(() => {
        if (alive) loaded();
      });
    const target = el.current;
    // IntersectionObserver の無い環境 (テストの jsdom など) では、すぐ取りに行く
    if (!target || typeof IntersectionObserver === "undefined") {
      load();
      return () => {
        alive = false;
      };
    }
    const observer = new IntersectionObserver(
      (entries) => {
        if (!entries.some((e) => e.isIntersecting)) return;
        observer.disconnect();
        load();
      },
      // 画面に入る少し前から取りに行く (スクロールして見えたときには置き換わっているように)
      { rootMargin: "200px 0px" },
    );
    observer.observe(target);
    return () => {
      alive = false;
      observer.disconnect();
    };
  }, [url, el]);
  return url ? (settled.get(url)?.title ?? null) : null;
}

/** テスト用: 取ったプレビューを捨てる */
export function clearLinkPreviewsForTest() {
  inFlight.clear();
  failedAt.clear();
  settled.clear();
}
