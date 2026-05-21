// 物理ベース配光プロファイル
//
// 各フィクスチャの配光は super-Gaussian で近似:
//   I(θ) = exp(-(θ/σ)^(2n)) + peak * exp(-(θ/(0.3*beam))^2)
// - n が大きいほどトップフラット (Profileなど硬いエッジ)
// - peak は中心ホットスポット (PARの強烈な中心)
// シェーダーと同じ式で UI プレビューにも使用

export type FixtureKind = 'PAR' | 'Fresnel' | 'PC' | 'Profile' | 'LED_PAR' | 'LED_Wash' | 'LED_Profile' | 'LED_Bar' | 'MovingHead'

// 光源タイプ
// - tungsten: 白熱/ハロゲン (固定色温度、ゲル乗算)
// - led-rgbw: RGBW LED (加法混色、色温度は無視しユーザ指定色)
// - led-tunable: 白色LED で色温度可変
export type LightSource = 'tungsten' | 'led-rgbw' | 'led-tunable'

export interface FixtureProfile {
  kind: FixtureKind
  brand?: string         // 例: 'Chauvet', 'ADJ', 'Stairville', 'ETC'
  model?: string         // 製品名
  source: LightSource
  // 配光プロファイル (度)
  beamAngleDeg: number
  fieldAngleDeg: number
  // 形状パラメータ
  flatness: number
  peak: number
  ellipticity: number
  // 物理特性
  fluxLumens: number
  beamAdjustable: boolean
  beamAngleMinDeg?: number
  beamAngleMaxDeg?: number
  colorTemperatureK: number
  // 外観 (3Dモデル)
  bodyLengthM: number
  bodyDiameterM: number
}

