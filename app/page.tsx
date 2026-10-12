"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { computeNightPlan } from "../lib/astro.mjs";

// 観測地の入力候補（主要都市。撮影地の「入力」を楽にするための一般的な地理点であり、
// 有料の“国内ダークスカイ地点プリセット”ではない）。手動で緯度経度も入れられる。
const LOCATIONS = [
  { id: "sapporo", label: "札幌", lat: 43.06, lon: 141.35 },
  { id: "sendai", label: "仙台", lat: 38.27, lon: 140.87 },
  { id: "tokyo", label: "東京", lat: 35.68, lon: 139.69 },
  { id: "nagoya", label: "名古屋", lat: 35.18, lon: 136.91 },
  { id: "kanazawa", label: "金沢", lat: 36.56, lon: 136.66 },
  { id: "osaka", label: "大阪", lat: 34.69, lon: 135.5 },
  { id: "hiroshima", label: "広島", lat: 34.4, lon: 132.46 },
  { id: "kochi", label: "高知", lat: 33.56, lon: 133.53 },
  { id: "fukuoka", label: "福岡", lat: 33.59, lon: 130.4 },
  { id: "kagoshima", label: "鹿児島", lat: 31.6, lon: 130.56 },
  { id: "naha", label: "那覇", lat: 26.21, lon: 127.68 },
] as const;

const JST = 540; // 日本標準時 UTC+9（本ツールは国内向け。端末TZに依存せず時刻を確定させる）
const DEFAULT_DATE = "2026-08-01"; // 静的書き出し時の決定的な初期値（マウント後に本日へ更新）
const MIN_ALT = 15; // 撮影に有効とみなす最低高度（度）

const pad = (n: number) => String(n).padStart(2, "0");
const r0 = (n: number) => Math.round(n);

function todayJst(): string {
  const jst = new Date(Date.now() + JST * 60000);
  return `${jst.getUTCFullYear()}-${pad(jst.getUTCMonth() + 1)}-${pad(jst.getUTCDate())}`;
}

type Sample = {
  minutesFromStart: number;
  localHour: number;
  localMinute: number;
  gcAltitude: number;
  gcAzimuth: number;
  sunAltitude: number;
  moonAltitude: number;
  moonIllumination: number;
  isAstroDark: boolean;
  isVisible: boolean;
};

type NightWindow = { start: Sample; end: Sample; durationMinutes: number };
type NightPlan = {
  samples: Sample[];
  window: NightWindow | null;
  peak: Sample | null;
  peakCompass: string | null;
  moon: { upFraction: number; meanIllumination: number };
  minAltitude: number;
};

function clock(s: { localHour: number; localMinute: number }) {
  return `${pad(s.localHour)}:${pad(s.localMinute)}`;
}

function moonPhaseName(illum: number, waxing: boolean): string {
  if (illum < 0.04) return "新月";
  if (illum > 0.96) return "満月";
  if (illum < 0.46) return waxing ? "三日月〜上弦前" : "下弦後〜二十六夜";
  if (illum < 0.54) return waxing ? "上弦" : "下弦";
  return waxing ? "上弦過ぎ〜十三夜" : "十六夜〜下弦前";
}

