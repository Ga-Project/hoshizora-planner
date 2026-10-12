// astro.mjs — 星景撮影プランナーの天文計算コア（外部API不使用・純関数）。
//
// 目的: 撮影地点(緯度経度)と日時から、天の川中心(いて座 Sgr A* 付近)が
//   「その夜、何時に・どの方角(方位角)に・どの高度で見えるか」を求める。
//   加えて薄明(空の暗さ)と月明かり(月齢・月の高度)を求め、撮影適性を判定する。
//
// 精度方針: 恒星(天の川中心)は固定赤道座標なので座標変換のみで厳密。太陽・月は
//   低精度公式(Schlyter系)で数分角〜1度程度。撮影プランの「時刻/方角/明るさ」用途には十分。
//   全て純関数。ブラウザとNode(node:test)双方から import して同じ結果を出す。

const DEG = Math.PI / 180;
const RAD = 180 / Math.PI;

const rev = (x) => ((x % 360) + 360) % 360; // 0..360 に正規化
const sind = (d) => Math.sin(d * DEG);
const cosd = (d) => Math.cos(d * DEG);
const tand = (d) => Math.tan(d * DEG);
const asind = (x) => Math.asin(x) * RAD;
const atan2d = (y, x) => Math.atan2(y, x) * RAD;

// 天の川中心（銀河中心 / いて座 Sgr A* 近傍）の J2000 赤道座標。
// RA 17h45m40s = 266.417°, Dec -29.008°。歳差の影響は本用途では無視可能。
export const GALACTIC_CENTER = {
  ra: 266.417,
  dec: -29.008,
  name: "天の川中心",
};

// --- 時刻 ---------------------------------------------------------------

/** JS Date(実体はUTC時刻) → ユリウス日 (UT)。 */
export function julianDate(date) {
  return date.getTime() / 86400000 + 2440587.5;
}

/** グリニッジ平均恒星時 GMST(度)。 */
export function gmstDeg(jd) {
  const T = jd - 2451545.0;
  return rev(280.46061837 + 360.98564736629 * T);
}

/** 地方恒星時 LST(度)。lonEast は東経正。 */
export function lstDeg(jd, lonEast) {
  return rev(gmstDeg(jd) + lonEast);
}

// --- 赤道座標 → 地平座標 ------------------------------------------------

/**
 * 赤道座標(ra,dec 度) を、観測地(lat,lonEast 度)・時刻(jd) の地平座標に変換。
 * @returns {{altitude:number, azimuth:number}} altitude=高度(度), azimuth=方位角(度, 北=0 東=90 南=180 西=270)
 */
export function equatorialToHorizontal(ra, dec, lat, lonEast, jd) {
  const H = rev(lstDeg(jd, lonEast) - ra); // 時角(度)
  const sinAlt = sind(lat) * sind(dec) + cosd(lat) * cosd(dec) * cosd(H);
  const altitude = asind(Math.max(-1, Math.min(1, sinAlt)));
  // 方位角: 北基準・東回り。子午線通過(H=0, dec<lat)で 180°(真南) になる符号系。
  const azimuth = rev(
    atan2d(
      -cosd(dec) * sind(H),
      sind(dec) * cosd(lat) - cosd(dec) * sind(lat) * cosd(H),
    ),
  );
  return { altitude, azimuth };
}

/** 天の川中心の地平座標(その時刻). */
export function galacticCenterPosition(lat, lonEast, date) {
  const jd = julianDate(date);
  return equatorialToHorizontal(
    GALACTIC_CENTER.ra,
    GALACTIC_CENTER.dec,
    lat,
    lonEast,
    jd,
  );
}

// --- 太陽(薄明判定用) ---------------------------------------------------

/** Schlyter の日数 d (2000.0元期, UT)。 */
function dayNumber(jd) {
  return jd - 2451543.5;
}