// 代表的なフィクスチャプロファイル
// 在来器具 (白熱) + サウンドハウス取扱の LED 機材
// LED の値は各メーカ公称スペックを参照
export const FIXTURE_PROFILES: Record<string, FixtureProfile> = {
  // ============ 在来 PAR (白熱) ============
  PAR64_VNSP: {
    kind: 'PAR', source: 'tungsten',
    brand: '在来', model: 'PAR64 VNSP (Very Narrow Spot)',
    beamAngleDeg: 9, fieldAngleDeg: 14,
    flatness: 1.3, peak: 0.8, ellipticity: 1.8,
    fluxLumens: 4500, beamAdjustable: false,
    colorTemperatureK: 3200,
    bodyLengthM: 0.30, bodyDiameterM: 0.20,
  },
  PAR64_NSP: {
    kind: 'PAR', source: 'tungsten',
    brand: '在来', model: 'PAR64 NSP (Narrow Spot)',
    beamAngleDeg: 11, fieldAngleDeg: 24,
    flatness: 1.2, peak: 0.6, ellipticity: 2.0,
    fluxLumens: 4500, beamAdjustable: false,
    colorTemperatureK: 3200,
    bodyLengthM: 0.30, bodyDiameterM: 0.20,
  },
  PAR64_MFL: {
    kind: 'PAR', source: 'tungsten',
    brand: '在来', model: 'PAR64 MFL (Medium Flood)',
    beamAngleDeg: 14, fieldAngleDeg: 26,
    flatness: 1.2, peak: 0.5, ellipticity: 1.7,
    fluxLumens: 4500, beamAdjustable: false,
    colorTemperatureK: 3200,
    bodyLengthM: 0.30, bodyDiameterM: 0.20,
  },
  PAR64_WFL: {
    kind: 'PAR', source: 'tungsten',
    brand: '在来', model: 'PAR64 WFL (Wide Flood)',
    beamAngleDeg: 24, fieldAngleDeg: 48,
    flatness: 1.1, peak: 0.4, ellipticity: 1.5,
    fluxLumens: 4500, beamAdjustable: false,
    colorTemperatureK: 3200,
    bodyLengthM: 0.30, bodyDiameterM: 0.20,
  },

  // ============ 在来 Fresnel ============
  Fresnel6: {
    kind: 'Fresnel', source: 'tungsten',
    brand: '在来', model: '6インチ フレネル 500W',
    beamAngleDeg: 20, fieldAngleDeg: 45,
    flatness: 1.0, peak: 0.15, ellipticity: 1.0,
    fluxLumens: 2000, beamAdjustable: true,
    beamAngleMinDeg: 10, beamAngleMaxDeg: 60,
    colorTemperatureK: 3200,
    bodyLengthM: 0.28, bodyDiameterM: 0.17,
  },
  Fresnel8: {
    kind: 'Fresnel', source: 'tungsten',
    brand: '在来', model: '8インチ フレネル 1kW',
    beamAngleDeg: 18, fieldAngleDeg: 42,
    flatness: 1.0, peak: 0.12, ellipticity: 1.0,
    fluxLumens: 3500, beamAdjustable: true,
    beamAngleMinDeg: 8, beamAngleMaxDeg: 55,
    colorTemperatureK: 3200,
    bodyLengthM: 0.35, bodyDiameterM: 0.22,
  },
  Fresnel10: {
    kind: 'Fresnel', source: 'tungsten',
    brand: '在来', model: '10インチ フレネル 2kW',
    beamAngleDeg: 16, fieldAngleDeg: 40,
    flatness: 1.0, peak: 0.12, ellipticity: 1.0,
    fluxLumens: 5000, beamAdjustable: true,
    beamAngleMinDeg: 7, beamAngleMaxDeg: 55,
    colorTemperatureK: 3200,
    bodyLengthM: 0.40, bodyDiameterM: 0.27,
  },

  // ============ 在来 PC (Plano-Convex) ============
  PC6: {
    kind: 'PC', source: 'tungsten',
    brand: '在来', model: '6インチ PC 500W',
    beamAngleDeg: 14, fieldAngleDeg: 24,
    flatness: 1.6, peak: 0.08, ellipticity: 1.0,
    fluxLumens: 2000, beamAdjustable: true,
    beamAngleMinDeg: 7, beamAngleMaxDeg: 45,
    colorTemperatureK: 3200,
    bodyLengthM: 0.30, bodyDiameterM: 0.17,
  },
  PC8: {
    kind: 'PC', source: 'tungsten',
    brand: '在来', model: '8インチ PC 1kW',
    beamAngleDeg: 12, fieldAngleDeg: 22,
    flatness: 1.7, peak: 0.08, ellipticity: 1.0,
    fluxLumens: 3500, beamAdjustable: true,
    beamAngleMinDeg: 6, beamAngleMaxDeg: 40,
    colorTemperatureK: 3200,
    bodyLengthM: 0.38, bodyDiameterM: 0.22,
  },

  // ============ 在来 Profile (Source Four / Ellipsoidal) ============
  Source4_19: {
    kind: 'Profile', source: 'tungsten',
    brand: 'ETC', model: 'Source Four 750W (19°)',
    beamAngleDeg: 17, fieldAngleDeg: 19,
    flatness: 3.0, peak: 0.0, ellipticity: 1.0,
    fluxLumens: 7000, beamAdjustable: false,
    colorTemperatureK: 3050,
    bodyLengthM: 0.55, bodyDiameterM: 0.18,
  },
  Source4_26: {
    kind: 'Profile', source: 'tungsten',
    brand: 'ETC', model: 'Source Four 750W (26°)',
    beamAngleDeg: 23, fieldAngleDeg: 26,
    flatness: 3.0, peak: 0.0, ellipticity: 1.0,
    fluxLumens: 7000, beamAdjustable: false,
    colorTemperatureK: 3050,
    bodyLengthM: 0.55, bodyDiameterM: 0.18,
  },
  Source4_36: {
    kind: 'Profile', source: 'tungsten',
    brand: 'ETC', model: 'Source Four 750W (36°)',
    beamAngleDeg: 33, fieldAngleDeg: 36,
    flatness: 3.0, peak: 0.0, ellipticity: 1.0,
    fluxLumens: 7000, beamAdjustable: false,
    colorTemperatureK: 3050,
    bodyLengthM: 0.55, bodyDiameterM: 0.18,
  },
  Source4_50: {
    kind: 'Profile', source: 'tungsten',
    brand: 'ETC', model: 'Source Four 750W (50°)',
    beamAngleDeg: 45, fieldAngleDeg: 50,
    flatness: 2.8, peak: 0.0, ellipticity: 1.0,
    fluxLumens: 7000, beamAdjustable: false,
    colorTemperatureK: 3050,
    bodyLengthM: 0.55, bodyDiameterM: 0.18,
  },

  // ============ サウンドハウス取扱 LED PAR ============
  Stairville_LEDPar64_RGBW: {
    kind: 'LED_PAR', source: 'led-rgbw',
    brand: 'Stairville', model: 'LED PAR 64 7x10W RGBW',
    beamAngleDeg: 25, fieldAngleDeg: 40,
    flatness: 1.4, peak: 0.3, ellipticity: 1.0,
    fluxLumens: 2200, beamAdjustable: false,
    colorTemperatureK: 6500,
    bodyLengthM: 0.28, bodyDiameterM: 0.20,
  },
  Chauvet_SlimPAR_ProQ: {
    kind: 'LED_PAR', source: 'led-rgbw',
    brand: 'Chauvet', model: 'SlimPAR Pro Q USB',
    beamAngleDeg: 14, fieldAngleDeg: 22,
    flatness: 1.5, peak: 0.4, ellipticity: 1.0,
    fluxLumens: 1620, beamAdjustable: false,
    colorTemperatureK: 6500,
    bodyLengthM: 0.10, bodyDiameterM: 0.22,
  },
  ADJ_MegaHexPar: {
    kind: 'LED_PAR', source: 'led-rgbw',
    brand: 'ADJ', model: 'Mega Hex Par (6-IN-1)',
    beamAngleDeg: 30, fieldAngleDeg: 50,
    flatness: 1.3, peak: 0.25, ellipticity: 1.0,
    fluxLumens: 1062, beamAdjustable: false,
    colorTemperatureK: 6500,
    bodyLengthM: 0.18, bodyDiameterM: 0.18,
  },

  // ============ LED Wash (ズーム可) ============
  Chauvet_COLORado2Solo: {
    kind: 'LED_Wash', source: 'led-rgbw',
    brand: 'Chauvet', model: 'COLORado 2 Solo',
    beamAngleDeg: 12, fieldAngleDeg: 25,
    flatness: 1.5, peak: 0.3, ellipticity: 1.0,
    fluxLumens: 6800, beamAdjustable: true,
    beamAngleMinDeg: 7, beamAngleMaxDeg: 32,
    colorTemperatureK: 6500,
    bodyLengthM: 0.35, bodyDiameterM: 0.26,
  },
  Stairville_BMV415: {
    kind: 'LED_Wash', source: 'led-rgbw',
    brand: 'Stairville', model: 'BMV-415 MK2 Bee Eye',
    beamAngleDeg: 8, fieldAngleDeg: 60,
    flatness: 1.3, peak: 0.5, ellipticity: 1.0,
    fluxLumens: 5000, beamAdjustable: true,
    beamAngleMinDeg: 4, beamAngleMaxDeg: 60,
    colorTemperatureK: 6500,
    bodyLengthM: 0.32, bodyDiameterM: 0.25,
  },

  // ============ LED Profile (Ellipsoidal) ============
  ETC_S4LED_Lustr_26: {
    kind: 'LED_Profile', source: 'led-rgbw',
    brand: 'ETC', model: 'Source Four LED Series 2 Lustr X8 (26°)',
    beamAngleDeg: 23, fieldAngleDeg: 26,
    flatness: 3.0, peak: 0.0, ellipticity: 1.0,
    fluxLumens: 13000, beamAdjustable: false,
    colorTemperatureK: 5500,
    bodyLengthM: 0.55, bodyDiameterM: 0.18,
  },
  ETC_S4LED_Lustr_36: {
    kind: 'LED_Profile', source: 'led-rgbw',
    brand: 'ETC', model: 'Source Four LED Series 2 Lustr X8 (36°)',
    beamAngleDeg: 33, fieldAngleDeg: 36,
    flatness: 3.0, peak: 0.0, ellipticity: 1.0,
    fluxLumens: 13000, beamAdjustable: false,
    colorTemperatureK: 5500,
    bodyLengthM: 0.55, bodyDiameterM: 0.18,
  },

  // ============ LED Bar ============
  Stairville_ShowBar_TriLED: {
    kind: 'LED_Bar', source: 'led-rgbw',
    brand: 'Stairville', model: 'Show Bar Tri LED 18x3W',
    beamAngleDeg: 25, fieldAngleDeg: 40,
    flatness: 1.4, peak: 0.25, ellipticity: 2.5,
    fluxLumens: 2700, beamAdjustable: false,
    colorTemperatureK: 6500,
    bodyLengthM: 1.00, bodyDiameterM: 0.06,
  },

  // ============ Moving Beam ============
  Robe_LEDBeam150: {
    kind: 'MovingHead', source: 'led-rgbw',
    brand: 'Robe', model: 'Robin LEDBeam 150',
    beamAngleDeg: 4, fieldAngleDeg: 6,
    flatness: 2.0, peak: 0.7, ellipticity: 1.0,
    fluxLumens: 1800, beamAdjustable: false,
    colorTemperatureK: 8000,
    bodyLengthM: 0.38, bodyDiameterM: 0.22,
  },
}