export default function Home() {
  const [locationId, setLocationId] = useState<string>("tokyo");
  const [manualLat, setManualLat] = useState<string>("");
  const [manualLon, setManualLon] = useState<string>("");
  const [dateStr, setDateStr] = useState<string>(DEFAULT_DATE);
  const [theme, setTheme] = useState<"light" | "dark" | null>(null);
  const didMount = useRef(false);

  // マウント後に「本日(JST)」へ更新（SSRとの hydration 不一致を避けるため初期値は固定）。
  useEffect(() => {
    if (didMount.current) return;
    didMount.current = true;
    setDateStr(todayJst());
  }, []);

  // 明るい/暗いの明示切替（未指定時はOSの配色に従う）。
  useEffect(() => {
    const el = document.documentElement;
    if (theme) el.setAttribute("data-theme", theme);
    else el.removeAttribute("data-theme");
  }, [theme]);

  function toggleTheme() {
    const effective =
      theme ??
      (typeof window !== "undefined" &&
      window.matchMedia &&
      window.matchMedia("(prefers-color-scheme: dark)").matches
        ? "dark"
        : "light");
    setTheme(effective === "dark" ? "light" : "dark");
  }

  const resolved = useMemo(() => {
    if (locationId === "manual") {
      const lat = Number(manualLat);
      const lon = Number(manualLon);
      if (
        manualLat.trim() === "" ||
        manualLon.trim() === "" ||
        Number.isNaN(lat) ||
        Number.isNaN(lon)
      ) {
        return { error: "緯度・経度を数値で入力してください。" as const };
      }
      if (lat < -90 || lat > 90)
        return { error: "緯度は -90〜90 の範囲で入力してください。" as const };
      if (lon < -180 || lon > 180)
        return {
          error: "経度は -180〜180 の範囲で入力してください。" as const,
        };
      return { loc: { label: "指定地点", lat, lon } };
    }
    const p = LOCATIONS.find((l) => l.id === locationId) ?? LOCATIONS[2];
    return { loc: { label: p.label, lat: p.lat, lon: p.lon } };
  }, [locationId, manualLat, manualLon]);

  const result = useMemo(() => {
    if ("error" in resolved) return { error: resolved.error };
    const m = dateStr.match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (!m) return { error: "日付を選んでください。" as const };
    const y = Number(m[1]);
    const mo = Number(m[2]);
    const d = Number(m[3]);
    const anchor = new Date(Date.UTC(y, mo - 1, d, 3, 0, 0)); // 現地正午付近を指すアンカー
    const plan = computeNightPlan({
      lat: resolved.loc.lat,
      lonEast: resolved.loc.lon,
      date: anchor,
      tzOffsetMinutes: JST,
      stepMinutes: 10,
      minAltitude: MIN_ALT,
    }) as NightPlan;
    return { plan, loc: resolved.loc };
  }, [resolved, dateStr]);

  return (
    <>
      <a className="skip" href="#result">
        本文へスキップ
      </a>

      <header className="masthead">
        <div className="wordmark">
          <span className="wordmark__glyph" aria-hidden="true">
            <StarMark />
          </span>
          <div className="wordmark__text">
            <h1 className="wordmark__ja">星空撮影プランナー</h1>
            <span className="wordmark__en">
              HOSHIZORA · MILKY WAY NIGHT PLANNER
            </span>
          </div>
        </div>
        <button
          type="button"
          className="theme-toggle"
          aria-label="配色を切り替え"
          onClick={toggleTheme}
        >
          <span className="theme-toggle__dot" aria-hidden="true" />
          {theme === "dark" ? "ライト" : "ダーク"}
        </button>
      </header>

      <p className="lede">
        撮影地と日付を選ぶと、天の川の中心（いて座付近）が
        <b>その夜いつ・どの方角に・どの高さで見えるか</b>を一画面で示します。
        出発前に「今夜は撮れるか」を確かめるための、日本語・軽量プランナーです。
      </p>

      <section className="controls" aria-label="観測条件">
        <div className="field">
          <label htmlFor="loc">観測地</label>
          <div className="select-wrap">
            <select
              id="loc"
              aria-label="観測地"
              value={locationId}
              onChange={(e) => setLocationId(e.target.value)}
            >
              {LOCATIONS.map((l) => (
                <option key={l.id} value={l.id}>
                  {l.label}
                </option>
              ))}
              <option value="manual">緯度・経度を手動で入力…</option>
            </select>
          </div>
        </div>

        {locationId === "manual" && (
          <div className="field field--manual">
            <label htmlFor="lat">緯度・経度</label>
            <div className="manual-inputs">
              <input
                id="lat"
                aria-label="緯度"
                inputMode="decimal"
                placeholder="緯度 例 35.68"
                value={manualLat}
                onChange={(e) => setManualLat(e.target.value)}
              />
              <input
                id="lon"
                aria-label="経度"
                inputMode="decimal"
                placeholder="経度 例 139.69"
                value={manualLon}
                onChange={(e) => setManualLon(e.target.value)}
              />
            </div>
          </div>
        )}

        <div className="field">
          <label htmlFor="date">日付</label>
          <input
            id="date"
            type="date"
            aria-label="日付"
            value={dateStr}
            onChange={(e) => setDateStr(e.target.value)}
          />
        </div>
      </section>

      <section id="result" className="result" aria-live="polite">
        {"error" in result ? (
          <div className="notice notice--error" role="alert">
            <span className="notice__mark" aria-hidden="true">
              !
            </span>
            {result.error}
          </div>
        ) : (
          <PlanView
            plan={result.plan}
            locLabel={result.loc.label}
            dateStr={dateStr}
          />
        )}
      </section>

      <footer className="colophon">
        <p>
          時刻は日本標準時（JST）。天文計算はブラウザ内で行い、外部に送信しません。可視の目安であり
          天候・光害の実測ではありません。
        </p>
        <p className="colophon__links">
          <a href="./about/">計算の考え方・免責・プライバシー</a>
        </p>
      </footer>
    </>
  );
}

