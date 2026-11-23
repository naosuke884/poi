// セクションの保持期間 (日数)。全員同じで、変える設定は無い。「1 ヶ月」は 30 日固定とし、暦月は扱わない。
// UI 側 (src/) からもこのファイルを参照して日数を表示する。
export const MEMO_TTL_DAYS = 30;

export const DAY_MS = 24 * 60 * 60 * 1000;

// 板全体の文字数 (boardLength) で、セクションの間に数えるもの (改行 3 つ = 空行 2 つ)。
// 以前は板を 1 つのテキストとしてこれで区切り、入力にこれが入るとセクションを分けていた。その仕組みは無くした
// (セクションの中に空行をいくつ続けてもよい) が、ここで数えるのはやめない: やめると BOARD_MAX_LENGTH の意味が変わり、
// 上限近くまで書いた板が保存できるかどうかがクライアントの版によって食い違う
export const SECTION_SEPARATOR = "\n\n\n";

// バリデーション上限。API (worker/board/routes.ts) と UI (文字数カウンタ / 保存前チェック) で共有する
// 板全体の文字数 (セクションを区切りで連結したときの長さ)
export const BOARD_MAX_LENGTH = 20_000;
// 板のセクション数
export const BOARD_MAX_SECTIONS = 1_000;

// タグ。登録しておいたものから、セクションごとに 1 つ選んで付ける。
// API (worker/board/routes.ts) と UI (タグを選ぶ欄) で共有する
// 登録できるタグの数
export const TAG_MAX_REGISTERED = 30;
// タグ 1 つの文字数
export const TAG_MAX_LENGTH = 20;

