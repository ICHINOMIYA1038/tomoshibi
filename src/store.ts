import { create } from 'zustand'
import * as THREE from 'three'
import { FIXTURE_PROFILES, kelvinToRGB } from './lighting/fixtureTypes'

let nextFid = 1
let nextPid = 1
const genFid = () => `f${nextFid++}`
const genPid = () => `p${nextPid++}`

export interface Fixture {
  id: string
  name: string
  presetKey: string
  position: [number, number, number]
  target: [number, number, number]
  beamAngleDeg: number
  intensity: number
  // 色: 在来器具ではゲルフィルタ、LEDでは直接出力色
  color: [number, number, number]
  gelEnabled: boolean             // 在来器具のみ意味あり (false ならゲルなし白色)
  whiteMix: number                // LED only: W チャンネル (0..1)
  colorTempK: number              // LED tunable only: 可変色温度
  rotationZDeg: number
  enabled: boolean
}

export interface Performer {
  id: string
  name: string
  position: [number, number, number]
  scale: number       // 身長スケール 0.7=子, 1.0=平均, 1.2=高身長
  color: string       // 服色
  pose: 'standing' | 'sitting'
}

export type SelectionKind = 'fixture' | 'performer' | 'setpiece' | null
export interface Selection {
  kind: SelectionKind
  id: string | null
  // フィクスチャ選択時、移動対象が 'position' か 'target' か
  fixtureHandle?: 'position' | 'target'
}

export type QualityPreset = 'low' | 'medium' | 'high' | 'ultra'

export interface QualityConfig {
  volumetricSteps: number     // ボリュメトリック・レイマーチ ステップ数
  volumetricScale: number     // 解像度倍率 (0.5 = 1/4 ピクセル数)
  shadowSteps: number         // SDF シャドウマーチ ステップ数
  shadowSoft: boolean         // ソフト影 (false=ハード)
  bounceEnabled: boolean      // 一次バウンス光
  bloomLevels: number         // ブルームミップ段数
  pixelRatio: number          // Canvas dpr 上限
  jitterStrength: number      // ボリュメトリック ジッター強度 (低いほど縞減・バンディング増)
  hazeNoise: boolean          // ヘイズ密度ノイズの有無
}
// 起動時の品質を環境から推定
function detectInitialQuality(): QualityPreset {
  if (typeof window === 'undefined' || typeof navigator === 'undefined') return 'medium'
  const ua = navigator.userAgent
  const isMobile = /iPhone|Android.+Mobile|Windows Phone/.test(ua)
  const isTablet = /iPad|Android(?!.*Mobile)/.test(ua)
  if (isMobile) return 'low'
  if (isTablet) return 'medium'
  // デスクトップ: cores とメモリを軽く判定
  const cores = (navigator as any).hardwareConcurrency || 4
  const mem = (navigator as any).deviceMemory || 8
  if (cores <= 4 || mem <= 4) return 'medium'
  return 'high'
}

export const QUALITY_PRESETS: Record<QualityPreset, QualityConfig> = {
  low: {
    volumetricSteps: 24, volumetricScale: 0.7, shadowSteps: 10, shadowSoft: false,
    bounceEnabled: false, bloomLevels: 3, pixelRatio: 1.0, jitterStrength: 0.15, hazeNoise: false,
  },
  medium: {
    volumetricSteps: 40, volumetricScale: 0.85, shadowSteps: 16, shadowSoft: true,
    bounceEnabled: true, bloomLevels: 4, pixelRatio: 1.0, jitterStrength: 0.1, hazeNoise: false,
  },
  high: {
    volumetricSteps: 64, volumetricScale: 1.0, shadowSteps: 24, shadowSoft: true,
    bounceEnabled: true, bloomLevels: 5, pixelRatio: 1.5, jitterStrength: 0.06, hazeNoise: false,
  },
  ultra: {
    volumetricSteps: 96, volumetricScale: 1.0, shadowSteps: 36, shadowSoft: true,
    bounceEnabled: true, bloomLevels: 6, pixelRatio: 2.0, jitterStrength: 0.04, hazeNoise: true,
  },
}