function PlanView({
  plan,
  locLabel,
  dateStr,
}: {
  plan: NightPlan;
  locLabel: string;
  dateStr: string;
}) {
  const samples = plan.samples;
  const peak = plan.peak;
  const window = plan.window;

  const hasWindow = !!window && !!peak;
  const moonPct = Math.round(plan.moon.meanIllumination * 100);
  // 満ちる/欠けるは夜の始めと終わりの照度差で近似
  const first = samples[0];
  const last = samples[samples.length - 1];
  const waxing =
    (last?.moonIllumination ?? 0) >= (first?.moonIllumination ?? 0);
  const moonUp = plan.moon.upFraction > 0.15;

  const moonVerdict = (() => {
    if (!moonUp) return "月は見頃の時間ほぼ地平線下 — 好条件";
    if (moonPct < 25) return "細い月・影響は小さい";
    if (moonPct < 60) return "月明かりあり — 淡い星は控えめ";
    return "明るい月 — 天の川は写りにくい";
  })();
  const moonBright = moonUp && moonPct >= 60;

  const durLabel = window
    ? window.durationMinutes < 60
      ? "1時間未満"
      : `約${Math.floor(window.durationMinutes / 60)}時間${
          window.durationMinutes % 60 ? `${window.durationMinutes % 60}分` : ""
        }`
    : "";

  return (
    <div className="plan">
      <div className={`answer ${hasWindow ? "answer--go" : "answer--nogo"}`}>
        <p className="answer__eyebrow">
          {locLabel}・{dateStr} の夜 — 今夜のおすすめ
        </p>
        {hasWindow ? (
          <p className="answer__line">
            <span className="answer__seg answer__seg--time">
              <span className="answer__num">{clock(peak!)}</span>
              <span className="answer__unit">見頃のピーク</span>
            </span>
            <span className="answer__sep" aria-hidden="true" />
            <span className="answer__seg">
              <span className="answer__num">{plan.peakCompass}</span>
              <span className="answer__unit">
                方角（方位 {r0(peak!.gcAzimuth)}°）
              </span>
            </span>
            <span className="answer__sep" aria-hidden="true" />
            <span className="answer__seg">
              <span className="answer__num">{r0(peak!.gcAltitude)}°</span>
              <span className="answer__unit">高度</span>
            </span>
          </p>
        ) : (
          <p className="answer__line answer__line--nogo">
            <span className="answer__nogo-tag">今夜は見送り</span>
            <span className="answer__num">今夜は見頃ではありません</span>
            <span className="answer__unit">
              天の川中心が暗い時間帯に高度{MIN_ALT}
              °まで上がりません（季節・緯度によります）。
            </span>
          </p>
        )}
      </div>

      <dl className="facts">
        <div className="facts__item">
          <dt>見頃の時間</dt>
          <dd>
            {hasWindow ? (
              <>
                <b>
                  {clock(window!.start)} – {clock(window!.end)}
                </b>{" "}
                <span className="facts__sub">（{durLabel}）</span>
              </>
            ) : (
              <span className="facts__sub">
                この夜は見頃の時間帯がありません
              </span>
            )}
          </dd>
        </div>
        <div className={`facts__item ${moonBright ? "facts__item--warn" : ""}`}>
          <dt>月明かり</dt>
          <dd>
            <b>
              {moonPhaseName(plan.moon.meanIllumination, waxing)}・照度{moonPct}
              %
            </b>{" "}
            <span className="facts__sub">{moonVerdict}</span>
          </dd>
        </div>
      </dl>

      <Timeline samples={samples} window={window} peak={peak} />
    </div>
  );
}