/** 太陽の赤道座標(ra,dec 度)と黄経 lon。低精度(数分角)。 */
export function sunEquatorial(jd) {
  const d = dayNumber(jd);
  const w = 282.9404 + 4.70935e-5 * d; // 近日点黄経
  const e = 0.016709 - 1.151e-9 * d; // 離心率
  const M = rev(356.047 + 0.9856002585 * d); // 平均近点角
  const oblecl = 23.4393 - 3.563e-7 * d; // 黄道傾斜
  // 離心近点角
  const E = M + RAD * e * sind(M) * (1 + e * cosd(M));
  const xv = cosd(E) - e;
  const yv = Math.sqrt(1 - e * e) * sind(E);
  const v = atan2d(yv, xv); // 真近点角
  const r = Math.sqrt(xv * xv + yv * yv);
  const lon = rev(v + w); // 太陽黄経
  const xs = r * cosd(lon);
  const ys = r * sind(lon);
  const xe = xs;
  const ye = ys * cosd(oblecl);
  const ze = ys * sind(oblecl);
  const ra = rev(atan2d(ye, xe));
  const dec = atan2d(ze, Math.sqrt(xe * xe + ye * ye));
  return { ra, dec, lon, oblecl };
}

/** 太陽高度(度)。 */
export function sunAltitude(lat, lonEast, date) {
  const jd = julianDate(date);
  const { ra, dec } = sunEquatorial(jd);
  return equatorialToHorizontal(ra, dec, lat, lonEast, jd).altitude;
}

// --- 月(月明かり判定用) -------------------------------------------------

/** 月の地平座標と満ち欠け(照度). 低精度(主要摂動込み・約1〜2分角). */
export function moonState(lat, lonEast, date) {
  const jd = julianDate(date);
  const d = dayNumber(jd);

  // 月の軌道要素
  const N = rev(125.1228 - 0.0529538083 * d);
  const i = 5.1454;
  const w = rev(318.0634 + 0.1643573223 * d);
  const a = 60.2666; // 地球半径単位
  const e = 0.0549;
  const M = rev(115.3654 + 13.0649929509 * d);

  // Kepler
  let E = M + RAD * e * sind(M) * (1 + e * cosd(M));
  for (let k = 0; k < 6; k++) {
    E = E - (E - RAD * e * sind(E) - M) / (1 - e * cosd(E));
  }
  const xv = a * (cosd(E) - e);
  const yv = a * (Math.sqrt(1 - e * e) * sind(E));
  const v = rev(atan2d(yv, xv));
  const r = Math.sqrt(xv * xv + yv * yv);

  // 黄道座標(直交)
  let xec = r * (cosd(N) * cosd(v + w) - sind(N) * sind(v + w) * cosd(i));
  let yec = r * (sind(N) * cosd(v + w) + cosd(N) * sind(v + w) * cosd(i));
  let zec = r * (sind(v + w) * sind(i));

  // 黄経黄緯
  let lon = rev(atan2d(yec, xec));
  let lat_ec = atan2d(zec, Math.sqrt(xec * xec + yec * yec));

  // 主要摂動(Schlyter)
  const sun = sunEquatorial(jd);
  const Ms = rev(356.047 + 0.9856002585 * d); // 太陽平均近点角
  const Ls = rev(sun.lon); // 太陽平均黄経(近似: 真黄経で代用)
  const Lm = rev(N + w + M); // 月平均黄経
  const Dm = rev(Lm - Ls); // 平均離角
  const F = rev(Lm - N); // 月の緯度引数

  lon +=
    -1.274 * sind(M - 2 * Dm) +
    0.658 * sind(2 * Dm) +
    -0.186 * sind(Ms) +
    -0.059 * sind(2 * M - 2 * Dm) +
    -0.057 * sind(M - 2 * Dm + Ms) +
    0.053 * sind(M + 2 * Dm) +
    0.046 * sind(2 * Dm - Ms) +
    0.041 * sind(M - Ms) +
    -0.035 * sind(Dm) +
    -0.031 * sind(M + Ms) +
    -0.015 * sind(2 * F - 2 * Dm) +
    0.011 * sind(M - 4 * Dm);
  lat_ec +=
    -0.173 * sind(F - 2 * Dm) +
    -0.055 * sind(M - F - 2 * Dm) +
    -0.046 * sind(M + F - 2 * Dm) +
    0.033 * sind(F + 2 * Dm) +
    0.017 * sind(2 * M + F);
  lon = rev(lon);

  // 黄道→赤道
  const oblecl = sun.oblecl;
  const xg = cosd(lon) * cosd(lat_ec);
  const yg = sind(lon) * cosd(lat_ec);
  const zg = sind(lat_ec);
  const xe = xg;
  const ye = yg * cosd(oblecl) - zg * sind(oblecl);
  const ze = yg * sind(oblecl) + zg * cosd(oblecl);
  const ra = rev(atan2d(ye, xe));
  const dec = atan2d(ze, Math.sqrt(xe * xe + ye * ye));

  const { altitude, azimuth } = equatorialToHorizontal(
    ra,
    dec,
    lat,
    lonEast,
    jd,
  );

  // 満ち欠け(照度): 太陽との離角 elong から。
  const elong = Math.acos(cosd(sun.lon - lon) * cosd(lat_ec)) * RAD;
  const illumination = (1 - cosd(elong)) / 2; // 0(新月)..1(満月)

  return { altitude, azimuth, illumination, phaseAngle: elong };
}

