import { create } from 'zustand'
import * as THREE from 'three'
import { FIXTURE_PROFILES, kelvinToRGB } from './lighting/fixtureTypes'
import type { PerformerPose } from './performerPoses'

let nextFid = 1
let nextPid = 1
const genFid = () => `f${nextFid++}`
const genPid = () => `p${nextPid++}`

// オブジェクト数の上限 (フロント側ガード。サーバー側にも同等のチェック有り)
export const LIMITS = {
  fixtures: 16, // WebGL MAX_TEXTURE_IMAGE_UNITS の制約由来
  performers: 30,
  setPieces: 30,
} as const
export const PLAN_LIMITS = { chapters: 100, scenes: 100 } as const

export interface Fixture {
  id: string
  name: string
  presetKey: string
  photometricProfile?: 'etc-fos4-fresnel10-mid' | 'etc-s4-led-cyc-daylight-hd'
  upstageCutDeg?: number
  barnDoorAngles?: { top?: number; right?: number; bottom?: number; left?: number }
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
  onStage?: boolean
  scale: number       // 身長スケール 0.7=子, 1.0=平均, 1.2=高身長
  color: string       // 服色
  pose: PerformerPose
}

export type StagePoint = [number, number]
export type DirectionKind = 'move' | 'entrance' | 'exit'
export type DirectionPreset = 'move' | 'entrance-upper' | 'entrance-lower' | 'exit-upper' | 'exit-lower'

export interface StageDirection {
  id: string
  performerId: string
  kind: DirectionKind
  from: StagePoint
  to: StagePoint
  note: string
}

export interface ProductionPlan {
  title: string
  projectTitle?: string
  workTitle?: string
  venueTitle?: string
  chapters?: PlanChapter[]
  sequences?: PlanSequence[]
  scenes: PlanScene[]
  activeSceneId: string | null
}

export interface PlanChapter { id: string; title: string }
export interface PlanSequence { id: string; chapterId: string; title: string }

function nextChapterTitle(chapters: PlanChapter[]) {
  const used = chapters.map(chapter => /^第(\d+)章$/.exec(chapter.title)?.[1])
    .filter((value): value is string => value !== undefined).map(Number)
  return `第${Math.max(0, ...used) + 1}章`
}

export interface PlanScene {
  id: string
  sequenceId?: string
  title: string
  triggerType?: SceneTriggerType
  trigger: string
  note: string
  fixtures: Fixture[]
  performers: Performer[]
  setPieces: import('./types').SetPiece[]
}

export const SCENE_TRIGGER_LABELS = {
  dialogue: 'セリフ', sound: '音', light: '光', other: 'その他',
} as const
export type SceneTriggerType = keyof typeof SCENE_TRIGGER_LABELS

export type MoveSceneResult = 'moved' | 'unchanged' | 'invalid'

export const emptyProductionPlan = (): ProductionPlan => ({
  title: '', projectTitle: '', chapters: [], sequences: [], scenes: [], activeSceneId: null,
})

