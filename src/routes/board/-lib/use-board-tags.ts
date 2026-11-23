import { createContext, useEffect, useMemo, useRef, useState } from "react";

import type { EditableSection } from "./data/board";
import { writeCachedTags } from "./data/board-cache";
import { fetchTags, registerTag, renameTag, type Tag, unregisterTag } from "./data/tags";
import {
  ALL_SECTIONS,
  effectiveTagId,
  matchesFilter,
  type TagFilter,
  useTagFilter,
} from "./tag-filter";

/**
 * 板の登録済みのタグ (Board が持つ)。開いているタグを選ぶ欄 (SectionTags) はここから読む: props で渡すと、
 * 登録のたびに全セクションを描き直す。Context なら、変わったときに描き直すのは開いている欄だけ
 */
export const BoardTagsContext = createContext<Tag[]>([]);

const indexById = (tags: Tag[]) => new Map(tags.map((t) => [t.id, t]));

/** 同じ並びで、どのタグの名前とアイコンも同じか */
function sameTags(a: Tag[], b: Tag[]): boolean {
  return (
    a.length === b.length &&
    a.every((t, i) => t.id === b[i]!.id && t.name === b[i]!.name && t.icon === b[i]!.icon)
  );
}

/**
 * 板の登録済みのタグと、タグでの絞り込み。
 * - 一覧は開いた時点のもの (initial) から始め、この画面での登録・名前の変更・削除の返事と、取り直した一覧
 *   (板の取り直し (setFetched) やタグを選ぶ欄を開いたとき (reload)) で更新する
 * - 返事や取り直しは、送った順にも、サーバで書かれた順にも届くとは限らない。古い一覧で新しい一覧を戻さないよう、
 *   手元でタグを変えた後に届いた「それより前に取りに行った一覧」は使わず、変更が重なったときは
 *   全部の返事が届いたところで一覧を取り直す (changeTags)
 * - 絞り込み (useTagFilter) はタグの id で持つので、名前を変えても絞り込んだまま。
 *   一覧に無くなったタグ (登録を消された) での絞り込みは「すべて」に戻す
 * readOnly (オフラインでキャッシュから表示している) の間は、一覧が無くなったことにしない (キャッシュの一覧は古いことがある)
 */