export const FIXTURE_PRESETS_BY_KIND: Record<FixtureKind, string[]> = {
  PAR: ['PAR64_VNSP', 'PAR64_NSP', 'PAR64_MFL', 'PAR64_WFL'],
  Fresnel: ['Fresnel6', 'Fresnel8', 'Fresnel10'],
  PC: ['PC6', 'PC8'],
  Profile: ['Source4_19', 'Source4_26', 'Source4_36', 'Source4_50'],
  LED_PAR: ['Stairville_LEDPar64_RGBW', 'Chauvet_SlimPAR_ProQ', 'ADJ_MegaHexPar'],
  LED_Wash: ['Chauvet_COLORado2Solo', 'Stairville_BMV415'],
  LED_Profile: ['ETC_S4LED_Lustr_26', 'ETC_S4LED_Lustr_36'],
  LED_Bar: ['Stairville_ShowBar_TriLED'],
  MovingHead: ['Robe_LEDBeam150'],
}

// 種別の表示ラベル
export const KIND_LABELS: Record<FixtureKind, string> = {
  PAR: 'PAR (パーライト)',
  Fresnel: 'Fresnel (フレネル)',
  PC: 'PC (凸レンズ)',
  Profile: 'Profile (エリプソイダル)',
  LED_PAR: 'LED PAR',
  LED_Wash: 'LED Wash',
  LED_Profile: 'LED Profile',
  LED_Bar: 'LED Bar',
  MovingHead: 'Moving Head',
}

