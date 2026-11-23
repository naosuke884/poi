import { TAG_ICON_FALLBACK, TAG_ICONS, type TagIcon } from "@shared/constants";

// Jev (TypeSafe の分類モデル。https://typesafe.ai) に、タグの名前に合うアイコンを TAG_ICONS から 1 つ選ばせる。
// 文章を書かせず、候補から選んだものと確からしさだけが返るので、速くて安い (1 回 4,000 トークンほど。0.5 秒ほどで返る)
const JEV_URL = "https://api.typesafe.ai/v1/systemone";
// 登録はこれを待ってから返すので、長くは待たない (間に合わなければ TAG_ICON_FALLBACK)
const TIMEOUT_MS = 3_000;
// これより自信の無い選択は使わない (どれとも言いがたい名前に、それらしくないアイコンを付けない)。
// 候補が多く確からしさが割れやすいので低めにしている (React → コンポーネントが 0.37、Vim → ターミナルが 0.43)
const MIN_CONFIDENCE = 0.35;

const TASK =
  "メモアプリのタグの名前から、そのタグに付けるアイコンとして最もふさわしいものを選ぶ。どれにも当てはまらなければ other";

/**
 * タグの名前に合うアイコン。キーが無い・通信できない・答えが使えないときは TAG_ICON_FALLBACK (例外は投げない:
 * アイコンが選べなくても、タグの登録は失敗させない)。
 * 送るのはタグの名前だけ。名前はメモの中身と同じく利用者のものなので、ログには出さない
 */
export async function chooseTagIcon(
  name: string,
  apiKey: string | undefined,
  fetcher: typeof fetch = fetch,
): Promise<TagIcon> {
  if (!apiKey) return TAG_ICON_FALLBACK;
  try {
    const res = await fetcher(JEV_URL, {
      method: "POST",
      headers: { authorization: `Bearer ${apiKey}`, "content-type": "application/json" },
      body: JSON.stringify({
        model: "jev-latest",
        state: "",
        questions: {
          icon: { type: "choice", instructions: { task: TASK, tag: name }, criteria: TAG_ICONS },
        },
      }),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    if (!res.ok) return TAG_ICON_FALLBACK;
    const answer = ((await res.json()) as { answers?: Record<string, unknown> }).answers?.icon as
      | { type?: unknown; choice?: unknown; confidence?: unknown }
      | undefined;
    if (answer?.type !== "choice" || typeof answer.choice !== "string") return TAG_ICON_FALLBACK;
    if (!Object.hasOwn(TAG_ICONS, answer.choice)) return TAG_ICON_FALLBACK;
    if (typeof answer.confidence === "number" && answer.confidence < MIN_CONFIDENCE) {
      return TAG_ICON_FALLBACK;
    }
    return answer.choice as TagIcon;
  } catch {
    return TAG_ICON_FALLBACK;
  }
}
