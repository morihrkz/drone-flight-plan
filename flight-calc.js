/* =====================================================================
 * flight-calc.js — ドローン飛行計算ロジック
 * 航空工学（運動量理論）・写真測量・DIPS申請（審査要領）に基づく計算関数群
 * すべて純粋関数。入力不正時は null を返す（呼び出し側で「―」表示）
 * ===================================================================== */

const GRAVITY = 9.80665;        // 重力加速度 [m/s^2]
const AIR_DENSITY_SL = 1.225;   // 海面上標準大気密度 [kg/m^3]

/** 有限の正の数かどうか */
function isPos(v) { return Number.isFinite(v) && v > 0; }

/* ---------------------------------------------------------------------
 * 1. 飛行時間・ホバリング計算（運動量理論ベース）
 * ------------------------------------------------------------------ */

/**
 * ホバリングに必要な電気的入力 [W]
 * 運動量理論: P_ideal = T^1.5 / sqrt(2 * ρ * A_total)
 * 実機補正: フィギュアオブメリット(FoM) とモーター・ESC効率で割る
 *
 * @param {number} totalMassKg   総重量（機体+バッテリー+ペイロード）[kg]
 * @param {number} rotorCount    ローター数（例: 4）
 * @param {number} propDiameterM プロペラ直径 [m]
 * @param {number} figureOfMerit ローター効率 FoM（0.5〜0.8、目安0.65）
 * @param {number} driveEff      モーター×ESC総合効率（0.6〜0.9、目安0.80）
 * @param {number} airDensity    空気密度 [kg/m^3]（高地は低下）
 * @returns {number|null} 必要電力 [W]
 */
function hoverPowerW(totalMassKg, rotorCount, propDiameterM,
                     figureOfMerit = 0.65, driveEff = 0.80,
                     airDensity = AIR_DENSITY_SL) {
  if (![totalMassKg, rotorCount, propDiameterM, figureOfMerit, driveEff, airDensity].every(isPos)) return null;
  const thrustN = totalMassKg * GRAVITY;                       // 必要推力 = 重量
  const diskArea = rotorCount * Math.PI * (propDiameterM / 2) ** 2; // 総ローター円板面積
  const idealW = Math.pow(thrustN, 1.5) / Math.sqrt(2 * airDensity * diskArea);
  return idealW / (figureOfMerit * driveEff);
}

/**
 * バッテリーの使用可能エネルギー [Wh]
 * @param {number} capacityMah 容量 [mAh]
 * @param {number} voltageV    公称電圧 [V]（例: 4S=14.8, 6S=22.2）
 * @param {number} reserveRatio 残量予備率（0.30 = 30%残しで帰還）
 * @param {number} batteryHealth 劣化率（1.0=新品、0.8=実容量80%）
 */
function usableEnergyWh(capacityMah, voltageV, reserveRatio = 0.30, batteryHealth = 1.0) {
  if (![capacityMah, voltageV, batteryHealth].every(isPos)) return null;
  if (!(reserveRatio >= 0 && reserveRatio < 1)) return null;
  return (capacityMah / 1000) * voltageV * batteryHealth * (1 - reserveRatio);
}

/**
 * 限界ホバリング時間 [分]（予備率0、劣化考慮あり = 物理限界）
 * 可能飛行時間 [分]（予備率・前進飛行係数を考慮した運用値）
 *
 * @param {object} p 入力パラメータ
 * @returns {{ hoverLimitMin:number, flightTimeMin:number, hoverW:number }|null}
 */
