// 物理ベース配光プロファイル
//
// 各フィクスチャの配光は super-Gaussian で近似:
//   I(θ) = exp(-(θ/σ)^(2n)) + peak * exp(-(θ/(0.3*beam))^2)
// - n が大きいほどトップフラット (Profileなど硬いエッジ)
// - peak は中心ホットスポット (PARの強烈な中心)
// シェーダーと同じ式で UI プレビューにも使用

export type FixtureKind = 'PAR' | 'Fresnel' | 'PC' | 'Profile' | 'Border' | 'Cyc' | 'Footlight' | 'LED_PAR' | 'LED_Wash' | 'LED_Profile' | 'LED_Bar' | 'MovingHead' | 'FollowSpot'

// 光源タイプ
// - tungsten: 白熱/ハロゲン (固定色温度、ゲル乗算)
// - led-rgbw: RGBW LED (加法混色、色温度は無視しユーザ指定色)
// - led-tunable: 白色LED で色温度可変
export type LightSource = 'tungsten' | 'led-rgbw' | 'led-tunable'

export interface FixtureProfile {
  kind: FixtureKind
  /** 画面に出す名前。「種類＋ワット数（＋角度）」。メーカーの製品名は出さない */
  model?: string
  /** 追加の一覧に出さない（古いプランの読み込みのためだけに残す） */
  hidden?: boolean
  source: LightSource
  // 配光プロファイル (度)
  beamAngleDeg: number
  fieldAngleDeg: number
  // 形状パラメータ
  flatness: number
  peak: number
  ellipticity: number
  beamShape?: 'cyc'
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

// 代表的な照明器具。日本の劇場の機材表に合わせ、「種類＋ワット数（＋角度）」の汎用の器具として持つ。
// 値は同じ種類の器具の公称値をもとにした目安で、特定の製品の再現ではない。
// キー（Source4_26 など）は保存済みのプランが参照しているので変えない
export const FIXTURE_PROFILES: Record<string, FixtureProfile> = {
  CycWashStudy: {
    kind: 'Cyc', source: 'led-rgbw',
    model: 'アッパーホリゾント LED（カラー）',
    beamAngleDeg: 40, fieldAngleDeg: 90,
    flatness: 1, peak: 0, ellipticity: 1,
    beamShape: 'cyc',
    fluxLumens: 5000, beamAdjustable: false,
    colorTemperatureK: 6500,
    bodyLengthM: 0.35, bodyDiameterM: 0.26,
  },
  // ============ 在来 PAR (白熱) ============
  PAR64_VNSP: {
    kind: 'PAR', source: 'tungsten',
    model: 'パーライト 1kW VN（ごく狭い）',
    beamAngleDeg: 9, fieldAngleDeg: 14,
    flatness: 1.3, peak: 0.8, ellipticity: 1.8,
    fluxLumens: 4500, beamAdjustable: false,
    colorTemperatureK: 3200,
    bodyLengthM: 0.30, bodyDiameterM: 0.20,
  },
  PAR64_NSP: {
    kind: 'PAR', source: 'tungsten',
    model: 'パーライト 1kW N（狭い）',
    beamAngleDeg: 11, fieldAngleDeg: 24,
    flatness: 1.2, peak: 0.6, ellipticity: 2.0,
    fluxLumens: 4500, beamAdjustable: false,
    colorTemperatureK: 3200,
    bodyLengthM: 0.30, bodyDiameterM: 0.20,
  },
  PAR64_MFL: {
    kind: 'PAR', source: 'tungsten',
    model: 'パーライト 1kW M（中くらい）',
    beamAngleDeg: 14, fieldAngleDeg: 26,
    flatness: 1.2, peak: 0.5, ellipticity: 1.7,
    fluxLumens: 4500, beamAdjustable: false,
    colorTemperatureK: 3200,
    bodyLengthM: 0.30, bodyDiameterM: 0.20,
  },
  PAR64_WFL: {
    kind: 'PAR', source: 'tungsten',
    model: 'パーライト 1kW W（広い）', hidden: true,
    beamAngleDeg: 24, fieldAngleDeg: 48,
    flatness: 1.1, peak: 0.4, ellipticity: 1.5,
    fluxLumens: 4500, beamAdjustable: false,
    colorTemperatureK: 3200,
    bodyLengthM: 0.30, bodyDiameterM: 0.20,
  },
  // AC ライト（航空機の着陸灯の電球を使う、ごく細く強い光。上から床へ光の柱を立てる）
  ACL_Beam: {
    kind: 'PAR', source: 'tungsten',
    model: 'AC ライト（細い光の柱）',
    beamAngleDeg: 4, fieldAngleDeg: 8,
    flatness: 1.4, peak: 0.6, ellipticity: 1.2,
    fluxLumens: 3500, beamAdjustable: false,
    colorTemperatureK: 3800,
    bodyLengthM: 0.30, bodyDiameterM: 0.20,
  },

  // ============ 在来 Fresnel ============
  Fresnel6: {
    kind: 'Fresnel', source: 'tungsten',
    model: 'フレネル 500W',
    beamAngleDeg: 20, fieldAngleDeg: 45,
    flatness: 1.0, peak: 0.15, ellipticity: 1.0,
    fluxLumens: 2000, beamAdjustable: true,
    beamAngleMinDeg: 10, beamAngleMaxDeg: 60,
    colorTemperatureK: 3200,
    bodyLengthM: 0.28, bodyDiameterM: 0.17,
  },
  Fresnel8: {
    kind: 'Fresnel', source: 'tungsten',
    model: 'フレネル 1kW',
    beamAngleDeg: 18, fieldAngleDeg: 42,
    flatness: 1.0, peak: 0.12, ellipticity: 1.0,
    fluxLumens: 3500, beamAdjustable: true,
    beamAngleMinDeg: 8, beamAngleMaxDeg: 55,
    colorTemperatureK: 3200,
    bodyLengthM: 0.35, bodyDiameterM: 0.22,
  },
  Fresnel10: {
    kind: 'Fresnel', source: 'tungsten',
    model: 'フレネル 2kW', hidden: true,
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
    model: '平凸 500W',
    beamAngleDeg: 14, fieldAngleDeg: 24,
    flatness: 1.6, peak: 0.08, ellipticity: 1.0,
    fluxLumens: 2000, beamAdjustable: true,
    beamAngleMinDeg: 7, beamAngleMaxDeg: 45,
    colorTemperatureK: 3200,
    bodyLengthM: 0.30, bodyDiameterM: 0.17,
  },
  PC8: {
    kind: 'PC', source: 'tungsten',
    model: '平凸 1kW',
    beamAngleDeg: 12, fieldAngleDeg: 22,
    flatness: 1.7, peak: 0.08, ellipticity: 1.0,
    fluxLumens: 3500, beamAdjustable: true,
    beamAngleMinDeg: 6, beamAngleMaxDeg: 40,
    colorTemperatureK: 3200,
    bodyLengthM: 0.38, bodyDiameterM: 0.22,
  },
  PC1500: {
    kind: 'PC', source: 'tungsten',
    model: '平凸 1.5kW',
    beamAngleDeg: 11, fieldAngleDeg: 21,
    flatness: 1.7, peak: 0.08, ellipticity: 1.0,
    fluxLumens: 5500, beamAdjustable: true,
    beamAngleMinDeg: 6, beamAngleMaxDeg: 40,
    colorTemperatureK: 3200,
    bodyLengthM: 0.42, bodyDiameterM: 0.26,
  },
  Fresnel1500: {
    kind: 'Fresnel', source: 'tungsten',
    model: 'フレネル 1.5kW',
    beamAngleDeg: 17, fieldAngleDeg: 41,
    flatness: 1.0, peak: 0.12, ellipticity: 1.0,
    fluxLumens: 4300, beamAdjustable: true,
    beamAngleMinDeg: 8, beamAngleMaxDeg: 55,
    colorTemperatureK: 3200,
    bodyLengthM: 0.38, bodyDiameterM: 0.25,
  },

  // ============ 白色 LED（色温度を変えられる。ハロゲン 1kW 相当の明るさ）============
  LED_PC_White: {
    kind: 'PC', source: 'led-tunable',
    model: 'LED 平凸（白色・1kW 相当）',
    beamAngleDeg: 12, fieldAngleDeg: 22,
    flatness: 1.7, peak: 0.08, ellipticity: 1.0,
    fluxLumens: 3800, beamAdjustable: true,
    beamAngleMinDeg: 6, beamAngleMaxDeg: 40,
    colorTemperatureK: 3200,
    bodyLengthM: 0.38, bodyDiameterM: 0.22,
  },
  LED_Fresnel_White: {
    kind: 'Fresnel', source: 'led-tunable',
    model: 'LED フレネル（白色・1kW 相当）',
    beamAngleDeg: 18, fieldAngleDeg: 42,
    flatness: 1.0, peak: 0.12, ellipticity: 1.0,
    fluxLumens: 3800, beamAdjustable: true,
    beamAngleMinDeg: 8, beamAngleMaxDeg: 55,
    colorTemperatureK: 3200,
    bodyLengthM: 0.36, bodyDiameterM: 0.24,
  },

  // ============ ボーダー・ホリゾント・フット（横に長い器具。舞台の幅いっぱいに並べて使う）============
  Border1800: {
    kind: 'Border', source: 'tungsten',
    model: 'ボーダー 1.8m（ハロゲン）',
    beamAngleDeg: 60, fieldAngleDeg: 110,
    flatness: 1.0, peak: 0, ellipticity: 2.0,
    fluxLumens: 12000, beamAdjustable: false,
    colorTemperatureK: 3000,
    bodyLengthM: 1.8, bodyDiameterM: 0.2,
  },
  LowerCycLED: {
    kind: 'Cyc', source: 'led-rgbw',
    model: 'ロアーホリゾント LED（カラー）',
    beamAngleDeg: 40, fieldAngleDeg: 90,
    flatness: 1, peak: 0, ellipticity: 1,
    beamShape: 'cyc',
    fluxLumens: 5000, beamAdjustable: false,
    colorTemperatureK: 6500,
    bodyLengthM: 0.6, bodyDiameterM: 0.25,
  },
  Footlight1800: {
    kind: 'Footlight', source: 'tungsten',
    model: 'フット 1.8m（ハロゲン）',
    beamAngleDeg: 50, fieldAngleDeg: 100,
    flatness: 1.0, peak: 0, ellipticity: 2.0,
    fluxLumens: 6000, beamAdjustable: false,
    colorTemperatureK: 3000,
    bodyLengthM: 1.8, bodyDiameterM: 0.14,
  },

  // ============ 在来 エリスポ（エリプソイダル）============
  Source4_19: {
    kind: 'Profile', source: 'tungsten',
    model: 'エリスポ 750W 19°',
    beamAngleDeg: 17, fieldAngleDeg: 19,
    flatness: 3.0, peak: 0.0, ellipticity: 1.0,
    fluxLumens: 7000, beamAdjustable: false,
    colorTemperatureK: 3050,
    bodyLengthM: 0.55, bodyDiameterM: 0.18,
  },
  Source4_26: {
    kind: 'Profile', source: 'tungsten',
    model: 'エリスポ 750W 26°',
    beamAngleDeg: 23, fieldAngleDeg: 26,
    flatness: 3.0, peak: 0.0, ellipticity: 1.0,
    fluxLumens: 7000, beamAdjustable: false,
    colorTemperatureK: 3050,
    bodyLengthM: 0.55, bodyDiameterM: 0.18,
  },
  Source4_36: {
    kind: 'Profile', source: 'tungsten',
    model: 'エリスポ 750W 36°',
    beamAngleDeg: 33, fieldAngleDeg: 36,
    flatness: 3.0, peak: 0.0, ellipticity: 1.0,
    fluxLumens: 7000, beamAdjustable: false,
    colorTemperatureK: 3050,
    bodyLengthM: 0.55, bodyDiameterM: 0.18,
  },
  Source4_50: {
    kind: 'Profile', source: 'tungsten',
    model: 'エリスポ 750W 50°',
    beamAngleDeg: 45, fieldAngleDeg: 50,
    flatness: 2.8, peak: 0.0, ellipticity: 1.0,
    fluxLumens: 7000, beamAdjustable: false,
    colorTemperatureK: 3050,
    bodyLengthM: 0.55, bodyDiameterM: 0.18,
  },

  // ============ LED パーライト ============
  Stairville_LEDPar64_RGBW: {
    kind: 'LED_PAR', source: 'led-rgbw',
    model: 'LED パーライト（カラー）',
    beamAngleDeg: 25, fieldAngleDeg: 40,
    flatness: 1.4, peak: 0.3, ellipticity: 1.0,
    fluxLumens: 2200, beamAdjustable: false,
    colorTemperatureK: 6500,
    bodyLengthM: 0.28, bodyDiameterM: 0.20,
  },
  Chauvet_SlimPAR_ProQ: {
    kind: 'LED_PAR', source: 'led-rgbw',
    model: 'LED パーライト（カラー・狭い）', hidden: true,
    beamAngleDeg: 14, fieldAngleDeg: 22,
    flatness: 1.5, peak: 0.4, ellipticity: 1.0,
    fluxLumens: 1620, beamAdjustable: false,
    colorTemperatureK: 6500,
    bodyLengthM: 0.10, bodyDiameterM: 0.22,
  },
  ADJ_MegaHexPar: {
    kind: 'LED_PAR', source: 'led-rgbw',
    model: 'LED パーライト（カラー・広い）', hidden: true,
    beamAngleDeg: 30, fieldAngleDeg: 50,
    flatness: 1.3, peak: 0.25, ellipticity: 1.0,
    fluxLumens: 1062, beamAdjustable: false,
    colorTemperatureK: 6500,
    bodyLengthM: 0.18, bodyDiameterM: 0.18,
  },

  // ============ LED Wash (ズーム可) ============
  Chauvet_COLORado2Solo: {
    kind: 'LED_Wash', source: 'led-rgbw',
    model: 'LED ウォッシュ（カラー・ズーム）',
    beamAngleDeg: 12, fieldAngleDeg: 25,
    flatness: 1.5, peak: 0.3, ellipticity: 1.0,
    fluxLumens: 6800, beamAdjustable: true,
    beamAngleMinDeg: 7, beamAngleMaxDeg: 32,
    colorTemperatureK: 6500,
    bodyLengthM: 0.35, bodyDiameterM: 0.26,
  },
  Stairville_BMV415: {
    kind: 'LED_Wash', source: 'led-rgbw',
    model: 'LED ウォッシュ（カラー・ビーム）', hidden: true,
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
    model: 'LED エリスポ 26°（カラー）',
    beamAngleDeg: 23, fieldAngleDeg: 26,
    flatness: 3.0, peak: 0.0, ellipticity: 1.0,
    fluxLumens: 13000, beamAdjustable: false,
    colorTemperatureK: 5500,
    bodyLengthM: 0.55, bodyDiameterM: 0.18,
  },
  ETC_S4LED_Lustr_36: {
    kind: 'LED_Profile', source: 'led-rgbw',
    model: 'LED エリスポ 36°（カラー）',
    beamAngleDeg: 33, fieldAngleDeg: 36,
    flatness: 3.0, peak: 0.0, ellipticity: 1.0,
    fluxLumens: 13000, beamAdjustable: false,
    colorTemperatureK: 5500,
    bodyLengthM: 0.55, bodyDiameterM: 0.18,
  },

  // ============ LED Bar ============
  Stairville_ShowBar_TriLED: {
    kind: 'LED_Bar', source: 'led-rgbw',
    model: 'LED バー 1m（カラー）',
    beamAngleDeg: 25, fieldAngleDeg: 40,
    flatness: 1.4, peak: 0.25, ellipticity: 2.5,
    fluxLumens: 2700, beamAdjustable: false,
    colorTemperatureK: 6500,
    bodyLengthM: 1.00, bodyDiameterM: 0.06,
  },

  // ============ ピンスポット（客席の後ろから、人が操作して役者を追う。クセノン 2kW 級の目安）============
  FollowSpotXenon2k: {
    kind: 'FollowSpot', source: 'tungsten',
    model: 'ピンスポット クセノン 2kW',
    beamAngleDeg: 4, fieldAngleDeg: 5,
    flatness: 1.6, peak: 0.3, ellipticity: 1.0,
    fluxLumens: 40000, beamAdjustable: true, beamAngleMinDeg: 1.5, beamAngleMaxDeg: 10,
    // クセノンは昼光に近い白。ゲルは在来器具と同じく掛け算で効かせる
    colorTemperatureK: 6000,
    bodyLengthM: 0.9, bodyDiameterM: 0.3,
  },
  // ============ ムービング（汎用。メーカーの製品ではなく、よくある大きさと明るさの目安）============
  MovingSpotGeneric: {
    kind: 'MovingHead', source: 'led-rgbw',
    model: 'ムービング スポット',
    beamAngleDeg: 18, fieldAngleDeg: 24,
    flatness: 1.3, peak: 0.5, ellipticity: 1.0,
    fluxLumens: 9000, beamAdjustable: true, beamAngleMinDeg: 10, beamAngleMaxDeg: 36,
    colorTemperatureK: 7000,
    bodyLengthM: 0.42, bodyDiameterM: 0.26,
  },
  MovingWashGeneric: {
    kind: 'MovingHead', source: 'led-rgbw',
    model: 'ムービング ウォッシュ',
    beamAngleDeg: 24, fieldAngleDeg: 40,
    flatness: 0.8, peak: 0.2, ellipticity: 1.0,
    fluxLumens: 8000, beamAdjustable: true, beamAngleMinDeg: 10, beamAngleMaxDeg: 50,
    colorTemperatureK: 6500,
    bodyLengthM: 0.36, bodyDiameterM: 0.32,
  },
  Robe_LEDBeam150: {
    kind: 'MovingHead', source: 'led-rgbw',
    model: 'ムービング ビーム（細い光）',
    beamAngleDeg: 4, fieldAngleDeg: 6,
    flatness: 2.0, peak: 0.7, ellipticity: 1.0,
    fluxLumens: 1800, beamAdjustable: false,
    colorTemperatureK: 8000,
    bodyLengthM: 0.38, bodyDiameterM: 0.22,
  },
}

// 追加の一覧の並び。日本の劇場の機材表に合わせて、種類ごとにワット数の小さい順。ムービングは最後
export const FIXTURE_PRESETS_BY_KIND: Record<FixtureKind, string[]> = {
  PC: ['PC6', 'PC8', 'PC1500', 'LED_PC_White'],
  Fresnel: ['Fresnel6', 'Fresnel8', 'Fresnel1500', 'Fresnel10', 'LED_Fresnel_White'],
  Profile: ['Source4_19', 'Source4_26', 'Source4_36', 'Source4_50'],
  PAR: ['PAR64_VNSP', 'PAR64_NSP', 'PAR64_MFL', 'PAR64_WFL', 'ACL_Beam'],
  Border: ['Border1800'],
  Cyc: ['CycWashStudy', 'LowerCycLED'],
  Footlight: ['Footlight1800'],
  LED_PAR: ['Stairville_LEDPar64_RGBW', 'Chauvet_SlimPAR_ProQ', 'ADJ_MegaHexPar'],
  LED_Wash: ['Chauvet_COLORado2Solo', 'Stairville_BMV415'],
  LED_Profile: ['ETC_S4LED_Lustr_26', 'ETC_S4LED_Lustr_36'],
  LED_Bar: ['Stairville_ShowBar_TriLED'],
  FollowSpot: ['FollowSpotXenon2k'],
  MovingHead: ['MovingSpotGeneric', 'MovingWashGeneric', 'Robe_LEDBeam150'],
}

/** 追加の一覧に出す器具（古いプランのためだけに残しているものを除く） */
export function addablePresets(kind: FixtureKind): string[] {
  return FIXTURE_PRESETS_BY_KIND[kind].filter(key => !FIXTURE_PROFILES[key]?.hidden)
}

// 種別の表示ラベル（日本の劇場での呼び名）。並びは追加の一覧の順
export const KIND_LABELS: Record<FixtureKind, string> = {
  PC: '平凸',
  Fresnel: 'フレネル',
  Profile: 'エリスポ',
  PAR: 'パーライト',
  Border: 'ボーダー',
  Cyc: 'ホリゾント',
  Footlight: 'フット',
  LED_PAR: 'LED パーライト',
  LED_Wash: 'LED ウォッシュ',
  LED_Profile: 'LED エリスポ',
  LED_Bar: 'LED バー',
  FollowSpot: 'ピンスポット',
  MovingHead: 'ムービング',
}

/** 画面の注記。製品名は出していないが、配光が実機と違うことは必ず伝える */
export const FIXTURE_DISCLAIMER = '器具の値は、同じ種類の器具の公称値をもとにした近似です。実機とは異なります。'

/**
 * 調光したときの電球の色温度（K）。ハロゲンは絞るほど赤くなる（色温度は明るさのおよそ 0.11 乗に比例）。
 * 10% で 3200K → 約 2500K。クセノンのピンスポットとLEDは絞っても色が変わらない
 */
export function dimmedKelvin(profile: FixtureProfile, intensity: number) {
  if (profile.source !== 'tungsten' || profile.kind === 'FollowSpot') return profile.colorTemperatureK
  const level = Math.max(0.01, Math.min(1, intensity))
  return profile.colorTemperatureK * Math.pow(level, 0.11)
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