// --- プラン算出 ---------------------------------------------------------

/** 方位角(度) → 16方位の日本語ラベル。 */
export function azimuthToCompass(az) {
  const dirs = [
    "北",
    "北北東",
    "北東",
    "東北東",
    "東",
    "東南東",
    "南東",
    "南南東",
    "南",
    "南南西",
    "南西",
    "西南西",
    "西",
    "西北西",
    "北西",
    "北北西",
  ];
  return dirs[Math.round(rev(az) / 22.5) % 16];
}

/**
 * ある「夜」の天の川可視プランを算出する。
 * date の当日 18:00(現地) から翌日 06:00(現地) までを step 分刻みでサンプルする。
 *
 * @param {object} o
 * @param {number} o.lat 緯度(度, 北正)
 * @param {number} o.lonEast 経度(度, 東正)
 * @param {Date} o.date 対象の夜の「日没側の暦日」を表す Date（現地正午付近を渡す想定でもよい）
 * @param {number} [o.tzOffsetMinutes] 現地時間のUTCオフセット(分)。省略時は実行環境のローカルオフセット。
 * @param {number} [o.stepMinutes=10] サンプル間隔
 * @param {number} [o.minAltitude=15] 撮影に有効とみなす最低高度(度)
 * @returns {object} プラン
 */