export interface SceneSettings {
  hazeDensity: number
  ambient: number
  exposure: number
  bloom: number
  showHouseLights: boolean
  showFixtureMeshes: boolean
  showStage: boolean
  showGizmos: boolean
  showPerformers: boolean
  cameraView: 'audience' | 'aerial' | 'sidewing' | 'free'
  transformMode: 'translate' | 'rotate'
  uiTab: 'fixtures' | 'performers' | 'props'
  settingsOpen: boolean
  settingsTab: 'scene' | 'look' | 'advanced'
  quality: QualityPreset
  showHelp: boolean
  probeMode: boolean
  dmxEnabled: boolean
  panelOpen: boolean   // モバイル用: パネル表示トグル
}

interface State {
  fixtures: Fixture[]
  performers: Performer[]
  selection: Selection
  hovered: { kind: SelectionKind; id: string | null }
  settings: SceneSettings
  probeMeasurement: import('./photometric/illuminance').IlluminanceMeasurement | null
  setProbeMeasurement: (m: import('./photometric/illuminance').IlluminanceMeasurement | null) => void
  // セットピース (GLTF 取込)
  setPieces: import('./types').SetPiece[]
  addSetPiece: (sp: import('./types').SetPiece) => void
  removeSetPiece: (id: string) => void
  updateSetPiece: (id: string, patch: Partial<import('./types').SetPiece>) => void
  addPrimitiveSetPiece: (kind: 'box' | 'platform' | 'riser', atPos?: [number, number, number]) => string

  addFixture: (presetKey: string, atPos?: [number, number, number]) => string
  removeFixture: (id: string) => void
  updateFixture: (id: string, patch: Partial<Fixture>) => void
  duplicateFixture: (id: string) => void

  addPerformer: (atPos?: [number, number, number]) => string
  removePerformer: (id: string) => void
  updatePerformer: (id: string, patch: Partial<Performer>) => void

  select: (kind: SelectionKind, id: string | null, handle?: 'position' | 'target') => void
  setHover: (kind: SelectionKind, id: string | null) => void
  updateSettings: (patch: Partial<SceneSettings>) => void
  loadPreset: (name: string) => void
}

function defaultFixture(presetKey: string, pos: [number, number, number]): Fixture {
  const p = FIXTURE_PROFILES[presetKey]
  // 色のデフォルト: 在来=白(ゲルなし)、LED=明るい白
  const [r, g, b] = kelvinToRGB(p.colorTemperatureK)
  return {
    id: genFid(),
    name: p.model || presetKey,
    presetKey,
    position: pos,
    target: [pos[0], 1.5, 0],
    beamAngleDeg: p.beamAngleDeg,
    intensity: 0.85,
    color: p.source === 'tungsten' ? [r, g, b] : [1, 1, 1],
    gelEnabled: false,
    whiteMix: p.source === 'led-rgbw' ? 0.3 : 0,
    colorTempK: p.colorTemperatureK,
    rotationZDeg: 0,
    enabled: true,
  }
}

function defaultPerformer(pos: [number, number, number]): Performer {
  const colors = ['#bb8866', '#cc9977', '#a07050', '#7d5a3d', '#d6b896', '#5a4030']
  const c = colors[Math.floor(Math.random() * colors.length)]
  return {
    id: genPid(),
    name: `役者 ${nextPid - 1}`,
    position: pos,
    scale: 1.0,
    color: c,
    pose: 'standing',
  }
}

// 初期状態: 3点照明 (Key / Fill / Back) のお手本配置
function initialFixtures(): Fixture[] {
  // Key (主光源): 上手側前方から、暖色 Fresnel
  const key = defaultFixture('Fresnel8', [3.2, 6.5, 3.0])
  key.target = [0, 1.5, -1]
  key.intensity = 1.0
  key.name = 'Key (主)'
  // Fill (補助光): 下手側前方からやや弱め
  const fill = defaultFixture('Fresnel8', [-3.2, 6.0, 3.0])
  fill.target = [0, 1.5, -1]
  fill.intensity = 0.55
  fill.name = 'Fill (補助)'
  // Back (バックライト): 後方上から、輪郭を浮かす
  const back = defaultFixture('PAR64_NSP', [0, 7.2, -5.5])
  back.target = [0, 1.5, -0.5]
  back.intensity = 0.9
  back.name = 'Back (バック)'
  // 色を白寄りに
  back.color = [1, 0.92, 0.85]
  return [key, fill, back]
}