// タグのアイコン。登録したとき (と名前を変えたとき) に、名前に合うものをサーバが選ぶ (worker/board/tag-icon.ts)。
// 値はモデルに選ばせる候補の説明 (この文を読んで選ぶので、どんな名前のタグに合うかを書く)。
// 形は src/routes/board/-components/board/TagIcon.tsx に置く
export const TAG_ICONS = {
  home: "家、住まい、家のこと、引っ越し",
  cleaning: "家事、掃除、洗濯",
  repair: "修理、DIY、メンテナンス",
  garbage: "ゴミ出し、捨てるもの、不要品",
  bath: "お風呂、入浴、温泉",
  key: "鍵、合鍵、住まいの契約",
  building: "マンション、不動産、会社の建物",
  shopping: "買い物、買うもの、ほしいもの",
  groceries: "日用品、食材の買い出し、スーパー",
  clothes: "服、ファッション、着るもの",
  beauty: "美容、コスメ、身だしなみ",
  plant: "植物、園芸、家庭菜園",
  pet: "ペット、動物",
  flower: "花、フラワー",
  tree: "木、森、公園",
  baby: "子ども、育児、子育て",
  people: "人、家族、友人、連絡先",
  love: "恋愛、好きなもの、大切なもの",
  gift: "プレゼント、贈り物",
  party: "イベント、パーティー、お祝い、誕生日",
  chat: "会話、チャット、話したいこと",
  reminder: "リマインダー、通知、忘れないように",
  food: "料理、レシピ、献立、食事、飲食店",
  cafe: "カフェ、コーヒー、お茶",
  drink: "お酒、飲み会、バー",
  sweets: "お菓子、スイーツ、ケーキ",
  pizza: "ピザ、ファストフード、出前",
  salad: "野菜、サラダ、ヘルシーな食事",
  fish: "魚、釣り、海鮮",
  bread: "パン、パン屋、朝ごはん",
  wine: "ワイン、乾杯",
  icecream: "アイス、夏のおやつ",
  money: "お金、家計、支出、家計簿",
  bank: "銀行、税金、役所、手続き",
  receipt: "領収書、レシート、請求書、経費",
  invest: "投資、株、資産、数字の推移",
  insurance: "保険、防犯、守ること",
  coin: "小銭、ポイント、おこづかい",
  card: "クレジットカード、支払い、サブスク",
  savings: "貯金、節約",
  store: "お店、店舗、商店",
  health: "健康、体調、記録",
  medicine: "薬、服薬",
  hospital: "病院、通院、診察",
  exercise: "運動、筋トレ、ジム、ダイエット",
  sports: "スポーツ、球技、観戦",
  sleep: "睡眠、夜、寝る前",
  mood: "気分、感情、日記の気持ち",
  dental: "歯医者、歯",
  eye: "目、視力、眼科",
  mental: "メンタル、心、考えごと",
  running: "ランニング、ジョギング、マラソン",
  swimming: "水泳、プール",
  yoga: "ヨガ、ストレッチ、瞑想",
  injury: "けが、応急手当",
  sick: "風邪、感染症、体調不良",
  work: "仕事、業務、作業の記録、会議",
  document: "書類、資料、文書、契約",
  mail: "メール、手紙、連絡",
  phone: "電話、連絡先、通話",
  study: "勉強、学校、資格",
  presentation: "プレゼン、発表、スライド",
  career: "就活、転職、採用、名刺",
  analytics: "分析、統計、集計、KPI",
  language: "語学、英語、外国語、翻訳",
  science: "科学、研究、実験",
  math: "数学、計算",
  book: "本、読書、読みたいもの",
  news: "ニュース、記事、時事",
  writing: "書くこと、文章、ブログ、下書き",
  journal: "日記、ノート、記録、振り返り",
  idea: "アイデア、思いつき、ひらめき",
  goal: "目標、目的、今年やること",
  project: "プロジェクト、新しい取り組み、リリース",
  todo: "やること、タスク、TODO、チェックリスト",
  schedule: "予定、日程、カレンダー、約束",
  deadline: "締め切り、時間、期限",
  habit: "習慣、毎日やること、ルーティン",
  waiting: "待ち、保留、返事待ち",
  inbox: "受信箱、未整理、とりあえず置く",
  archive: "アーカイブ、しまっておくもの、過去のもの",
  important: "重要、お気に入り、大事なこと",
  hot: "やる気、流行、急ぎ",
  trophy: "達成、優勝、成果",
  question: "疑問、質問、調べること",
  warning: "注意、トラブル、気をつけること",
  quote: "名言、引用、言葉",
  link: "リンク集、URL、参考サイト",
  bookmark: "ブックマーク、あとで読む、保存したリンク",
  code: "プログラミング、開発、コード",
  bug: "バグ、不具合、障害",
  database: "データベース、データ",
  cloud: "クラウド、オンラインサービス",
  git: "Git、ブランチ、バージョン管理",
  terminal: "コマンド、ターミナル、シェル",
  network: "ネット、Wi-Fi、通信",
  server: "サーバー、インフラ、運用",
  ai: "AI、機械学習、ロボット",
  computer: "パソコン、PC、ガジェット",
  smartphone: "スマホ、アプリ",
  security: "パスワード、セキュリティ、秘密",
  settings: "設定、環境構築、カスタマイズ",
  api: "API、エンドポイント、REST",
  json: "JSON、データ形式、設定ファイル",
  container: "Docker、コンテナ、Kubernetes",
  package: "パッケージ、ライブラリ、依存関係、npm",
  test: "テスト、検証、QA",
  pull_request: "プルリクエスト、コードレビュー",
  merge: "マージ、統合、コンフリクト",
  commit: "コミット、変更履歴",
  fork: "フォーク、派生、OSS",
  deploy: "デプロイ、本番反映、リリース作業",
  auth: "認証、権限、脆弱性対策",
  cpu: "CPU、ハードウェア、低レイヤー",
  monitoring: "監視、モニタリング、アラート、メトリクス",
  performance: "パフォーマンス、速度改善、負荷",
  logs: "ログ、出力、トレース",
  investigate: "コードリーディング、調査、原因究明",
  diff: "差分、diff、変更点",
  sql: "SQL、クエリ",
  regex: "正規表現",
  binary: "バイナリ、ビット演算",
  architecture: "設計、アーキテクチャ、構成図",
  sitemap: "画面遷移、サイトマップ、ページ構成",
  distributed: "ネットワーク構成、分散システム、マイクロサービス",
  router: "ルーター、DNS、インフラのネットワーク機器",
  web: "Web、サイト、ドメイン",
  browser: "ブラウザ、フロントエンド、Web アプリ",
  ui: "UI、レイアウト、画面設計",
  components: "コンポーネント、デザインシステム",
  prompt: "プロンプト、LLM への指示",
  chatbot: "チャットボット、LLM、生成 AI との会話",
  automation: "自動化、CI/CD、ワークフロー、バッチ",
  variable: "変数、命名",
  function: "関数、アルゴリズム",
  lambda: "関数型プログラミング、サーバーレス",
  webhook: "Webhook、イベント連携",
  plugin: "プラグイン、拡張機能、外部連携",
  keyboard: "キーボード、ショートカット、エディタ",
  review: "レビュー、チェック項目、受け入れ確認",
  version: "バージョン、アップデート、リリースノート",
  devops: "DevOps、継続的改善",
  dashboard: "ダッシュボード、管理画面",
  table: "表、スプレッドシート、テーブル設計",
  schema: "スキーマ、データモデル、ER 図",
  markdown: "Markdown、ドキュメント、README",
  music: "音楽、曲、ライブ",
  podcast: "ポッドキャスト、ラジオ、録音、話すこと",
  movie: "映画、ドラマ、動画、アニメ、観たいもの",
  game: "ゲーム、遊び",
  photo: "写真、カメラ、撮影",
  art: "絵、デザイン、アート、創作",
  puzzle: "パズル、クイズ、謎解き",
  board_game: "将棋、チェス、ボードゲーム",
  cards: "カードゲーム、トランプ",
  piano: "ピアノ、楽器の練習",
  craft: "手芸、裁縫、編み物",
  headphones: "ヘッドホン、聴きたいもの",
  ticket: "チケット、ライブ、公演、予約",
  theater: "演劇、舞台、ミュージカル",
  travel: "旅行、海外、飛行機",
  place: "場所、行きたいところ、お店の場所、地図",
  outdoor: "登山、アウトドア、自然",
  camp: "キャンプ",
  walk: "散歩、ウォーキング",
  stay: "宿泊、ホテル、寝具",
  map: "地図、ルート、旅程",
  compass: "方向、探検、行き先探し",
  luggage: "荷物、旅の持ち物、出張",
  bus: "バス、高速バス",
  ship: "船、フェリー、クルーズ",
  beach: "海、夏、ビーチ",
  world: "世界、国際、地球",
  car: "車、運転、ドライブ",
  train: "電車、通勤、乗り換え",
  bike: "自転車、サイクリング",
  weather: "天気、晴れ、季節",
  rain: "雨、梅雨、傘",
  winter: "冬、雪、スキー",
  nature: "自然、エコ、秋",
  recycle: "リサイクル、再利用",
  other: "上のどれにも当てはまらない",
} as const;
export type TagIcon = keyof typeof TAG_ICONS;
/** アイコンを選べなかったとき (選ぶ仕組みが無い・失敗した・どれにも当てはまらない) のアイコン */
export const TAG_ICON_FALLBACK: TagIcon = "other";

