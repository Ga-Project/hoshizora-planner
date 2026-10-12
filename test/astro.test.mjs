// astro.test.mjs — 天文計算コアの検証（node:test 標準ランナー・追加依存なし）。
// 既知の天文事実(子午線通過高度・薄明・満ち欠け)に対して座標変換を突き合わせる。
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  equatorialToHorizontal,
  galacticCenterPosition,
  sunAltitude,
  moonState,
  azimuthToCompass,
  computeNightPlan,
  GALACTIC_CENTER,
} from "../lib/astro.mjs";

const TOKYO = { lat: 35.68, lonEast: 139.69 };

test("天の川中心の子午線通過高度は幾何的期待値に一致(東京 ≈ 25.3°, 真南)", () => {
  // 通過高度 = 90 - |lat - dec|。dec<lat なので通過方位は真南(180°)。
  const expectedAlt = 90 - Math.abs(TOKYO.lat - GALACTIC_CENTER.dec);
  let maxAlt = -90;
  let azAtMax = null;
  // 2026-08-01 の24時間を1分刻みで走査し最高高度を探す。
  const base = Date.UTC(2026, 7, 1, 0, 0, 0);
  for (let min = 0; min < 24 * 60; min++) {
    const when = new Date(base + min * 60000);
    const p = galacticCenterPosition(TOKYO.lat, TOKYO.lonEast, when);
    if (p.altitude > maxAlt) {
      maxAlt = p.altitude;
      azAtMax = p.azimuth;
    }
  }
  assert.ok(
    Math.abs(maxAlt - expectedAlt) < 1.0,
    `maxAlt=${maxAlt} expected≈${expectedAlt}`,
  );
  assert.ok(
    Math.abs(azAtMax - 180) < 3,
    `az at transit=${azAtMax} expected≈180`,
  );
});

test("地平座標変換: 天頂を通過する天体(dec=lat, H=0)は高度90°付近", () => {
  const jd = 2451545.0; // 任意
  // H=0 を作るには ra=LST。ここでは変換の内部整合のみ確認(dec=lat, 真南通過で 90-0)。
  const p = equatorialToHorizontal(0, TOKYO.lat, TOKYO.lat, 0, jd);
  // H は LST(=gmst) 依存だが、dec=lat の天体の通過高度は 90°。24hの最大で検証。
  let maxAlt = -90;
  for (let h = 0; h < 24 * 60; h++) {
    const q = equatorialToHorizontal(
      0,
      TOKYO.lat,
      TOKYO.lat,
      0,
      jd + h / (24 * 60),
    );
    if (q.altitude > maxAlt) maxAlt = q.altitude;
  }
  assert.ok(maxAlt > 89, `dec=lat の最大高度=${maxAlt} は90°付近であるべき`);
  assert.ok(typeof p.azimuth === "number");
});

test("太陽高度: 東京 夏至頃の正午は高く、真夜中は天文薄明より暗い", () => {
  // 2026-06-21 現地正午 ≈ 03:00 UTC / 現地真夜中 ≈ 15:00 UTC(前日) 。JST=UTC+9。
  const noon = new Date(Date.UTC(2026, 5, 21, 3, 0, 0));
  const midnight = new Date(Date.UTC(2026, 5, 21, 15, 0, 0));
  assert.ok(
    sunAltitude(TOKYO.lat, TOKYO.lonEast, noon) > 60,
    "夏至正午の太陽は高い",
  );
  assert.ok(
    sunAltitude(TOKYO.lat, TOKYO.lonEast, midnight) < -18,
    "真夜中は天文薄明終了(暗い)",
  );
});

test("月の満ち欠け: 2024-01-25 は満月付近、2024-01-11 は新月付近", () => {
  const full = moonState(
    TOKYO.lat,
    TOKYO.lonEast,
    new Date(Date.UTC(2024, 0, 25, 12, 0, 0)),
  );
  const nw = moonState(
    TOKYO.lat,
    TOKYO.lonEast,
    new Date(Date.UTC(2024, 0, 11, 12, 0, 0)),
  );
  assert.ok(full.illumination > 0.9, `満月照度=${full.illumination} > 0.9`);
  assert.ok(nw.illumination < 0.1, `新月照度=${nw.illumination} < 0.1`);
});

test("方位角→16方位ラベル", () => {
  assert.equal(azimuthToCompass(0), "北");
  assert.equal(azimuthToCompass(90), "東");
  assert.equal(azimuthToCompass(180), "南");
  assert.equal(azimuthToCompass(270), "西");
  assert.equal(azimuthToCompass(135), "南東");
});

test("computeNightPlan: 東京の夏の夜は可視ウィンドウが存在し、ピークは南寄り", () => {
  const plan = computeNightPlan({
    lat: TOKYO.lat,
    lonEast: TOKYO.lonEast,
    date: new Date(Date.UTC(2026, 6, 15, 3, 0, 0)), // 現地7/15正午
    tzOffsetMinutes: 540, // JST
    stepMinutes: 10,
    minAltitude: 15,
  });
  assert.ok(plan.window, "夏の夜に可視ウィンドウがあるべき");
  assert.ok(plan.window.durationMinutes > 0);
  assert.ok(plan.peak.gcAltitude >= 15, "ピーク高度は最低高度以上");
  assert.ok(
    plan.peakCompass.includes("南"),
    `ピーク方位=${plan.peakCompass} は南寄りのはず`,
  );
  assert.ok(plan.moon.meanIllumination >= 0 && plan.moon.meanIllumination <= 1);
});

test("computeNightPlan: 短い可視窓でも duration>0・start≠end（ゼロ幅窓を出さない）", () => {
  // 天の川中心が15°を1サンプルだけ掠める夜（東京 2026-02-16 / 2026-10-08）で
  // 「05:00–05:00（約0時間）」のようなゼロ幅窓を返さないこと。
  for (const dateUTC of [
    Date.UTC(2026, 1, 16, 3, 0, 0),
    Date.UTC(2026, 9, 8, 3, 0, 0),
  ]) {
    const plan = computeNightPlan({
      lat: TOKYO.lat,
      lonEast: TOKYO.lonEast,
      date: new Date(dateUTC),
      tzOffsetMinutes: 540,
    });
    if (plan.window) {
      assert.ok(
        plan.window.durationMinutes > 0,
        `duration=${plan.window.durationMinutes} は正であるべき`,
      );
      assert.ok(
        plan.window.end.minutesFromStart > plan.window.start.minutesFromStart,
        "窓の start と end は異なる時刻であるべき",
      );
    }
  }
});

test("computeNightPlan: 北極圏の冬(白夜の逆・極夜でない地点)でも例外なく完了する", () => {
  const plan = computeNightPlan({
    lat: 43.06, // 札幌
    lonEast: 141.35,
    date: new Date(Date.UTC(2026, 0, 15, 3, 0, 0)),
    tzOffsetMinutes: 540,
  });
  // 冬の天の川中心は日中側で見えない可能性が高い → window は null でも例外を投げないこと。
  assert.ok(Array.isArray(plan.samples) && plan.samples.length > 0);
});