const sceneId = () => `sc${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
const groupId = (prefix: string) => `${prefix}${Date.now()}-${Math.random().toString(36).slice(2, 8)}`

export function ensurePlanHierarchy(plan: ProductionPlan): ProductionPlan {
  const projectTitle = plan.projectTitle === undefined
    ? [plan.workTitle, plan.venueTitle].filter(Boolean).join(' / ') || '' : plan.projectTitle
  const chapters = plan.chapters?.length ? plan.chapters : [{ id: groupId('ch'), title: '第1章' }]
  const sequences = plan.sequences?.length ? plan.sequences : [{ id: groupId('sq'), chapterId: chapters[0].id, title: 'シーケンス 1' }]
  const validSequenceIds = new Set(sequences.map(item => item.id))
  const scenes = plan.scenes.map(scene => validSequenceIds.has(scene.sequenceId ?? '')
    ? scene : { ...scene, sequenceId: sequences[0].id })
  return { ...plan, projectTitle, chapters, sequences, scenes }
}

export function sceneDisplayTitle(plan: ProductionPlan, id: string): string {
  const scene = plan.scenes.find(item => item.id === id)
  if (!scene) return 'シーン'
  const title = scene.title.trim()
  if (title && title !== '開始' && title !== '新しいシーン' && title !== 'シーン' &&
      !/^新しいシーン \d+$/.test(title)) return title
  const sequence = plan.sequences?.find(item => item.id === scene.sequenceId)
  const chapter = plan.chapters?.find(item => item.id === sequence?.chapterId)
  const sequenceIds = new Set(plan.sequences?.filter(item => item.chapterId === chapter?.id).map(item => item.id) ?? [])
  const number = plan.scenes.filter(item => sequenceIds.has(item.sequenceId ?? ''))
    .findIndex(item => item.id === id) + 1
  return `${chapter?.title.trim() || '章'}${Math.max(1, number)}`
}

function cloneFixtures(fixtures: Fixture[]): Fixture[] {
  return fixtures.map(f => ({ ...f, position: [...f.position], target: [...f.target], color: [...f.color] }))
}
function clonePerformers(performers: Performer[]): Performer[] {
  return performers.map(p => ({ ...p, position: [...p.position] }))
}
function cloneSetPieces(pieces: import('./types').SetPiece[]): import('./types').SetPiece[] {
  return pieces.map(p => ({ ...p, position: [...p.position], rotation: [...p.rotation], size: p.size ? [...p.size] : undefined }))
}
export function sceneStage(scene: PlanScene) {
  return {
    fixtures: cloneFixtures(scene.fixtures),
    performers: clonePerformers(scene.performers),
    setPieces: cloneSetPieces(scene.setPieces),
  }
}
export function sceneSnapshot(source: Pick<State, 'fixtures' | 'performers' | 'setPieces'>, title = '開始', trigger = ''): PlanScene {
  return {
    id: sceneId(), title, trigger, note: '',
    fixtures: cloneFixtures(source.fixtures),
    performers: clonePerformers(source.performers),
    setPieces: cloneSetPieces(source.setPieces),
  }
}
export function captureActiveScene(plan: ProductionPlan, source: Pick<State, 'fixtures' | 'performers' | 'setPieces'>): ProductionPlan {
  if (!plan.activeSceneId) return plan
  return {
    ...plan,
    scenes: plan.scenes.map(scene => scene.id === plan.activeSceneId ? {
      ...scene,
      fixtures: cloneFixtures(source.fixtures),
      performers: clonePerformers(source.performers),
      setPieces: cloneSetPieces(source.setPieces),
    } : scene),
  }
}

export function activeSceneDirections(plan: ProductionPlan, performers: Performer[]): StageDirection[] {
  const index = plan.scenes.findIndex(scene => scene.id === plan.activeSceneId)
  if (index < 1) return []
  const previous = new Map(plan.scenes[index - 1].performers.map(p => [p.id, p]))
  return performers.flatMap(performer => {
    const previousPerformer = previous.get(performer.id)
    if (!previousPerformer) return []
    const wasOnStage = previousPerformer.onStage !== false
    const isOnStage = performer.onStage !== false
    if (!wasOnStage && !isOnStage) return []
    const wingX = (performer.position[0] < 0 ? -1 : 1) * 8.7
    const from: StagePoint = wasOnStage
      ? [previousPerformer.position[0], previousPerformer.position[2]]
      : [wingX, performer.position[2]]
    const to: StagePoint = isOnStage
      ? [performer.position[0], performer.position[2]]
      : [wingX, performer.position[2]]
    if (Math.hypot(to[0] - from[0], to[1] - from[1]) < 0.12) return []
    const kind: DirectionKind = !wasOnStage || Math.abs(from[0]) > 8
      ? 'entrance' : !isOnStage || Math.abs(to[0]) > 8 ? 'exit' : 'move'
    return [{ id: `${plan.activeSceneId}-${performer.id}`, performerId: performer.id, kind, from, to, note: '' }]
  })
}

const isMockPath = typeof location !== 'undefined' &&
  (location.protocol === 'file:' || location.pathname === '/mock' || location.pathname.startsWith('/mock/'))

export function syncEntityIds(fixtures: Fixture[], performers: Performer[]) {
  for (const f of fixtures) {
    const match = /^f(\d+)$/.exec(f.id)
    if (match) nextFid = Math.max(nextFid, Number(match[1]) + 1)
  }
  for (const p of performers) {
    const match = /^p(\d+)$/.exec(p.id)
    if (match) nextPid = Math.max(nextPid, Number(match[1]) + 1)
  }
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
  panelOpen: boolean   // モバイル用: オブジェクトパネル表示トグル
  scenePanelOpen: boolean // PC: シーン管理パネル表示トグル
  selectedDirectionId: string | null
  pickingDirectionId: string | null
}

interface State {
  fixtures: Fixture[]
  performers: Performer[]
  productionPlan: ProductionPlan
  selection: Selection
  hovered: { kind: SelectionKind; id: string | null }
  settings: SceneSettings
  probeMeasurement: import('./photometric/illuminance').IlluminanceMeasurement | null
  setProbeMeasurement: (m: import('./photometric/illuminance').IlluminanceMeasurement | null) => void
  /** 最後にクラウド保存 or 読込した時点のシーンスナップショット (JSON文字列)。null=未保存(初期状態は警告しない) */
  savedSnapshot: string | null
  /** 現在の状態を「保存済み」としてスナップショット */
  markSavedSnapshot: () => void
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
  updateProductionPlan: (patch: Partial<Pick<ProductionPlan, 'title' | 'projectTitle'>>) => void
  ensureScenes: () => void
  addScene: () => void
  addSceneAt: (chapterId: string, beforeSceneId: string | null) => string | null
  addChapter: () => void
  addChapterAfter: (chapterId: string) => string | null
  addSequence: () => void
  updateChapter: (id: string, title: string) => void
  updateSequence: (id: string, title: string) => void
  selectScene: (id: string) => void
  updateScene: (id: string, patch: Partial<Pick<PlanScene, 'title' | 'triggerType' | 'trigger' | 'note'>>) => void
  removeScene: (id: string) => void
  removeScenes: (ids: string[]) => number
  removeChapter: (id: string) => boolean
  moveScene: (id: string, targetId: string, position: 'before' | 'after') => MoveSceneResult
  moveSceneToChapter: (id: string, chapterId: string) => MoveSceneResult
  moveChapter: (id: string, targetId: string, position: 'before' | 'after') => MoveSceneResult

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
//   Key  = 主光源・被写体全体を照らす  (一番強い)
//   Fill = 陰の濃さ調整・環境光の役割   (Key の半分程度)
//   Back = 逆光・輪郭を立たせる         (Key より弱め、輪郭のみ)
function initialFixtures(): Fixture[] {
  // Key (主光源): 役者から見て前方上手 (audience right) 45°
  const key = defaultFixture('Fresnel8', [3.5, 5.5, 2.5])
  key.target = [0, 1.5, -1]
  key.beamAngleDeg = 22  // 役者全体を包めるよう少し広め
  key.intensity = 1.0
  key.name = 'Key (主)'
  // Fill (補助): 反対側下手から、強度は Key の 40% (≒ Key:Fill = 2.5:1)
  const fill = defaultFixture('Fresnel8', [-3.5, 5.5, 2.5])
  fill.target = [0, 1.5, -1]
  fill.beamAngleDeg = 26  // Fill はさらに広く拡散光気味に
  fill.intensity = 0.4
  fill.name = 'Fill (補助)'
  // Back (バック・リム): 役者の真後ろ上から狭めの PAR、輪郭を縁取る
  const back = defaultFixture('PAR64_NSP', [0, 6.5, -4.5])
  back.target = [0, 1.6, -1]
  back.intensity = 0.6
  back.name = 'Back (バック)'
  back.color = [1, 0.92, 0.85]  // やや暖白
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

export function computeSceneSnapshot(s: Pick<State, 'fixtures' | 'performers' | 'setPieces' | 'productionPlan'>): string {
  return JSON.stringify({ f: s.fixtures, p: s.performers, sp: s.setPieces, plan: s.productionPlan })
}

export const useStore = create<State>((set, get) => ({
  fixtures: initialFixtures(),
  performers: initialPerformers(),
  productionPlan: emptyProductionPlan(),
  savedSnapshot: null,
  markSavedSnapshot: () => {
    const s = get()
    set({ savedSnapshot: computeSceneSnapshot(s) })
  },
  selection: { kind: null, id: null },
  hovered: { kind: null, id: null },
  probeMeasurement: null,
  setProbeMeasurement: (m) => set({ probeMeasurement: m }),
  setPieces: initialSetPieces(),
  addSetPiece: (sp) => set(s => {
    if (s.setPieces.length >= LIMITS.setPieces) {
      if (typeof window !== 'undefined') alert(`装置は ${LIMITS.setPieces} 個までです`)
      return {}
    }
    return { setPieces: [...s.setPieces, sp] }
  }),
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
    // 重なり防止: 既存数でずらす
    const cur = get().setPieces.length
    const ox = ((cur % 5) - 2) * 0.9
    const oz = -1 + Math.floor(cur / 5) * 0.7
    const pos = atPos ?? [ox, size[1] / 2, oz]
    const id = `sp${Date.now()}-${cur}`
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
    // 初回訪問のみヘルプを自動表示 (2回目以降はユーザーが「?」で開く)
    showHelp: !isMockPath && (typeof localStorage !== 'undefined' ? !localStorage.getItem('tomoshibi.helpSeen') : true),
    probeMode: false,
    dmxEnabled: false,
    panelOpen: typeof window !== 'undefined' ? window.innerWidth >= 768 : true,
    scenePanelOpen: !isMockPath && (typeof window !== 'undefined' ? window.innerWidth > 768 : true),
    selectedDirectionId: null,
    pickingDirectionId: null,
  },

  addFixture: (presetKey, atPos) => {
    const cur = get().fixtures.length
    // WebGL の MAX_TEXTURE_IMAGE_UNITS = 16 を超えると影シェーダーが壊れるため上限
    if (cur >= LIMITS.fixtures) {
      console.warn(`[TOMOSHIBI] フィクスチャ上限 (${LIMITS.fixtures}台) に達しました`)
      if (typeof window !== 'undefined') {
        alert(`フィクスチャは ${LIMITS.fixtures} 台までです (WebGL の制限により影が破綻するため)`)
      }
      return ''
    }
    // 重なり防止: 既存器具の数で少しずらして配置
    const offset = cur * 0.4
    const pos = atPos ?? [offset - 1.5, 6.5 - (cur % 3) * 0.3, -2 - (cur % 4) * 0.4]
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
    // 重なり防止: 既存数で円周状に配置
    const cur = get().performers.length
    if (cur >= LIMITS.performers) {
      if (typeof window !== 'undefined') alert(`役者は ${LIMITS.performers} 人までです`)
      return ''
    }
    const r = cur === 0 ? 0 : 1 + (cur % 4) * 0.6
    const ang = cur * 0.7
    const pos = atPos ?? [Math.cos(ang) * r, 0, -1 + Math.sin(ang) * r * 0.5]
    const p = defaultPerformer(pos)
    set(s => ({
      performers: [...s.performers, p],
      selection: { kind: 'performer', id: p.id },
    }))
    return p.id
  },
  removePerformer: (id) => set(s => ({
    performers: s.performers.filter(p => p.id !== id),
    selection: s.selection.id === id ? { kind: null, id: null } : s.selection,
  })),
  updatePerformer: (id, patch) => set(s => ({
    performers: s.performers.map(p => p.id === id ? { ...p, ...patch } : p),
  })),

  updateProductionPlan: (patch) => set(s => ({
    productionPlan: { ...s.productionPlan, ...patch },
  })),
  ensureScenes: () => set(s => {
    if (s.productionPlan.scenes.length) return { productionPlan: ensurePlanHierarchy(s.productionPlan) }
    const scene = sceneSnapshot(s, isMockPath ? '' : '開始')
    const plan = ensurePlanHierarchy({ ...s.productionPlan, scenes: [scene], activeSceneId: scene.id })
    return { productionPlan: plan }
  }),
  addScene: () => set(s => {
    const plan = ensurePlanHierarchy(captureActiveScene(s.productionPlan, s))
    const index = plan.scenes.findIndex(scene => scene.id === plan.activeSceneId)
    if (index < 0 || plan.scenes.length >= PLAN_LIMITS.scenes) return {}
    const scene = { ...sceneSnapshot(s, '新しいシーン'), sequenceId: plan.scenes[index].sequenceId }
    const scenes = [...plan.scenes]
    scenes.splice(index + 1, 0, scene)
    return { productionPlan: { ...plan, scenes, activeSceneId: scene.id }, selection: { kind: null, id: null } }
  }),
  addSceneAt: (chapterId, beforeSceneId) => {
    let addedId: string | null = null
    set(s => {
      const plan = ensurePlanHierarchy(captureActiveScene(s.productionPlan, s))
      if (plan.scenes.length >= PLAN_LIMITS.scenes || !plan.chapters?.some(item => item.id === chapterId)) return {}
      const sequenceIds = new Set(plan.sequences?.filter(item => item.chapterId === chapterId).map(item => item.id) ?? [])
      const chapterScenes = plan.scenes.filter(item => sequenceIds.has(item.sequenceId ?? ''))
      const beforeIndex = beforeSceneId === null ? chapterScenes.length
        : chapterScenes.findIndex(item => item.id === beforeSceneId)
      if (beforeIndex < 0) return {}
      const before = chapterScenes[beforeIndex]
      const previous = chapterScenes[beforeIndex - 1]
      const basis = previous ?? before
      const sequence = plan.sequences?.find(item => item.id === (before?.sequenceId ?? previous?.sequenceId))
        ?? plan.sequences?.find(item => item.chapterId === chapterId)
      if (!sequence) return {}
      const insertIndex = before ? plan.scenes.findIndex(item => item.id === before.id)
        : previous ? plan.scenes.findIndex(item => item.id === previous.id) + 1
          : plan.scenes.findIndex(item => {
            const itemChapterId = plan.sequences?.find(group => group.id === item.sequenceId)?.chapterId
            return (plan.chapters?.findIndex(chapter => chapter.id === itemChapterId) ?? -1) >
              (plan.chapters?.findIndex(chapter => chapter.id === chapterId) ?? -1)
          })
      const newScene = { ...sceneSnapshot(basis ? sceneStage(basis) : s, isMockPath ? '' : '新しいシーン'), sequenceId: sequence.id }
      const scenes = [...plan.scenes]
      scenes.splice(insertIndex < 0 ? scenes.length : insertIndex, 0, newScene)
      addedId = newScene.id
      return {
        productionPlan: { ...plan, scenes, activeSceneId: newScene.id },
        ...sceneStage(newScene),
        selection: { kind: null, id: null },
      }
    })
    return addedId
  },
  addChapter: () => set(s => {
    const plan = ensurePlanHierarchy(captureActiveScene(s.productionPlan, s))
    if (plan.scenes.length >= PLAN_LIMITS.scenes || (plan.chapters?.length ?? 0) >= PLAN_LIMITS.chapters) return {}
    const active = plan.scenes.find(scene => scene.id === plan.activeSceneId)
    const activeSequence = plan.sequences?.find(sequence => sequence.id === active?.sequenceId)
    const chapterIndex = plan.chapters?.findIndex(chapter => chapter.id === activeSequence?.chapterId) ?? -1
    if (chapterIndex < 0) return {}
    const chapter = { id: groupId('ch'), title: nextChapterTitle(plan.chapters ?? []) }
    const sequence = { id: groupId('sq'), chapterId: chapter.id, title: 'シーケンス 1' }
    const scene = { ...sceneSnapshot(s, '新しいシーン'), sequenceId: sequence.id }
    const chapters = [...plan.chapters!]
    chapters.splice(chapterIndex + 1, 0, chapter)
    const nextChapterId = plan.chapters?.[chapterIndex + 1]?.id
    const sequenceIndex = nextChapterId
      ? plan.sequences!.findIndex(item => item.chapterId === nextChapterId) : plan.sequences!.length
    const sequences = [...plan.sequences!]
    sequences.splice(sequenceIndex, 0, sequence)
    const nextSceneIndex = plan.scenes.findIndex(item => sequences.slice(sequenceIndex + 1)
      .some(group => group.id === item.sequenceId))
    const scenes = [...plan.scenes]
    scenes.splice(nextSceneIndex < 0 ? scenes.length : nextSceneIndex, 0, scene)
    return { productionPlan: { ...plan, chapters, sequences, scenes, activeSceneId: scene.id }, selection: { kind: null, id: null } }
  }),
  addChapterAfter: (chapterId) => {
    let addedId: string | null = null
    set(s => {
      const plan = ensurePlanHierarchy(captureActiveScene(s.productionPlan, s))
      const chapterIndex = plan.chapters?.findIndex(item => item.id === chapterId) ?? -1
      if (chapterIndex < 0 || plan.scenes.length >= PLAN_LIMITS.scenes ||
        (plan.chapters?.length ?? 0) >= PLAN_LIMITS.chapters) return {}
      const nextChapter = plan.chapters?.[chapterIndex + 1]
      const chapter = { id: groupId('ch'), title: nextChapterTitle(plan.chapters!) }
      const sequence = { id: groupId('sq'), chapterId: chapter.id, title: 'シーケンス 1' }
      const nextSequenceIndex = nextChapter
        ? plan.sequences!.findIndex(item => item.chapterId === nextChapter.id) : plan.sequences!.length
      const sequenceIndex = nextSequenceIndex < 0 ? plan.sequences!.length : nextSequenceIndex
      const nextChapterIds = new Set(plan.chapters!.slice(chapterIndex + 1).map(item => item.id))
      const sceneIndex = plan.scenes.findIndex(item => nextChapterIds.has(
        plan.sequences!.find(group => group.id === item.sequenceId)?.chapterId ?? ''))
      const insertIndex = sceneIndex < 0 ? plan.scenes.length : sceneIndex
      const previousChapterSequenceIds = new Set(plan.sequences!.filter(item => item.chapterId === chapterId).map(item => item.id))
      const chapterScenes = plan.scenes.filter(item => previousChapterSequenceIds.has(item.sequenceId ?? ''))
      const basis = chapterScenes[chapterScenes.length - 1] ?? plan.scenes[insertIndex - 1] ?? plan.scenes[insertIndex]
      const scene = { ...sceneSnapshot(basis ? sceneStage(basis) : s, isMockPath ? '' : '新しいシーン'), sequenceId: sequence.id }
      const chapters = [...plan.chapters!]
      chapters.splice(chapterIndex + 1, 0, chapter)
      const sequences = [...plan.sequences!]
      sequences.splice(sequenceIndex, 0, sequence)
      const scenes = [...plan.scenes]
      scenes.splice(insertIndex, 0, scene)
      addedId = chapter.id
      return {
        productionPlan: { ...plan, chapters, sequences, scenes, activeSceneId: scene.id },
        ...sceneStage(scene),
        selection: { kind: null, id: null },
      }
    })
    return addedId
  },
  addSequence: () => set(s => {
    const plan = ensurePlanHierarchy(captureActiveScene(s.productionPlan, s))
    if (plan.scenes.length >= PLAN_LIMITS.scenes) return {}
    const active = plan.scenes.find(scene => scene.id === plan.activeSceneId)
    const sequenceIndex = plan.sequences?.findIndex(item => item.id === active?.sequenceId) ?? -1
    if (sequenceIndex < 0) return {}
    const chapterId = plan.sequences![sequenceIndex].chapterId
    const count = plan.sequences!.filter(item => item.chapterId === chapterId).length
    const sequence = { id: groupId('sq'), chapterId, title: `シーケンス ${count + 1}` }
    const scene = { ...sceneSnapshot(s, '新しいシーン'), sequenceId: sequence.id }
    const sequences = [...plan.sequences!]
    sequences.splice(sequenceIndex + 1, 0, sequence)
    const nextSequenceIds = new Set(sequences.slice(sequenceIndex + 2).map(item => item.id))
    const nextSceneIndex = plan.scenes.findIndex(item => nextSequenceIds.has(item.sequenceId ?? ''))
    const scenes = [...plan.scenes]
    scenes.splice(nextSceneIndex < 0 ? scenes.length : nextSceneIndex, 0, scene)
    return { productionPlan: { ...plan, sequences, scenes, activeSceneId: scene.id }, selection: { kind: null, id: null } }
  }),
  updateChapter: (id, title) => set(s => ({ productionPlan: {
    ...s.productionPlan,
    chapters: s.productionPlan.chapters?.map(item => item.id === id ? { ...item, title } : item),
  } })),
  updateSequence: (id, title) => set(s => ({ productionPlan: {
    ...s.productionPlan,
    sequences: s.productionPlan.sequences?.map(item => item.id === id ? { ...item, title } : item),
  } })),
  selectScene: (id) => set(s => {
    if (id === s.productionPlan.activeSceneId) return {}
    const plan = ensurePlanHierarchy(captureActiveScene(s.productionPlan, s))
    const scene = plan.scenes.find(item => item.id === id)
    if (!scene) return {}
    return {
      productionPlan: { ...plan, activeSceneId: id },
      ...sceneStage(scene),
      selection: { kind: null, id: null },
    }
  }),
  updateScene: (id, patch) => set(s => ({
    productionPlan: {
      ...s.productionPlan,
      scenes: s.productionPlan.scenes.map(scene => scene.id === id ? { ...scene, ...patch } : scene),
    },
  })),
  removeScene: (id) => set(s => {
    const plan = ensurePlanHierarchy(captureActiveScene(s.productionPlan, s))
    if (plan.scenes.length <= 1) return {}
    const index = plan.scenes.findIndex(scene => scene.id === id)
    if (index < 0) return {}
    const scenes = plan.scenes.filter(scene => scene.id !== id)
    const active = id === plan.activeSceneId ? scenes[Math.max(0, index - 1)] : scenes.find(scene => scene.id === plan.activeSceneId)
    if (!active) return {}
    return {
      productionPlan: {
        ...plan, scenes, activeSceneId: active.id,
        sequences: isMockPath ? plan.sequences : plan.sequences?.filter(group => scenes.some(scene => scene.sequenceId === group.id)),
        chapters: isMockPath ? plan.chapters : plan.chapters?.filter(chapter => plan.sequences?.some(group =>
          group.chapterId === chapter.id && scenes.some(scene => scene.sequenceId === group.id))),
      },
      ...sceneStage(active),
      selection: { kind: null, id: null },
    }
  }),
  removeScenes: (ids) => {
    const selected = new Set(ids)
    let removed = 0
    set(s => {
      const plan = ensurePlanHierarchy(captureActiveScene(s.productionPlan, s))
      const scenes = plan.scenes.filter(scene => !selected.has(scene.id))
      if (scenes.length === plan.scenes.length) return {}
      removed = plan.scenes.length - scenes.length
      if (!scenes.length) {
        const sequence = plan.sequences?.find(item => item.chapterId === plan.chapters?.[0].id) ?? plan.sequences![0]
        scenes.push({ ...sceneSnapshot({ fixtures: [], performers: [], setPieces: [] }, isMockPath ? '' : '開始'),
          sequenceId: sequence.id })
      }
      const previousIndex = plan.scenes.findIndex(scene => scene.id === plan.activeSceneId)
      const active = scenes.find(scene => scene.id === plan.activeSceneId)
        ?? [...plan.scenes.slice(0, previousIndex)].reverse().find(scene => !selected.has(scene.id))
        ?? scenes[0]
      return {
        productionPlan: { ...plan, scenes, activeSceneId: active.id },
        ...sceneStage(active),
        selection: { kind: null, id: null },
      }
    })
    return removed
  },
  removeChapter: (id) => {
    let removed = false
    set(s => {
      const plan = ensurePlanHierarchy(captureActiveScene(s.productionPlan, s))
      if ((plan.chapters?.length ?? 0) <= 1 || !plan.chapters?.some(chapter => chapter.id === id)) return {}
      const chapters = plan.chapters.filter(chapter => chapter.id !== id)
      const sequences = plan.sequences?.filter(sequence => sequence.chapterId !== id) ?? []
      const retainedIds = new Set(sequences.map(sequence => sequence.id))
      const scenes = plan.scenes.filter(scene => retainedIds.has(scene.sequenceId ?? ''))
      if (!scenes.length) {
        const sequence = sequences[0] ?? { id: groupId('sq'), chapterId: chapters[0].id, title: 'シーケンス 1' }
        if (!sequences.length) sequences.push(sequence)
        scenes.push({ ...sceneSnapshot({ fixtures: [], performers: [], setPieces: [] }, isMockPath ? '' : '開始'),
          sequenceId: sequence.id })
      }
      const oldIndex = plan.scenes.findIndex(scene => scene.id === plan.activeSceneId)
      const active = scenes.find(scene => scene.id === plan.activeSceneId)
        ?? [...plan.scenes.slice(0, oldIndex)].reverse().find(scene => retainedIds.has(scene.sequenceId ?? ''))
        ?? scenes[0]
      removed = true
      return {
        productionPlan: { ...plan, chapters, sequences, scenes, activeSceneId: active.id },
        ...sceneStage(active),
        selection: { kind: null, id: null },
      }
    })
    return removed
  },
  moveScene: (id, targetId, position) => {
    let result: MoveSceneResult = 'invalid'
    set(s => {
      const plan = ensurePlanHierarchy(captureActiveScene(s.productionPlan, s))
      const moving = plan.scenes.find(item => item.id === id)
      const target = plan.scenes.find(item => item.id === targetId)
      if (!moving || !target) return {}
      if (id === targetId) { result = 'unchanged'; return {} }
      const sourceChapterId = plan.sequences?.find(item => item.id === moving.sequenceId)?.chapterId
      const targetChapterId = plan.sequences?.find(item => item.id === target.sequenceId)?.chapterId
      if (!sourceChapterId || !targetChapterId) return {}
      const scenes = plan.scenes.filter(item => item.id !== id)
      const targetIndex = scenes.findIndex(item => item.id === targetId)
      scenes.splice(targetIndex + (position === 'after' ? 1 : 0), 0,
        moving.sequenceId === target.sequenceId ? moving : { ...moving, sequenceId: target.sequenceId })
      if (scenes.every((item, index) => item.id === plan.scenes[index].id && item.sequenceId === plan.scenes[index].sequenceId)) {
        result = 'unchanged'; return {}
      }
      result = 'moved'
      return { productionPlan: { ...plan, scenes } }
    })
    return result
  },
  moveSceneToChapter: (id, chapterId) => {
    let result: MoveSceneResult = 'invalid'
    set(s => {
      const plan = ensurePlanHierarchy(captureActiveScene(s.productionPlan, s))
      const moving = plan.scenes.find(item => item.id === id)
      const targetChapter = plan.chapters?.find(item => item.id === chapterId)
      if (!moving || !targetChapter) return {}
      const sourceChapterId = plan.sequences?.find(item => item.id === moving.sequenceId)?.chapterId
      if (!sourceChapterId) return {}
      const targetSequences = plan.sequences?.filter(item => item.chapterId === chapterId) ?? []
      const sequence = targetSequences[targetSequences.length - 1] ?? {
        id: groupId('sq'), chapterId, title: 'シーケンス 1',
      }
      const sequenceIds = new Set(targetSequences.map(item => item.id))
      const scenes = plan.scenes.filter(item => item.id !== id)
      let lastIndex = -1
      scenes.forEach((item, index) => { if (sequenceIds.has(item.sequenceId ?? '')) lastIndex = index })
      const chapterIndex = plan.chapters?.findIndex(item => item.id === chapterId) ?? -1
      const nextChapterIds = new Set(plan.chapters?.slice(chapterIndex + 1).map(item => item.id) ?? [])
      const insertIndex = lastIndex >= 0 ? lastIndex + 1 : scenes.findIndex(item =>
        nextChapterIds.has(plan.sequences?.find(group => group.id === item.sequenceId)?.chapterId ?? ''))
      scenes.splice(insertIndex < 0 ? scenes.length : insertIndex, 0, { ...moving, sequenceId: sequence.id })
      if (scenes.every((item, index) => item.id === plan.scenes[index].id && item.sequenceId === plan.scenes[index].sequenceId)) {
        result = 'unchanged'; return {}
      }
      result = 'moved'
      return { productionPlan: {
        ...plan,
        sequences: targetSequences.length ? plan.sequences : [...(plan.sequences ?? []), sequence],
        scenes,
      } }
    })
    return result
  },
  moveChapter: (id, targetId, position) => {
    let result: MoveSceneResult = 'invalid'
    set(s => {
      const plan = ensurePlanHierarchy(captureActiveScene(s.productionPlan, s))
      const moving = plan.chapters?.find(chapter => chapter.id === id)
      const target = plan.chapters?.find(chapter => chapter.id === targetId)
      if (!moving || !target) return {}
      if (id === targetId) { result = 'unchanged'; return {} }
      const chapters = plan.chapters!.filter(chapter => chapter.id !== id)
      const targetIndex = chapters.findIndex(chapter => chapter.id === targetId)
      chapters.splice(targetIndex + (position === 'after' ? 1 : 0), 0, moving)
      if (chapters.every((chapter, index) => chapter.id === plan.chapters?.[index].id)) {
        result = 'unchanged'; return {}
      }
      const sequences = chapters.flatMap(chapter => plan.sequences?.filter(sequence => sequence.chapterId === chapter.id) ?? [])
      const scenes = chapters.flatMap(chapter => {
        const ids = new Set(sequences.filter(sequence => sequence.chapterId === chapter.id).map(sequence => sequence.id))
        return plan.scenes.filter(scene => ids.has(scene.sequenceId ?? ''))
      })
      result = 'moved'
      return { productionPlan: { ...plan, chapters, sequences, scenes } }
    })
    return result
  },

  select: (kind, id, handle) => set({ selection: { kind, id, fixtureHandle: handle ?? 'position' } }),
  setHover: (kind, id) => set({ hovered: { kind, id } }),

  updateSettings: (patch) => {
    set(s => ({ settings: { ...s.settings, ...patch } }))
  },

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
      addF('Fresnel8', [3.5, 5.5, 2.5], [0, 1.5, -1], { intensity: 1.0, beamAngleDeg: 22, name: 'Key (主)' })
      addF('Fresnel8', [-3.5, 5.5, 2.5], [0, 1.5, -1], { intensity: 0.4, beamAngleDeg: 26, name: 'Fill (補助)' })
      addF('PAR64_NSP', [0, 6.5, -4.5], [0, 1.6, -1], { intensity: 0.6, name: 'Back (バック)', color: [1, 0.92, 0.85] })
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

    // プリセット読込時は装置 (setPieces) も初期状態に戻す
    // 'empty' のみ装置も空にする (完全リセット), 他はデフォルト平台2枚を再配置
    const setPieces = name === 'empty' ? [] : initialSetPieces()
    set({ fixtures, performers, setPieces, productionPlan: emptyProductionPlan(), selection: { kind: null, id: null } })
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
  if (p.pose === 'lying') {
    return [{ pos: [x, y + 0.2 * s, z], axis: [1, 0, 0], radius: 0.22 * s, halfHeight: 0.55 * s }]
  }
  if (p.pose === 'sitting') {
    return [{ pos: [x, y + 0.68 * s, z], axis: [0, 1, 0], radius: 0.27 * s, halfHeight: 0.3 * s }]
  }
  if (p.pose === 'kneeling') {
    return [{ pos: [x, y + 0.84 * s, z], axis: [0, 1, 0], radius: 0.27 * s, halfHeight: 0.34 * s }]
  }
  return [
    // 胴体 (カプセル)
    { pos: [x, y + 1.0 * s, z], axis: [0, 1, 0], radius: 0.28 * s, halfHeight: 0.35 * s },
  ]
}

export function useIsDirty(): boolean {
  return useStore(s => {
    if (s.savedSnapshot === null) return false
    return s.savedSnapshot !== computeSceneSnapshot(s)
  })
}