export function useBoardTags({
  initial,
  userId,
  readOnly,
}: {
  initial: Tag[];
  userId: string;
  readOnly: boolean;
}) {
  const [tags, setTagsState] = useState(initial);
  const tagsRef = useRef(tags);
  // id → タグ。ハンドラはこちらを読む: 返事を受けたらすぐ (描き直す前に) 変える。返事で作ったタグをそのまま付けたとき、
  // 絞り込みから外れて隠れるか (フォーカスを動かすか) を、そのタグを知っている一覧で決めるため
  const byIdRef = useRef(indexById(initial));
  // 各タグをこの画面が初めて一覧で知った時刻 (performance.now()。開いたときの一覧は 0)。registeredAsOf が使う
  const firstSeenRef = useRef(new Map(initial.map((t) => [t.id, 0])));
  /** 一覧を差し替える。中身が同じなら前のものを使う (取り直すたびに板と絞り込みのバーを描き直さないように) */
  const apply = (next: Tag[]) => {
    if (sameTags(tagsRef.current, next)) return tagsRef.current;
    tagsRef.current = next;
    byIdRef.current = indexById(next);
    const now = performance.now();
    for (const t of next) if (!firstSeenRef.current.has(t.id)) firstSeenRef.current.set(t.id, now);
    setTagsState(next);
    // オフラインで開いたときにタグの名前と絞り込みを出せるよう、キャッシュの一覧も新しくする
    // (板を取り直したときもここで書く: 上の順番の確かめを通った一覧だけを残すため)
    if (!readOnly) writeCachedTags(userId, next);
    return next;
  };

  // 最後に手元でタグを変えた (登録・名前の変更・削除の返事を受けた) 時刻 (performance.now())。
  // それより前に取りに行った一覧は、変える前のものかもしれないので使わない (使うと、名前を変えたばかりのタグが
  // 古い名前に戻って見える)
  const changedAtRef = useRef(0);
  // 返事を待っている変更の数と、その間に別の変更が重なったか。
  // 重なった変更の返事は、どれがサーバで後に書かれたものか分からない (登録はアイコンを選ぶ間、書くのを数秒待つ。
  // 送った順や返事の届いた順とは限らない)。届いた返事はそのまま使い、全部の返事が届いたところで一覧を取り直す
  // 断られた変更 (別の場所で消されたタグの名前を変えようとしたなど) の後も、手元の一覧が古いと分かるので取り直す
  const changesRef = useRef({ pending: 0, refetch: false });
  // 変更の返事を待っている間 (と、重なった変更の後に一覧を取り直している間)。その間の一覧は途中のものかもしれない
  const [settling, setSettling] = useState(false);

  /** requestedAt (performance.now()) に取りに行った一覧を使う。その後に手元でタグを変えていれば使わない */
  const setFetched = (list: Tag[], requestedAt: number) =>
    requestedAt < changedAtRef.current ? tagsRef.current : apply(list);

  const reload = async () => {
    const requestedAt = performance.now();
    return setFetched(await fetchTags(), requestedAt);
  };

  const changeTags = async (send: () => Promise<Tag[]>) => {
    const changes = changesRef.current;
    changes.pending++;
    if (changes.pending > 1) changes.refetch = true;
    setSettling(true);
    try {
      const list = await send();
      changedAtRef.current = performance.now();
      return apply(list);
    } catch (e) {
      changes.refetch = true;
      throw e;
    } finally {
      changes.pending--;
      // 取り直している間に新しい変更が始まっていれば、落ち着いたとするのはその変更の後
      const settled = () => {
        if (changes.pending === 0) setSettling(false);
      };
      if (changes.pending === 0 && changes.refetch) {
        changes.refetch = false;
        reload()
          .catch(() => {})
          .finally(settled);
      } else {
        settled();
      }
    }
  };

  // 開いたときの一覧もキャッシュに書く (キャッシュの一覧を書くのはこの hook だけにして、古い一覧で上書きされないように)
  useEffect(() => {
    if (!readOnly) writeCachedTags(userId, tagsRef.current);
    // 開いたときに一度だけ (userId / readOnly が変わるときは Board ごと作り直される)
  }, []);

  const byId = useMemo(() => indexById(tags), [tags]);

  // 絞り込み。選べるタグ (一覧) に無いタグで絞り込んだままにはしない (何も出ない板になる)。
  // タグが 1 つも無いときも絞り込まない: 絞り込みのバーが出ないので、「タグなし」のままだと見えない絞り込みが残り、
  // 後でタグを付けたセクションが黙って隠れる
  const [storedFilter, setFilter] = useTagFilter(userId);
  const filter: TagFilter =
    tags.length === 0 || (storedFilter.kind === "tag" && !byId.has(storedFilter.tagId))
      ? ALL_SECTIONS
      : storedFilter;
  const filterRef = useRef(filter);
  filterRef.current = filter;
  // 選べなくなったタグでの絞り込みは、覚えている側 (useTagFilter) からも消す (タグは消すと id ごと無くなるので、
  // 残しても戻ってこない)。オフラインの閲覧 (readOnly) では消さない: キャッシュの一覧は古いことがあるので、
  // つながったときに戻せるよう残す。タグの変更の返事を待っている間も消さない (重なった変更では、途中の古い一覧が届くことがある)
  const filterGone = !readOnly && !settling && filter !== storedFilter;
  useEffect(() => {
    if (filterGone) setFilter(ALL_SECTIONS);
  }, [filterGone, setFilter]);

  return {
    /** 登録済みのタグ (登録した順) と、id → タグ */
    tags,
    byId,
    /** 今の絞り込み */
    filter,
    setFilter,
    /** 今の絞り込みに当てはまる (画面に出す) セクションか。描画を待たずに最新の一覧と絞り込みで答える */
    isShown: (s: Pick<EditableSection, "tagId">) =>
      matchesFilter(s, filterRef.current, byIdRef.current),
    /** 今の登録済みのタグ (id → タグ)。描き直しを待たずに最新 */
    byIdNow: () => byIdRef.current,
    /**
     * requestedAt (performance.now()) に取りに行った板に手元の変更を重ねるとき、登録済みとして扱うタグの id:
     * その板と一緒に届いた一覧 (list) と、その後にこの画面が初めて知ったタグ。後者を足すのは、取りに行った後に
     * 作って付けたタグが、その板の一覧に無いせいで「消されたタグ」として外されないようにするため
     */
    registeredAsOf: (list: Tag[], requestedAt: number): ReadonlySet<string> => {
      const ids = new Set(list.map((t) => t.id));
      for (const [id, at] of firstSeenRef.current) if (at > requestedAt) ids.add(id);
      return ids;
    },
    /** 画面に出すタグ (付いていないか、登録に無い id なら undefined) */
    tagOf: (s: Pick<EditableSection, "tagId">) => {
      const id = effectiveTagId(s.tagId, byIdRef.current);
      return id === null ? undefined : byIdRef.current.get(id);
    },
    setFetched,
    reload,
    register: (name: string) => changeTags(() => registerTag(name)),
    rename: (tag: Tag, newName: string) => changeTags(() => renameTag(tag, newName)),
    unregister: (id: string) => changeTags(() => unregisterTag(id)),
  };
}