// 色温度 (K) → RGB近似 (sRGB, 線形でない簡易変換)
// Tanner Helland's approximation
export function kelvinToRGB(k: number): [number, number, number] {
  const temp = Math.max(1000, Math.min(40000, k)) / 100
  let r: number, g: number, b: number
  if (temp <= 66) {
    r = 255
    g = 99.4708025861 * Math.log(temp) - 161.1195681661
    b = temp <= 19 ? 0 : 138.5177312231 * Math.log(temp - 10) - 305.0447927307
  } else {
    r = 329.698727446 * Math.pow(temp - 60, -0.1332047592)
    g = 288.1221695283 * Math.pow(temp - 60, -0.0755148492)
    b = 255
  }
  return [
    Math.max(0, Math.min(255, r)) / 255,
    Math.max(0, Math.min(255, g)) / 255,
    Math.max(0, Math.min(255, b)) / 255,
  ]
}

// 配光プロファイル評価 (TypeScript側でもプレビュー用に同じ式)
export function beamIntensity(
  angleRad: number,
  beamHalfRad: number,
  fieldHalfRad: number,
  flatness: number,
  peak: number,
): number {
  if (angleRad >= fieldHalfRad * 1.05) return 0
  // super-Gaussian
  const sigma = beamHalfRad / Math.pow(Math.LN2, 1 / (2 * flatness))
  const core = Math.exp(-Math.pow(angleRad / sigma, 2 * flatness))
  const center = Math.exp(-Math.pow(angleRad / (beamHalfRad * 0.3 + 1e-6), 2))
  const cutoff = 1 - Math.min(1, Math.max(0, (angleRad - fieldHalfRad) / (fieldHalfRad * 0.05 + 1e-6)))
  return (core + peak * center) * cutoff
}