// 初期状態: 平台2枚を SetPiece として配置 (削除可能)
function initialSetPieces(): import('./types').SetPiece[] {
  return [
    {
      id: 'sp_init_platform_l', name: '平台 (下手)',
      kind: 'platform', size: [3, 0.6, 2], color: '#876040',
      position: [-2, 0.3, -3], rotation: [0, 0, 0], scale: 1,
    },
    {
      id: 'sp_init_platform_r', name: '平台 (上手)',
      kind: 'platform', size: [2.5, 1.0, 1.5], color: '#876040',
      position: [2.5, 0.5, -4], rotation: [0, 0, 0], scale: 1,
    },
  ]
}

function initialPerformers(): Performer[] {
  return [defaultPerformer([0, 0, -1])]
}

export const useStore = create<State>((set, get) => ({
  fixtures: initialFixtures(),
  performers: initialPerformers(),
  selection: { kind: null, id: null },
  hovered: { kind: null, id: null },
  probeMeasurement: null,
  setProbeMeasurement: (m) => set({ probeMeasurement: m }),
  setPieces: initialSetPieces(),
  addSetPiece: (sp) => set(s => ({ setPieces: [...s.setPieces, sp] })),
  removeSetPiece: (id) => set(s => ({
    setPieces: s.setPieces.filter(x => x.id !== id),
    selection: s.selection.id === id ? { kind: null, id: null } : s.selection,
  })),
  updateSetPiece: (id, patch) => set(s => ({
    setPieces: s.setPieces.map(sp => sp.id === id ? { ...sp, ...patch } : sp),
  })),
  addPrimitiveSetPiece: (kind, atPos) => {
    const SIZE: Record<'box'|'platform'|'riser', [number,number,number]> = {
      box: [0.6, 0.4, 0.4],            // 箱馬
      platform: [1.8, 0.3, 0.9],       // 平台 (6尺×3尺)
      riser: [1.8, 0.6, 0.9],          // 高め台 (riser/二尺)
    }
    const NAMES = { box: '箱馬', platform: '平台', riser: '高台' }
    const size = SIZE[kind]
    const pos = atPos ?? [0, size[1] / 2, -1]
    const id = `sp${Date.now()}`
    const sp: import('./types').SetPiece = {
      id, name: NAMES[kind], kind, size,
      color: '#876040',
      position: pos, rotation: [0, 0, 0], scale: 1,
    }
    set(s => ({ setPieces: [...s.setPieces, sp], selection: { kind: 'setpiece', id } }))
    return id
  },
  settings: {
    hazeDensity: 0.45,
    ambient: 0.05,
    exposure: 1.0,
    bloom: 0.35,
    showHouseLights: true,
    showFixtureMeshes: true,
    showStage: true,
    showGizmos: true,
    showPerformers: true,
    cameraView: 'audience',
    transformMode: 'translate',
    uiTab: 'fixtures',
    settingsOpen: false,
    settingsTab: 'scene',
    quality: detectInitialQuality(),
    showHelp: true,
    probeMode: false,
    dmxEnabled: false,
    panelOpen: typeof window !== 'undefined' ? window.innerWidth >= 768 : true,
  },

  addFixture: (presetKey, atPos) => {
    const pos = atPos ?? [0, 6.5, -2]
    const f = defaultFixture(presetKey, pos)
    set(s => ({ fixtures: [...s.fixtures, f], selection: { kind: 'fixture', id: f.id } }))
    return f.id
  },
  removeFixture: (id) => set(s => ({
    fixtures: s.fixtures.filter(f => f.id !== id),
    selection: s.selection.id === id ? { kind: null, id: null } : s.selection,
  })),
  updateFixture: (id, patch) => set(s => ({
    fixtures: s.fixtures.map(f => f.id === id ? { ...f, ...patch } : f),
  })),
  duplicateFixture: (id) => {
    const f = get().fixtures.find(x => x.id === id)
    if (!f) return
    const copy: Fixture = {
      ...f,
      id: genFid(),
      name: f.name + ' (複製)',
      position: [f.position[0] + 0.6, f.position[1], f.position[2]],
    }
    set(s => ({ fixtures: [...s.fixtures, copy], selection: { kind: 'fixture', id: copy.id } }))
  },

  addPerformer: (atPos) => {
    const pos = atPos ?? [Math.random() * 4 - 2, 0, Math.random() * 2 - 1]
    const p = defaultPerformer(pos)
    set(s => ({ performers: [...s.performers, p], selection: { kind: 'performer', id: p.id } }))
    return p.id
  },
  removePerformer: (id) => set(s => ({
    performers: s.performers.filter(p => p.id !== id),
    selection: s.selection.id === id ? { kind: null, id: null } : s.selection,
  })),
  updatePerformer: (id, patch) => set(s => ({
    performers: s.performers.map(p => p.id === id ? { ...p, ...patch } : p),
  })),

  select: (kind, id, handle) => set({ selection: { kind, id, fixtureHandle: handle ?? 'position' } }),
  setHover: (kind, id) => set({ hovered: { kind, id } }),

  updateSettings: (patch) => set(s => ({ settings: { ...s.settings, ...patch } })),

  loadPreset: (name) => {
    nextFid = 1
    nextPid = 1
    const fixtures: Fixture[] = []
    const performers: Performer[] = []
    const addF = (presetKey: string, pos: [number, number, number], tgt: [number, number, number], opts: Partial<Fixture> = {}) => {
      const f = defaultFixture(presetKey, pos)
      f.target = tgt
      Object.assign(f, opts)
      fixtures.push(f)
    }
    const addP = (pos: [number, number, number], color?: string) => {
      const p = defaultPerformer(pos)
      if (color) p.color = color
      performers.push(p)
    }

    if (name === 'basic') {
      // 基本明かり — 3点照明 (Key / Fill / Back)
      addF('Fresnel8', [3.2, 6.5, 3.0], [0, 1.5, -1], { intensity: 1.0, name: 'Key (主)' })
      addF('Fresnel8', [-3.2, 6.0, 3.0], [0, 1.5, -1], { intensity: 0.55, name: 'Fill (補助)' })
      addF('PAR64_NSP', [0, 7.2, -5.5], [0, 1.5, -0.5], { intensity: 0.9, name: 'Back (バック)', color: [1, 0.92, 0.85] })
      addP([0, 0, -1], '#cc9977')
    } else if (name === 'colorful') {
      // カラフル — LED コンサート演出向け
      const cols: Array<[number, number, number]> = [
        [1, 0.1, 0.1], [1, 0.5, 0], [1, 1, 0],
        [0.1, 1, 0.2], [0.1, 0.6, 1], [0.6, 0.1, 1], [1, 0, 0.7],
      ]
      cols.forEach((c, i) => {
        const x = -4.5 + i * 1.5
        addF('Stairville_LEDPar64_RGBW', [x, 7.5, -3], [x * 0.4, 1.8, 0],
          { gelEnabled: true, color: c })
      })
      addF('Robe_LEDBeam150', [-3, 7.8, -5], [-2, 1.5, 0], { gelEnabled: true, color: [1, 1, 1] })
      addF('Robe_LEDBeam150', [3, 7.8, -5], [2, 1.5, 0], { gelEnabled: true, color: [1, 1, 1] })
      addP([-2, 0, -1], '#222'); addP([0, 0, -1], '#333'); addP([2, 0, -1], '#222')
    } else if (name === 'empty') {
      // 何もなし
    }

    set({ fixtures, performers, selection: { kind: null, id: null } })
  },
}))