function calcFlightTime(p) {
  const hoverW = hoverPowerW(p.totalMassKg, p.rotorCount, p.propDiameterM,
                             p.figureOfMerit, p.driveEff, p.airDensity);
  if (hoverW === null) return null;

  const avionicsW = Number.isFinite(p.avionicsW) ? p.avionicsW : 10; // FC・カメラ等の固定消費 [W]
  const totalW = hoverW + avionicsW;

  // 限界ホバリング: 予備率0%でバッテリーを使い切った場合
  const limitWh = usableEnergyWh(p.capacityMah, p.voltageV, 0, p.batteryHealth);
  // 運用飛行時間: 予備率を残し、前進飛行・風による増加係数(1.1〜1.3)で割る
  const opWh = usableEnergyWh(p.capacityMah, p.voltageV, p.reserveRatio, p.batteryHealth);
  if (limitWh === null || opWh === null) return null;

  const cruiseFactor = isPos(p.cruiseFactor) ? p.cruiseFactor : 1.15;

  return {
    hoverW: totalW,
    hoverLimitMin: (limitWh / totalW) * 60,
    flightTimeMin: (opWh / (totalW * cruiseFactor)) * 60,
  };
}

/* ---------------------------------------------------------------------
 * 2. DIPS申請を意識した距離・速度パラメータ
 * ------------------------------------------------------------------ */

/**
 * 係留（紐付き）飛行の水平限界距離 [m]
 * 係留索長 L、飛行高度 H のとき水平移動可能距離 = √(L² − H²)
 * ※審査要領上、30m以下の紐等で係留すれば一部の特定飛行は許可不要
 */
function tetherHorizontalRangeM(tetherLengthM, altitudeM) {
  if (!isPos(tetherLengthM) || !Number.isFinite(altitudeM) || altitudeM < 0) return null;
  if (altitudeM >= tetherLengthM) return 0; // 高度が索長以上 → 水平移動不可
  return Math.sqrt(tetherLengthM ** 2 - altitudeM ** 2);
}

/**
 * 電波到達予想距離 [km]（自由空間伝搬損失 FSPL による見通し内推定）
 * FSPL[dB] = 32.44 + 20log10(d[km]) + 20log10(f[MHz])
 * リンクバジェット: Ptx + Gtx + Grx − 受信感度 − フェードマージン ≧ FSPL
 *
 * @param {number} txPowerDbm   送信出力 [dBm]（例: 2.4GHz帯 10mW/MHz ≈ 20dBm級）
 * @param {number} txGainDbi    送信アンテナ利得 [dBi]
 * @param {number} rxGainDbi    受信アンテナ利得 [dBi]
 * @param {number} rxSensDbm    受信感度 [dBm]（例: -90）
 * @param {number} freqMhz      周波数 [MHz]（例: 2400, 5700）
 * @param {number} fadeMarginDb フェードマージン [dB]（目安 15〜20）
 */
function radioRangeKm(txPowerDbm, txGainDbi, rxGainDbi, rxSensDbm, freqMhz, fadeMarginDb = 15) {
  if (![freqMhz].every(isPos)) return null;
  if (![txPowerDbm, txGainDbi, rxGainDbi, rxSensDbm, fadeMarginDb].every(Number.isFinite)) return null;
  const allowableLoss = txPowerDbm + txGainDbi + rxGainDbi - rxSensDbm - fadeMarginDb;
  if (allowableLoss <= 0) return 0;
  return Math.pow(10, (allowableLoss - 32.44 - 20 * Math.log10(freqMhz)) / 20);
}

/**
 * 目視可能範囲の目安 [m]
 * 機体の最大投影寸法と人間の視力（視角の分解能）から推定。
 * 機体の姿勢・方位が判別できる目安視角 ≈ 機体寸法が視角3分(arcmin)以上
 * d = size / tan(3 arcmin) ≈ size × 1146 → 安全側に係数0.5を掛ける
 * ※法的な定義値ではなく、申請書の「目視可能距離」記入の参考値
 */
function visualLineOfSightM(aircraftSizeM, safetyFactor = 0.5) {
  if (!isPos(aircraftSizeM)) return null;
  const arcmin3 = (3 / 60) * Math.PI / 180;
  return (aircraftSizeM / Math.tan(arcmin3)) * safetyFactor;
}

/**
 * 催し場所上空飛行時の立入禁止区画距離 [m]
 * 審査要領（国土交通省）の高度別テーブルに基づく:
 *   高度 ≦20m → 30m / ≦50m → 40m / ≦100m → 60m / ≦150m → 70m
 * 飛行範囲の外周からこの距離以内を第三者立入禁止とする
 */