export function computeNightPlan(o) {
  const { lat, lonEast, date, stepMinutes = 10, minAltitude = 15 } = o;
  const tz = o.tzOffsetMinutes ?? -date.getTimezoneOffset();

  // 現地日の 18:00 を UTC の絶対時刻で作る。
  // 現地暦日 (Y,M,D) を tz から復元する。
  const localMs = date.getTime() + tz * 60000;
  const local = new Date(localMs);
  const y = local.getUTCFullYear();
  const m = local.getUTCMonth();
  const dd = local.getUTCDate();
  // 現地 18:00 の UTC 絶対時刻 = Date.UTC(現地時計) - tz
  const startUtcMs = Date.UTC(y, m, dd, 18, 0, 0) - tz * 60000;
  const samples = [];
  const totalMin = 12 * 60; // 18:00 → 翌06:00
  for (let t = 0; t <= totalMin; t += stepMinutes) {
    const when = new Date(startUtcMs + t * 60000);
    const gc = galacticCenterPosition(lat, lonEast, when);
    const sunAlt = sunAltitude(lat, lonEast, when);
    const moon = moonState(lat, lonEast, when);
    // 現地時計(表示用)
    const localClock = new Date(when.getTime() + tz * 60000);
    samples.push({
      when,
      localHour: localClock.getUTCHours(),
      localMinute: localClock.getUTCMinutes(),
      minutesFromStart: t,
      gcAltitude: gc.altitude,
      gcAzimuth: gc.azimuth,
      sunAltitude: sunAlt,
      moonAltitude: moon.altitude,
      moonIllumination: moon.illumination,
      // 天体夜(天文薄明終了 = 太陽高度 < -18°)かつ 天の川が最低高度以上
      isAstroDark: sunAlt < -18,
      isVisible: sunAlt < -18 && gc.altitude >= minAltitude,
    });
  }

  // 可視ウィンドウ(連続する isVisible 区間のうち最長)
  let best = null; // {startIdx,endIdx}
  let cur = null;
  for (let idx = 0; idx < samples.length; idx++) {
    if (samples[idx].isVisible) {
      if (!cur) cur = { s: idx, e: idx };
      else cur.e = idx;
    } else if (cur) {
      if (!best || cur.e - cur.s > best.e - best.s) best = cur;
      cur = null;
    }
  }
  if (cur && (!best || cur.e - cur.s > best.e - best.s)) best = cur;

  // 最高高度サンプル(可視ウィンドウ内。無ければ夜間全体で最高)
  const pool = best
    ? samples.slice(best.s, best.e + 1)
    : samples.filter((s) => s.isAstroDark);
  let peak = null;
  const scan = pool.length ? pool : samples;
  for (const s of scan) {
    if (!peak || s.gcAltitude > peak.gcAltitude) peak = s;
  }

  // ある「開始からの分」を現地時計の表示ノードに変換する。
  const nodeAt = (minFromStart) => {
    const local = new Date(startUtcMs + minFromStart * 60000 + tz * 60000);
    return {
      minutesFromStart: minFromStart,
      localHour: local.getUTCHours(),
      localMinute: local.getUTCMinutes(),
    };
  };

  // 可視ウィンドウの端は 10分格子ではなく、隣接サンプル間で可視条件
  // (天体夜=太陽高度<-18° かつ 天の川高度≥minAltitude) が切り替わる時刻を線形補間して求める。
  // これにより単一サンプルの窓でも start≠end・duration>0 になり「05:00–05:00（約0時間）」を避ける。
  let window = null;
  if (best) {
    const s0 = samples[best.s];
    const e0 = samples[best.e];
    // 開始エッジ: 直前の非可視サンプルとの間。窓は「暗さ」と「高度」の両条件が揃った時点で開く（遅い方）。
    let startMin = s0.minutesFromStart;
    const prev = samples[best.s - 1];
    if (prev) {
      const fSun =
        prev.sunAltitude >= -18 && s0.sunAltitude < -18
          ? (prev.sunAltitude + 18) / (prev.sunAltitude - s0.sunAltitude)
          : 0;
      const fGc =
        prev.gcAltitude < minAltitude && s0.gcAltitude >= minAltitude
          ? (minAltitude - prev.gcAltitude) / (s0.gcAltitude - prev.gcAltitude)
          : 0;
      startMin = prev.minutesFromStart + Math.max(fSun, fGc) * stepMinutes;
    }
    // 終了エッジ: 直後の非可視サンプルとの間。窓はどちらかの条件が崩れた時点で閉じる（早い方）。
    let endMin = e0.minutesFromStart;
    const next = samples[best.e + 1];
    if (next) {
      const fSun =
        e0.sunAltitude < -18 && next.sunAltitude >= -18
          ? (e0.sunAltitude + 18) / (e0.sunAltitude - next.sunAltitude)
          : 1;
      const fGc =
        e0.gcAltitude >= minAltitude && next.gcAltitude < minAltitude
          ? (e0.gcAltitude - minAltitude) / (e0.gcAltitude - next.gcAltitude)
          : 1;
      endMin = e0.minutesFromStart + Math.min(fSun, fGc) * stepMinutes;
    }
    if (endMin <= startMin) endMin = startMin + stepMinutes; // 安全網
    window = {
      start: nodeAt(startMin),
      end: nodeAt(endMin),
      durationMinutes: Math.round(endMin - startMin),
    };
  }

  // 月明かりの影響: ウィンドウ中(無ければ夜間)の月の平均照度×(月が地平線上の割合)
  const moonPool = window
    ? samples.slice(best.s, best.e + 1)
    : samples.filter((s) => s.isAstroDark);
  let moonUpCount = 0;
  let illumSum = 0;
  for (const s of moonPool) {
    if (s.moonAltitude > 0) moonUpCount++;
    illumSum += s.moonIllumination;
  }
  const moonUpFraction = moonPool.length ? moonUpCount / moonPool.length : 0;
  const meanIllumination = moonPool.length ? illumSum / moonPool.length : 0;

  return {
    samples,
    window, // 可視ウィンドウ(null=一晩を通して見えない)
    peak, // 最高高度サンプル
    peakCompass: peak ? azimuthToCompass(peak.gcAzimuth) : null,
    moon: {
      upFraction: moonUpFraction, // ウィンドウ中に月が出ている時間割合 0..1
      meanIllumination, // ウィンドウ中の平均照度 0..1
    },
    minAltitude,
  };
}
