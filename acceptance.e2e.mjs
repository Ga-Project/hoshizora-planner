/**
 * 星空撮影プランナー 受入E2E — コンソール check_items の機械実行版。
 * キーは check_items.key と一致させること。
 *
 * 方針: 実装内部を覗かず、人間の受入手順と同じ操作（地点・日付を選ぶ／切り替える）だけで判定する。
 */
const LOC = 'select[aria-label="観測地"]';
const DATE = 'input[aria-label="日付"]';
const LAT = 'input[aria-label="緯度"]';
const LON = 'input[aria-label="経度"]';
const THEME = 'button[aria-label="配色を切り替え"]';

const SUMMER = "2026-08-01"; // 東京では天の川が夜に見頃
const WINTER = "2026-12-15"; // 東京では夜の暗い時間に十分な高度まで昇らない

// 日付欄への入力: 標準の fillDate は native <input type="date"> への打鍵が
// ヘッドレスのロケール(セグメント順)に依存して壊れる(2026-08-01→10820-02-06)。
// ユーザーが日付を選んだのと同じ結果を確実に得るため、React 制御値を直接セットして
// input/change を発火する（描画される結果は本物を検証する）。
async function setDate(h, iso) {
  await h.page.$eval(
    'input[aria-label="日付"]',
    (el, v) => {
      const proto = window.HTMLInputElement.prototype;
      const setter = Object.getOwnPropertyDescriptor(proto, "value").set;
      setter.call(el, v);
      el.dispatchEvent(new Event("input", { bubbles: true }));
      el.dispatchEvent(new Event("change", { bubbles: true }));
    },
    iso,
  );
  await h.wait(250);
  const got = await h.page.$eval('input[aria-label="日付"]', (el) => el.value);
  if (got !== iso) throw new Error(`日付を設定できません（欄の値: ${got}）`);
}

async function setup(h, { loc = "tokyo", date = SUMMER } = {}) {
  await h.goto("/");
  await h.select(LOC, loc);
  await setDate(h, date);
  await h.wait(200);
}

export const items = {
  /** 地点と夏の日付を選ぶと「今夜のおすすめ」に 時刻・方角・高度 が出る（中核機能・blocking） */
  "tonight-answer": async (h) => {
    await setup(h, { loc: "tokyo", date: SUMMER });
    await h.expectText("今夜のおすすめ");
    await h.expectMatch(/\d{1,2}:\d{2}/, "見頃ピークの時刻");
    await h.expectMatch(/方位\s*\d{1,3}°/, "方角（方位角）");
    await h.expectMatch(/\d{1,2}°/, "高度");
    await h.expectMatch(/見頃の時間/, "見頃の時間帯");
  },

  /** 夜のタイムライン（帯）が描画される（中核機能・blocking） */
  "timeline-render": async (h) => {
    await setup(h, { loc: "tokyo", date: SUMMER });
    await h.expectText("夜のタイムライン");
    await h.expectSelector("svg.timeline__svg");
    await h.expectText("天の川の高度");
  },

  /** 月明かりの状況（月齢・照度）が表示される */
  "moon-note": async (h) => {
    await setup(h, { loc: "tokyo", date: SUMMER });
    await h.expectText("月明かり");
    await h.expectMatch(/照度\s*\d{1,3}%/, "月の照度");
  },

  /** 地点を変えると結果が変わる（東京→那覇で高度が変わる） */
  "location-change": async (h) => {
    await setup(h, { loc: "tokyo", date: SUMMER });
    const before = await h.text();
    await h.select(LOC, "naha");
    await h.wait(250);
    const after = await h.text();
    if (before === after) throw new Error("地点を変えても結果が変わりません");
    h.note("東京→那覇で結果が更新された");
  },

  /** 見頃でない夜は時刻を出さず「見頃ではありません」と正直に示す（夏→冬） */
  "date-change-nogo": async (h) => {
    await setup(h, { loc: "tokyo", date: SUMMER });
    await h.expectMatch(/\d{1,2}:\d{2}/, "夏は見頃時刻あり");
    await setDate(h, WINTER);
    await h.wait(250);
    await h.expectText("見頃ではありません");
    h.note("夏（見頃あり）→冬（見頃なし）で結果が変化");
  },

  /** 緯度・経度を手動入力しても計算できる */
  "manual-coords": async (h) => {
    await h.goto("/");
    await h.select(LOC, "manual");
    await h.fill(LAT, "24.40"); // 石垣島付近（南）→ 天の川が高く昇る
    await h.fill(LON, "124.16");
    await setDate(h, SUMMER);
    await h.wait(250);
    await h.expectText("今夜のおすすめ");
    await h.expectMatch(/\d{1,2}°/, "高度が計算される");
  },

  /** 明るい/暗い表示を切り替えられる */
  "theme-toggle": async (h) => {
    await setup(h, { loc: "tokyo", date: SUMMER });
    const before = await h.bgColor();
    await h.click(THEME);
    await h.wait(300);
    const after = await h.bgColor();
    if (before === after)
      throw new Error(`配色が変わりません（${before} のまま）`);
    h.note(`背景色 ${before} → ${after}`);
  },

  /** スマホ幅で横スクロールが出ない */
  responsive: async (h) => {
    await h.viewport(390, 780);
    await setup(h, { loc: "tokyo", date: SUMMER });
    await h.expectNoHorizontalOverflow();
  },

  /** 計算の考え方・免責・プライバシーが読める */
  "about-privacy": async (h) => {
    await h.goto("/about/");
    await h.expectMatch(/出典|計算/, "計算の考え方");
    await h.expectMatch(/免責|責任/, "免責");
    await h.expectMatch(/プライバシー|cookie|個人/, "プライバシー");
  },
};

/**
 * デザイン確認用の画面（受入の合否には関与しない）。
 * 代表はこの画像だけを見て違和感を判定するので、値が入って結果が出ている状態を作る。
 */
export const designStates = {
  "main-populated": async (h) => {
    await setup(h, { loc: "tokyo", date: SUMMER });
    await h.expectText("今夜のおすすめ");
  },
  dark: async (h) => {
    await setup(h, { loc: "tokyo", date: SUMMER });
    await h.click(THEME);
    await h.wait(300);
  },
};