/**
 * 入力されたタグを登録する形にする: 前後の空白と先頭の # を落とし、途中の空白の並びは半角スペース 1 つにする。
 * タグにできない (空になる / 長すぎる) ときは null。
 * # を落とすのは、「#買い物」と打つ人と「買い物」と打つ人で別のタグにならないようにするため
 */
export function normalizeTag(input: string): string | null {
  // # と空白は先頭から続くぶんをまとめて落とす (# を 1 かたまりだけ落とすと「# #a」が「#a」になり、
  // サーバの「normalizeTag を通した形か」の確かめ (worker/board/routes.ts) で断られる)
  const tag = input
    .replace(/\s+/g, " ")
    .trim()
    .replace(/^[#＃\s]+/, "");
  return tag === "" || tag.length > TAG_MAX_LENGTH ? null : tag;
}

/** 板全体の文字数 (セクションを区切りで連結したときの長さ)。BOARD_MAX_LENGTH と比べる */
export function boardLength(sections: { content: string }[]): number {
  return (
    sections.reduce((n, s) => n + s.content.length, 0) +
    Math.max(0, sections.length - 1) * SECTION_SEPARATOR.length
  );
}

/** 作成日時から有効期限を計算する */
export function memoExpiresAt(createdAt: Date = new Date()): Date {
  return new Date(createdAt.getTime() + MEMO_TTL_DAYS * DAY_MS);
}