function eventBufferDistanceM(altitudeM) {
  if (!isPos(altitudeM) || altitudeM > 150) return null; // 150m超は別途許可
  if (altitudeM <= 20)  return 30;
  if (altitudeM <= 50)  return 40;
  if (altitudeM <= 100) return 60;
  return 70;
}

/**
 * イベント上空などでの安全微速度の目安 [m/s]
 * 衝突時運動エネルギー E = ½mv² を許容値以下に抑える速度
 * v_max = √(2 × E_max / m)
 * @param {number} totalMassKg 総重量 [kg]
 * @param {number} maxEnergyJ  許容運動エネルギー [J]（目安: 25J＝人体重傷閾値の一例）
 */
function safeSpeedMps(totalMassKg, maxEnergyJ = 25) {
  if (![totalMassKg, maxEnergyJ].every(isPos)) return null;
  return Math.sqrt(2 * maxEnergyJ / totalMassKg);
}

/* ---------------------------------------------------------------------
 * 3. カメラ・センサー（GSD・撮影範囲）
 * ------------------------------------------------------------------ */

/**
 * GSD（地上画素寸法）と地上撮影範囲
 * GSD[cm/px] = (センサー幅[mm] × 高度[m] × 100) / (焦点距離[mm] × 画像幅[px])
 * 撮影範囲幅[m] = センサー幅[mm] × 高度[m] / 焦点距離[mm]
 *
 * @param {object} p { sensorWmm, sensorHmm, focalMm, imageWpx, imageHpx, altitudeM }
 * @returns {{ gsdCm:number, footprintWm:number, footprintHm:number }|null}
 */
function calcGsd(p) {
  const { sensorWmm, sensorHmm, focalMm, imageWpx, imageHpx, altitudeM } = p;
  if (![sensorWmm, sensorHmm, focalMm, imageWpx, imageHpx, altitudeM].every(isPos)) return null;
  return {
    gsdCm:       (sensorWmm * altitudeM * 100) / (focalMm * imageWpx),
    footprintWm: (sensorWmm * altitudeM) / focalMm,
    footprintHm: (sensorHmm * altitudeM) / focalMm,
  };
}

/**
 * 目標GSDから必要飛行高度を逆算 [m]
 * H = GSD[cm] × 焦点距離[mm] × 画像幅[px] / (センサー幅[mm] × 100)
 */
function altitudeForGsdM(targetGsdCm, focalMm, imageWpx, sensorWmm) {
  if (![targetGsdCm, focalMm, imageWpx, sensorWmm].every(isPos)) return null;
  return (targetGsdCm * focalMm * imageWpx) / (sensorWmm * 100);
}

/* ---------------------------------------------------------------------
 * 4. 機体プリセット
 * 内蔵プリセット（DJI主要機・公称スペックの近似値）＋ユーザー保存分
 * ------------------------------------------------------------------ */

