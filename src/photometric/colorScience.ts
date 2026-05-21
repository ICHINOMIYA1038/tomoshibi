// CIE 1931 色空間・相関色温度・色再現性関連の計算
// 教育/プロ用途のため正確な変換を用意

// ---- sRGB ⇄ Linear ----
export function srgbToLinear(c: number): number {
  return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4)
}
export function linearToSrgb(c: number): number {
  return c <= 0.0031308 ? c * 12.92 : 1.055 * Math.pow(c, 1 / 2.4) - 0.055
}

// ---- sRGB ⇄ CIE XYZ (D65) ----
// IEC 61966-2-1 標準
export function srgbToXYZ(rL: number, gL: number, bL: number): [number, number, number] {
  // 線形RGB → XYZ
  const X = rL * 0.4124564 + gL * 0.3575761 + bL * 0.1804375
  const Y = rL * 0.2126729 + gL * 0.7151522 + bL * 0.0721750
  const Z = rL * 0.0193339 + gL * 0.1191920 + bL * 0.9503041
  return [X, Y, Z]
}

// XYZ → CIE 1931 xy
export function xyzToXy(X: number, Y: number, Z: number): [number, number] {
  const s = X + Y + Z
  if (s < 1e-9) return [0.3127, 0.3290] // D65 fallback
  return [X / s, Y / s]
}

// sRGB (0..1) → xy directly
export function rgbToXy(r: number, g: number, b: number): [number, number] {
  const rL = srgbToLinear(r), gL = srgbToLinear(g), bL = srgbToLinear(b)
  const [X, Y, Z] = srgbToXYZ(rL, gL, bL)
  return xyzToXy(X, Y, Z)
}

// ---- 相関色温度 (CCT) ---- McCamy近似
// 精度: ±100K (2800-6500K), 教育用途充分
export function xyToCCT(x: number, y: number): number {
  const n = (x - 0.3320) / (0.1858 - y)
  return 449 * n ** 3 + 3525 * n ** 2 + 6823.3 * n + 5520.33
}

// ---- Duv (黒体軌跡からのズレ) ----
// 正 = 緑寄り, 負 = 紫寄り
// Ohno 2014 法 (近似)
export function xyToDuv(x: number, y: number): number {
  // CIE 1960 uv (近似)
  const denom = -2 * x + 12 * y + 3
  const u = (4 * x) / denom
  const v = (6 * y) / denom
  const CCT = xyToCCT(x, y)
  // 黒体軌跡上の uv (CCT に基づく近似)
  const T = Math.max(1000, Math.min(15000, CCT))
  // Krystek 1985 近似
  const T2 = T * T
  const uBB = (0.860117757 + 1.54118254e-4 * T + 1.28641212e-7 * T2) /
              (1 + 8.42420235e-4 * T + 7.08145163e-7 * T2)
  const vBB = (0.317398726 + 4.22806245e-5 * T + 4.20481691e-8 * T2) /
              (1 - 2.89741816e-5 * T + 1.61456053e-7 * T2)
  // 距離 (符号は v - vBB)
  const du = u - uBB
  const dv = v - vBB
  return Math.sign(dv) * Math.sqrt(du * du + dv * dv)
}

// ---- CRI 簡易推定 (Ra) ----
// 厳密な CRI は 8 試料スペクトル評価が必要。これは「光源の RGB から推定」する簡易版。
// 実用: LED の "見え方" のヒント程度。
// 連続スペクトル (白熱) は高い、狭帯域 LED は低い、と単純化。
export function estimateCRI(r: number, g: number, b: number, whiteMix: number = 0): number {
  // 彩度が高い = 単一波長 LED → CRI 低い
  // 白に近い (灰色) = 広帯域 → CRI 高い
  const maxC = Math.max(r, g, b)
  const minC = Math.min(r, g, b)
  const saturation = maxC > 1e-3 ? (maxC - minC) / maxC : 0
  // 白ミックスがあると CRI 改善
  const whiteBoost = whiteMix * 25
  // 単色 LED ベース 60, 白ミックスで最大 95 程度
  const ra = 95 - saturation * 35 + whiteBoost
  return Math.max(40, Math.min(100, ra))
}

// 色温度 (Kelvin) → xy (Planckian locus 近似)
export function cctToXy(cct: number): [number, number] {
  const T = Math.max(1667, Math.min(25000, cct))
  let x: number
  if (T <= 4000) {
    x = -0.2661239 * 1e9 / (T * T * T) - 0.2343589 * 1e6 / (T * T) + 0.8776956 * 1e3 / T + 0.179910
  } else {
    x = -3.0258469 * 1e9 / (T * T * T) + 2.1070379 * 1e6 / (T * T) + 0.2226347 * 1e3 / T + 0.240390
  }
  let y: number
  if (T <= 2222) {
    y = -1.1063814 * x ** 3 - 1.34811020 * x ** 2 + 2.18555832 * x - 0.20219683
  } else if (T <= 4000) {
    y = -0.9549476 * x ** 3 - 1.37418593 * x ** 2 + 2.09137015 * x - 0.16748867
  } else {
    y = 3.0817580 * x ** 3 - 5.87338670 * x ** 2 + 3.75112997 * x - 0.37001483
  }
  return [x, y]
}

// ---- JIS 舞台照度基準 (主観目安) ----
// 演劇照明 推奨レベル
export interface IlluminanceRef {
  level: string
  min: number
  max: number
  description: string
}
export const STAGE_ILLUMINANCE_REFERENCES: IlluminanceRef[] = [
  { level: '暗転後', min: 0, max: 10, description: '客電消灯直後の最小視認' },
  { level: '月夜の場面', min: 10, max: 50, description: '夜のシーン演出' },
  { level: '夕景', min: 50, max: 200, description: '夕方〜屋内薄明' },
  { level: '通常室内', min: 200, max: 500, description: '室内シーン標準' },
  { level: '主役顔ピン', min: 500, max: 1500, description: 'スポットライトの主光源' },
  { level: '明るい屋外', min: 1500, max: 5000, description: '日中屋外シーン演出' },
  { level: 'ハイコントラスト', min: 5000, max: 20000, description: '強調ピーク照明' },
]

export function classifyIlluminance(lux: number): IlluminanceRef {
  for (const r of STAGE_ILLUMINANCE_REFERENCES) {
    if (lux >= r.min && lux < r.max) return r
  }
  return STAGE_ILLUMINANCE_REFERENCES[STAGE_ILLUMINANCE_REFERENCES.length - 1]
}