// (初期状態は store create 時の initialFixtures() / initialSetPieces() で設定済み)

// ==== シェーダー uniform 詰め ====

export const MAX_FIXTURES = 16

export interface PackedFixture {
  position: THREE.Vector3
  axis: THREE.Vector3
  upAxis: THREE.Vector3
  color: THREE.Color
  beamHalfRad: number
  fieldHalfRad: number
  flatness: number
  peak: number
  ellipticity: number
  intensity: number
  shadow: number
  kind: number
}

export function packFixture(f: Fixture): PackedFixture {
  const profile = FIXTURE_PROFILES[f.presetKey]
  // 光源タイプ別に基本色を決定
  let r = 1, g = 1, b = 1
  if (profile.source === 'tungsten') {
    const [tr, tg, tb] = kelvinToRGB(profile.colorTemperatureK)
    r = tr; g = tg; b = tb
    if (f.gelEnabled) { r *= f.color[0]; g *= f.color[1]; b *= f.color[2] }
  } else if (profile.source === 'led-tunable') {
    const [tr, tg, tb] = kelvinToRGB(f.colorTempK)
    r = tr; g = tg; b = tb
  } else {
    // LED RGBW: gelEnabled 時のみカスタム色を使用、それ以外は白
    if (f.gelEnabled) { r = f.color[0]; g = f.color[1]; b = f.color[2] }
    // 白ミックス: 中点に向けて純白寄せ
    const w = f.whiteMix
    r = r * (1 - w) + w
    g = g * (1 - w) + w
    b = b * (1 - w) + w
  }
  const pos = new THREE.Vector3(...f.position)
  const tgt = new THREE.Vector3(...f.target)
  const axis = new THREE.Vector3().subVectors(tgt, pos)
  if (axis.lengthSq() < 1e-6) axis.set(0, -1, 0); else axis.normalize()
  let upWorld = new THREE.Vector3(0, 1, 0)
  if (Math.abs(axis.dot(upWorld)) > 0.99) upWorld = new THREE.Vector3(0, 0, 1)
  const right = new THREE.Vector3().crossVectors(axis, upWorld).normalize()
  const up = new THREE.Vector3().crossVectors(right, axis).normalize()
  const rotZ = (f.rotationZDeg * Math.PI) / 180
  const cos = Math.cos(rotZ), sin = Math.sin(rotZ)
  const upRot = new THREE.Vector3(
    up.x * cos + right.x * sin,
    up.y * cos + right.y * sin,
    up.z * cos + right.z * sin,
  ).normalize()

  const beamRad = (f.beamAngleDeg * Math.PI) / 360
  const solidAngle = 2 * Math.PI * (1 - Math.cos(beamRad)) + 1e-3
  const peakLuminance = (profile.fluxLumens / solidAngle) * 8e-4
  const kindMap: Record<string, number> = {
    PAR: 0, Fresnel: 1, PC: 2, Profile: 3,
    LED_PAR: 0, LED_Wash: 1, LED_Profile: 3, LED_Bar: 0, MovingHead: 3,
  }

  return {
    position: pos,
    axis,
    upAxis: upRot,
    color: new THREE.Color(r, g, b),
    beamHalfRad: beamRad,
    fieldHalfRad: ((f.beamAngleDeg / profile.beamAngleDeg) * profile.fieldAngleDeg * Math.PI) / 360,
    flatness: profile.flatness,
    peak: profile.peak,
    ellipticity: profile.ellipticity,
    intensity: f.enabled ? f.intensity * peakLuminance : 0,
    shadow: 1,
    kind: kindMap[profile.kind] ?? 0,
  }
}

// 役者をシャドウキャスタへ変換 (胴体カプセル + 球の頭近似)
export interface PackedOccluder {
  pos: [number, number, number]
  axis: [number, number, number]
  radius: number
  halfHeight: number
}
export function performerToOccluders(p: Performer): PackedOccluder[] {
  const [x, y, z] = p.position
  const s = p.scale
  return [
    // 胴体 (カプセル)
    { pos: [x, y + 1.0 * s, z], axis: [0, 1, 0], radius: 0.28 * s, halfHeight: 0.35 * s },
  ]
}