/* 値はメーカー公表値からの近似。実機で必ず確認すること */
const AIRCRAFT_PRESETS = [
  { name: 'DJI Neo',           massKg: 0.135, rotors: 4, propIn: 3.0,  capMah: 1435, voltV: 3.87,  sensor: '1/2型',     focalMm: 3.4,  imgW: 4000, imgH: 3000, sizeM: 0.16 },
  { name: 'DJI Mini 4 Pro',    massKg: 0.249, rotors: 4, propIn: 6.0,  capMah: 2590, voltV: 7.32,  sensor: '1/1.3型',   focalMm: 6.7,  imgW: 8064, imgH: 6048, sizeM: 0.30 },
  { name: 'DJI Avata 2',       massKg: 0.377, rotors: 4, propIn: 3.0,  capMah: 2150, voltV: 14.76, sensor: '1/1.3型',   focalMm: 2.1,  imgW: 4000, imgH: 3000, sizeM: 0.21 },
  { name: 'DJI Air 3',         massKg: 0.720, rotors: 4, propIn: 8.7,  capMah: 4241, voltV: 14.76, sensor: '1/1.3型',   focalMm: 6.7,  imgW: 8064, imgH: 6048, sizeM: 0.42 },
  { name: 'DJI Air 3S',        massKg: 0.724, rotors: 4, propIn: 8.7,  capMah: 4276, voltV: 14.6,  sensor: '1型(CMOS)', focalMm: 8.8,  imgW: 8192, imgH: 6144, sizeM: 0.42 },
  { name: 'DJI Mavic 3',       massKg: 0.895, rotors: 4, propIn: 9.4,  capMah: 5000, voltV: 15.4,  sensor: '4/3型(M4/3)', focalMm: 12.3, imgW: 5280, imgH: 3956, sizeM: 0.38 },
  { name: 'DJI Mavic 3 Pro',   massKg: 0.958, rotors: 4, propIn: 9.4,  capMah: 5000, voltV: 15.4,  sensor: '4/3型(M4/3)', focalMm: 12.3, imgW: 5280, imgH: 3956, sizeM: 0.38 },
  { name: 'DJI Phantom 4 Pro', massKg: 1.388, rotors: 4, propIn: 9.4,  capMah: 5870, voltV: 15.2,  sensor: '1型(CMOS)', focalMm: 8.8,  imgW: 5472, imgH: 3648, sizeM: 0.35 },
  { name: 'DJI Matrice 350 RTK', massKg: 6.47, rotors: 4, propIn: 21.0, capMah: 5880, voltV: 44.76, sensor: '4/3型(M4/3)', focalMm: 12.3, imgW: 5280, imgH: 3956, sizeM: 0.90 },
];

// localStorage キーは storage-keys.js（DRONE_KEYS）が正本。
// このファイルは calculator.html のみが読み込み、同ページで storage-keys.js を先に読み込む。

function loadUserPresets() {
  try { return JSON.parse(localStorage.getItem(DRONE_KEYS.aircraftPresets)) || []; }
  catch (e) { return []; }
}
function saveUserPresets(list) {
  localStorage.setItem(DRONE_KEYS.aircraftPresets, JSON.stringify(list));
}
/** 内蔵＋ユーザー保存をまとめて返す（ユーザー分には custom:true を付与） */
function allAircraftPresets() {
  return [...AIRCRAFT_PRESETS, ...loadUserPresets().map(p => ({ ...p, custom: true }))];
}

/* ---------------------------------------------------------------------
 * 5. 飛行日誌（実測値）の参照
 * ------------------------------------------------------------------ */

/**
 * 日誌から実測飛行時間の統計を取得
 * @param {string} [aircraftName] 機体名で部分一致フィルタ（省略時は全件）
 * @returns {{ count:number, avgMin:number, totalMin:number }|null}
 */
function flightLogStats(aircraftName) {
  let records;
  try { records = JSON.parse(localStorage.getItem(DRONE_KEYS.flightLogRecords)) || []; }
  catch (e) { return null; }
  const filtered = records.filter(r => {
    const t = parseFloat(r.time);
    if (!Number.isFinite(t) || t <= 0) return false;
    if (!aircraftName) return true;
    return (r.aircraft || '').toLowerCase().includes(aircraftName.toLowerCase());
  });
  if (!filtered.length) return null;
  const totalMin = filtered.reduce((s, r) => s + parseFloat(r.time), 0);
  return { count: filtered.length, avgMin: totalMin / filtered.length, totalMin };
}

/* 代表的なセンサーサイズプリセット [mm] */
const SENSOR_PRESETS = {
  '1/2.3型':       { w: 6.17,  h: 4.55 },
  '1/2型':         { w: 6.40,  h: 4.80 },
  '1/1.7型':       { w: 7.60,  h: 5.70 },
  '1/1.3型':       { w: 9.60,  h: 7.20 },
  '1型(CMOS)':     { w: 13.2,  h: 8.8 },
  '4/3型(M4/3)':   { w: 17.3,  h: 13.0 },
  'APS-C':         { w: 23.5,  h: 15.6 },
  'フルサイズ':     { w: 36.0,  h: 24.0 },
};