// ── 夜のタイムライン（この製品の主計器）─────────────────────────────
// 夕暮れ→天体夜→夜明けを左→右の帯として引き伸ばし、天の川中心の高度推移を露光帯として重ねる。
function Timeline({
  samples,
  window,
  peak,
}: {
  samples: Sample[];
  window: { start: Sample; end: Sample; durationMinutes: number } | null;
  peak: Sample | null;
}) {
  const W = 720;
  const H = 210;
  const padL = 16;
  const padR = 16;
  const padT = 26;
  const padB = 30;
  const innerW = W - padL - padR;
  const innerH = H - padT - padB;
  const totalMin = samples[samples.length - 1]?.minutesFromStart || 720;

  const maxAlt = Math.max(
    30,
    Math.ceil((Math.max(...samples.map((s) => s.gcAltitude), 10) + 4) / 10) *
      10,
  );
  const x = (min: number) => padL + (min / totalMin) * innerW;
  const y = (alt: number) =>
    padT + innerH - (Math.max(0, alt) / maxAlt) * innerH;

  // 天体夜（太陽高度 < -18°）の範囲
  const darkIdx = samples
    .map((s, i) => (s.isAstroDark ? i : -1))
    .filter((i) => i >= 0);
  const duskMin = darkIdx.length
    ? (samples[darkIdx[0]!]?.minutesFromStart ?? null)
    : null;
  const dawnMin = darkIdx.length
    ? (samples[darkIdx[darkIdx.length - 1]!]?.minutesFromStart ?? null)
    : null;

  // 天の川中心 高度カーブ（可視域のみ面で塗る）
  const linePts = samples
    .map(
      (s) =>
        `${x(s.minutesFromStart).toFixed(1)},${y(s.gcAltitude).toFixed(1)}`,
    )
    .join(" ");
  const baseY = y(0);
  const areaPts = `${x(0).toFixed(1)},${baseY.toFixed(1)} ${linePts} ${x(totalMin).toFixed(1)},${baseY.toFixed(1)}`;

  // 月が出ている連続区間（干渉ハッチ）
  const moonBands: { x1: number; x2: number; illum: number }[] = [];
  let run: { s: number; e: number } | null = null;
  samples.forEach((s, i) => {
    if (s.moonAltitude > 0) {
      if (!run) run = { s: i, e: i };
      else run.e = i;
    } else if (run) {
      moonBands.push(band(run));
      run = null;
    }
  });
  if (run) moonBands.push(band(run));
  function band(rg: { s: number; e: number }) {
    const seg = samples.slice(rg.s, rg.e + 1);
    const illum =
      seg.reduce((a, b) => a + b.moonIllumination, 0) / (seg.length || 1);
    return {
      x1: x(samples[rg.s]?.minutesFromStart ?? 0),
      x2: x(samples[rg.e]?.minutesFromStart ?? 0),
      illum,
    };
  }

  // 時間軸の目盛り（18,20,22,0,2,4,6 JST）
  const startHour = samples[0]?.localHour ?? 18;
  const ticks: { min: number; label: string }[] = [];
  for (let t = 0; t <= totalMin; t += 120) {
    const h = (startHour + t / 60) % 24;
    ticks.push({ min: t, label: `${pad(Math.round(h))}` });
  }

  const ariaLabel = peak
    ? `夜のタイムライン。天の川中心は約${clock(peak)}に最高高度${r0(peak.gcAltitude)}度。` +
      (window
        ? `見頃はおよそ${clock(window.start)}から${clock(window.end)}。`
        : "")
    : "夜のタイムライン。この夜は天の川の見頃がありません。";

  return (
    <figure className="timeline">
      <figcaption className="timeline__cap">
        <span>夜のタイムライン</span>
        <span className="timeline__legend">
          <i className="lg lg--milky" /> 天の川の高度
          <i className="lg lg--win" /> 見頃
          <i className="lg lg--moon" /> 月明かり
        </span>
      </figcaption>
      <div className="timeline__scroll">
        <svg
          viewBox={`0 0 ${W} ${H}`}
          role="img"
          aria-label={ariaLabel}
          className="timeline__svg"
          preserveAspectRatio="xMidYMid meet"
        >
          <defs>
            <linearGradient id="milky" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" className="grad-milky-0" />
              <stop offset="100%" className="grad-milky-1" />
            </linearGradient>
            <pattern
              id="moonhatch"
              width="7"
              height="7"
              patternTransform="rotate(45)"
              patternUnits="userSpaceOnUse"
            >
              <line x1="0" y1="0" x2="0" y2="7" className="moonhatch-line" />
            </pattern>
            <pattern
              id="perf"
              width="24"
              height="8"
              patternUnits="userSpaceOnUse"
            >
              <rect
                x="8"
                y="2"
                width="8"
                height="4"
                rx="1"
                className="perf-cell"
              />
            </pattern>
          </defs>

          {/* 露光帯の枠 */}
          <rect
            x={padL}
            y={padT}
            width={innerW}
            height={innerH}
            className="tl-frame"
            rx="3"
          />

          {/* 薄明の左右（天体夜の外側） */}
          {duskMin !== null && duskMin > 0 && (
            <rect
              x={padL}
              y={padT}
              width={x(duskMin) - padL}
              height={innerH}
              className="tl-twilight"
            />
          )}
          {dawnMin !== null && dawnMin < totalMin && (
            <rect
              x={x(dawnMin)}
              y={padT}
              width={padL + innerW - x(dawnMin)}
              height={innerH}
              className="tl-twilight"
            />
          )}

          {/* フィルム・パーフォレーション（上下の縁） */}
          <rect
            x={padL}
            y={padT - 10}
            width={innerW}
            height={7}
            fill="url(#perf)"
            opacity="0.55"
          />
          <rect
            x={padL}
            y={padT + innerH + 3}
            width={innerW}
            height={7}
            fill="url(#perf)"
            opacity="0.55"
          />

          {/* 見頃ウィンドウの発光帯 */}
          {window && (
            <rect
              x={x(window.start.minutesFromStart)}
              y={padT}
              width={
                x(window.end.minutesFromStart) -
                x(window.start.minutesFromStart)
              }
              height={innerH}
              className="tl-window"
              rx="2"
            />
          )}

          {/* 月明かりハッチ（上部帯・照度で不透明度） */}
          {moonBands.map((b, i) => (
            <rect
              key={i}
              x={b.x1}
              y={padT}
              width={Math.max(1, b.x2 - b.x1)}
              height={14}
              fill="url(#moonhatch)"
              opacity={0.25 + 0.55 * b.illum}
            />
          ))}

          {/* 高度の目盛り線 */}
          {[0, maxAlt / 2, maxAlt].map((a, i) => (
            <g key={i}>
              <line
                x1={padL}
                y1={y(a)}
                x2={padL + innerW}
                y2={y(a)}
                className="tl-grid"
              />
              <text
                x={padL + innerW - 2}
                y={y(a) - 3}
                className="tl-gridtext"
                textAnchor="end"
              >
                {a}°
              </text>
            </g>
          ))}

          {/* 天の川中心の高度カーブ */}
          <polygon points={areaPts} fill="url(#milky)" className="tl-area" />
          <polyline points={linePts} className="tl-line" fill="none" />

          {/* ピークのティック（琥珀） */}
          {peak && (
            <g>
              <line
                x1={x(peak.minutesFromStart)}
                y1={padT}
                x2={x(peak.minutesFromStart)}
                y2={padT + innerH}
                className="tl-peak"
              />
              <circle
                cx={x(peak.minutesFromStart)}
                cy={y(peak.gcAltitude)}
                r="4.5"
                className="tl-peakdot"
              />
              <text
                x={x(peak.minutesFromStart)}
                y={padT - 13}
                className="tl-peaklabel"
                textAnchor="middle"
              >
                {clock(peak)} · {r0(peak.gcAltitude)}°
              </text>
            </g>
          )}

          {/* 時間軸ラベル */}
          {ticks.map((t, i) => (
            <text
              key={i}
              x={x(t.min)}
              y={H - 10}
              className="tl-axis"
              textAnchor="middle"
            >
              {t.label}時
            </text>
          ))}
        </svg>
      </div>
      <p className="timeline__note">
        帯は日没後の夕暮れ→天体夜→夜明け。曲線が高いほど天の川が高く昇っています。上側のハッチは月明かりの影響帯です。
      </p>
    </figure>
  );
}

function StarMark() {
  return (
    <svg viewBox="0 0 24 24" width="26" height="26" aria-hidden="true">
      <path
        d="M12 2.2c.4 3.6 1.4 5.9 3.2 7.1 1.3.9 3.2 1.4 5.6 1.6-2.4.2-4.3.7-5.6 1.6-1.8 1.2-2.8 3.5-3.2 7.1-.4-3.6-1.4-5.9-3.2-7.1-1.3-.9-3.2-1.4-5.6-1.6 2.4-.2 4.3-.7 5.6-1.6C10.6 8.1 11.6 5.8 12 2.2Z"
        className="starmark-path"
      />
    </svg>
  );
}
