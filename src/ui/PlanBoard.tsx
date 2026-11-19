import type { Tool } from '../tools'
import { askConfirm } from './askConfirm'
import { useObjectMenu } from '../objectMenu'
import { WorkspaceNotice } from './WorkspaceNotice'
import { createPortal } from 'react-dom'
import { Fragment, useCallback, useEffect, useRef, useState, type MouseEvent, type PointerEvent } from 'react'
import { activeSceneDirections, LIMITS, PLAN_LIMITS, SCENE_TRIGGER_LABELS, sceneDisplayTitle, useStore,
  type DirectionKind, type Fixture, type MoveSceneResult, type SceneTriggerType, type StagePoint } from '../store'
import { StagePartsLayer } from './StagePartsEditor'
import { Glyph } from './AddPalette'
import { FIXTURE_PROFILES } from '../lighting/fixtureTypes'
import { clearChange } from '../changeLog'
import { lockedNow, nudgeLock } from '../locks'
import { audienceSeatPositions, clampAudiencePosition } from '../audienceLayout'
import { isFlat, partCorners, resolveStageParts } from '../stageParts'
import { toolFor } from '../tools'
import { DEFAULT_VENUE_LAYOUT, stageFootprint, THEATRE } from '../venueLayout'
import { useMapZoom } from './useMapZoom'
import { multiTouch } from './touchCount'

// 図の枠。客席の上の照明（前明かりなど）も縮めずに本当の位置に描くので、枠の下端まで同じ縮尺にする
const MAP_WIDE = { left: 100, top: 70, width: 760, height: 548, svgWidth: 960, svgHeight: 630 }
/** 図の座標の枠。スマホの縦長の画面では、枠も縦長にして画面いっぱいに描く（横長のままだと画面の 3 分の 1 ほどしか使わず、名前が重なっていた。2026-11-18） */
let MAP: { left: number; top: number; width: number; height: number; svgWidth: number; svgHeight: number; keyX?: number; keyY?: number; keyColumns?: number; keyScale?: number } = MAP_WIDE
function mapFrame(aspect: number, keyRows = 0) {
  // 器具表（照明の番号と名前）は図の外に置く。横長の画面では右の列、縦長の画面では図の下
  if (aspect <= MAP_WIDE.svgHeight / MAP_WIDE.svgWidth + .01) {
    if (!keyRows) return MAP_WIDE
    return { ...MAP_WIDE, svgWidth: 960 + KEY_WIDTH, keyX: 960, keyY: MAP_WIDE.top, keyColumns: 1 }
  }
  const svgHeight = Math.round(960 * aspect)
  // スマホでは図が縮んで表示されるので、器具表の字を 2 倍にする。下の操作ボタン（表示・縮尺）に隠れないよう、下を空ける
  const keyScale = 2, bottomReserve = 170
  const keyHeight = keyRows ? (40 + Math.ceil(keyRows / 2) * KEY_ROW) * keyScale + bottomReserve : 0
  return { left: 44, top: 64, width: 872, height: svgHeight - 64 - 20 - keyHeight, svgWidth: 960, svgHeight, keyX: 44, keyY: svgHeight - keyHeight + 40 * keyScale, keyColumns: 2, keyScale }
}
const KEY_WIDTH = 300
const KEY_ROW = 34
const pathColors: Record<DirectionKind, string> = {
  move: '#d4af6f', entrance: '#78bca0', exit: '#df8f7c',
}
/** 平面図の見た目（2026-11-17 オーナーが 2 案とも採用）。light＝3D と同じ暗い舞台に明かりの輪、plot＝紙と墨の線の仕込み図 */
type PlanStyle = 'light' | 'plot'
const PLAN_THEMES = {
  light: { paper: '#0d0b0e', title: '#f0e8da', grid: '#2b2629', gridText: '#7a7066', stageFill: '#2a2420', stageStroke: '#8a6a44', stageWidth: 3,
    seat: '#5a4448', seatStroke: '#8a7a68', setStroke: '#a8957f', setActive: '#e0b45c', label: '#f0e8da', halo: '#0d0b0e', labelActive: '#e0b45c',
    aim: '#a29179', actorStroke: '#f0e8da', actorText: '#fffdf8', fixtureBody: '#1a1618', fixtureText: '#f0e8da', edge: '#f0e8da' },
  plot: { paper: '#f7f5ef', title: '#1d1d1f', grid: '#dfe5ea', gridText: '#7c8791', stageFill: '#fbfaf6', stageStroke: '#1d1d1f', stageWidth: 1.6,
    seat: '#ffffff', seatStroke: '#1d1d1f', setStroke: '#1d1d1f', setActive: '#b0321b', label: '#1d1d1f', halo: '#f7f5ef', labelActive: '#b0321b',
    aim: '#7c8791', actorStroke: '#1d1d1f', actorText: '#1d1d1f', fixtureBody: '#ffffff', fixtureText: '#1d1d1f', edge: '#1d1d1f' },
} as const
const PLAN_STYLE_KEY = 'tomoshibi.planStyle'

const actorColors = ['#9f674d', '#627f9b', '#708d62', '#a27793', '#9a7e48', '#688e89']
const triggerPlaceholders: Record<SceneTriggerType, string> = {
  dialogue: '例：行こう', sound: '例：ドアが閉まる音', light: '例：暗転', other: 'きっかけを入力',
}
function CueIcon({ type }: { type?: SceneTriggerType }) {
  if (type === 'dialogue') return <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.7" aria-hidden="true"><path d="M3 4.5h14v9H9l-4 3v-3H3z" /></svg>
  if (type === 'sound') return <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.7" aria-hidden="true"><path d="M8 14V4l8-2v10" /><circle cx="5.5" cy="15" r="2.5" /><circle cx="13.5" cy="13" r="2.5" /></svg>
  if (type === 'light') return <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.7" aria-hidden="true"><path d="M7 14h6m-5 3h4M6.3 11.5a6 6 0 1 1 7.4 0c-.8.7-1.2 1.4-1.3 2.5H7.6c-.1-1.1-.5-1.8-1.3-2.5Z" /></svg>
  return null
}

type MapBounds = { left: number; right: number; rear: number; front: number }
function clamp(value: number, min: number, max: number) { return Math.max(min, Math.min(max, value)) }
function equalScaleBounds(bounds: MapBounds): MapBounds {
  const width = bounds.right - bounds.left
  const depth = bounds.front - bounds.rear
  const ratio = MAP.width / MAP.height
  if (width / depth < ratio) {
    const extra = (depth * ratio - width) / 2
    return { ...bounds, left: bounds.left - extra, right: bounds.right + extra }
  }
  const extra = (width / ratio - depth) / 2
  return { ...bounds, rear: bounds.rear - extra, front: bounds.front + extra }
}
/** 舞台の床がこれより大きい（m）ときは、最初は床の全体でなく、置いた物が収まる縮尺にする */
const LARGE_STAGE = 40
/** 置いた物が収まる範囲。物が無ければ舞台の中心のまわり。狭すぎないよう 20m × 12m は取る */
function objectBounds(points: StagePoint[], stage: StagePoint[]): MapBounds {
  const source = points.length ? points : stage
  const xs = source.map(point => point[0])
  const zs = source.map(point => point[1])
  const cx = points.length ? (Math.min(...xs) + Math.max(...xs)) / 2 : xs.reduce((sum, x) => sum + x, 0) / xs.length
  const cz = points.length ? (Math.min(...zs) + Math.max(...zs)) / 2 : zs.reduce((sum, z) => sum + z, 0) / zs.length
  const halfX = points.length ? Math.max(10, (Math.max(...xs) - Math.min(...xs)) / 2 + 3) : 10
  const halfZ = points.length ? Math.max(6, (Math.max(...zs) - Math.min(...zs)) / 2 + 3) : 6
  return { left: cx - halfX, right: cx + halfX, rear: cz - halfZ, front: cz + halfZ }
}
/** 拡大と、図を動かした分を当てる */
function zoomBounds(bounds: MapBounds, zoom: number, pan: StagePoint): MapBounds {
  const cx = (bounds.left + bounds.right) / 2 + pan[0]
  const cz = (bounds.rear + bounds.front) / 2 + pan[1]
  const halfX = (bounds.right - bounds.left) / 2 / zoom
  const halfZ = (bounds.front - bounds.rear) / 2 / zoom
  return { left: cx - halfX, right: cx + halfX, rear: cz - halfZ, front: cz + halfZ }
}
function colorToHex(rgb: [number, number, number]) {
  return '#' + rgb.map(value => Math.round(clamp(value, 0, 1) * 255).toString(16).padStart(2, '0')).join('')
}
function hexToRgb(hex: string): [number, number, number] {
  return [1, 3, 5].map(index => parseInt(hex.slice(index, index + 2), 16) / 255) as [number, number, number]
}
function mapPoint(event: PointerEvent<SVGSVGElement>, bounds: MapBounds, includeHouse = false): StagePoint {
  const rect = event.currentTarget.getBoundingClientRect()
  const px = (event.clientX - rect.left) * MAP.svgWidth / rect.width
  const py = (event.clientY - rect.top) * MAP.svgHeight / rect.height
  return [
    Math.round(clamp((px - MAP.left) * (bounds.right - bounds.left) / MAP.width + bounds.left,
      bounds.left - 1, bounds.right + 1) * 10) / 10,
    Math.round(clamp((py - MAP.top) * (bounds.front - bounds.rear) / MAP.height + bounds.rear,
      bounds.rear + .2, includeHouse ? THEATRE.maxZ : bounds.front - .2) * 10) / 10,
  ]
}
/** 押している点の舞台上の座標（丸めない）。ドラッグの移動量を出すのに使う */
function rawMapPoint(event: PointerEvent<SVGSVGElement | SVGElement>, svg: SVGSVGElement, _includeHouse: boolean, bounds: MapBounds): StagePoint {
  const rect = svg.getBoundingClientRect()
  const px = (event.clientX - rect.left) * MAP.svgWidth / rect.width
  const py = (event.clientY - rect.top) * MAP.svgHeight / rect.height
  return [
    (px - MAP.left) * (bounds.right - bounds.left) / MAP.width + bounds.left,
    (py - MAP.top) * (bounds.front - bounds.rear) / MAP.height + bounds.rear,
  ]
}
const round1 = (value: number) => Math.round(value * 10) / 10
/** 奥行の目盛りの間隔（m）。縮めて表示するほど広くする（会場の図と同じ） */
const gridStep = (pxPerMeter: number) => pxPerMeter >= 10 ? 5 : pxPerMeter >= 4 ? 10 : pxPerMeter >= 2 ? 25 : 50
/** 指で押さえやすい大きさ（画面上の半径 px）。平面図は縮んで表示されるので図の単位に直して使う */
const TOUCH_RADIUS_PX = 22
function placeName(point: StagePoint) {
  if (point[0] < -8) return '下手袖'
  if (point[0] > 8) return '上手袖'
  const side = point[0] < -2.4 ? '下手' : point[0] > 2.4 ? '上手' : '中央'
  const depth = point[1] < -4.8 ? '奥' : point[1] > -1.2 ? '前' : ''
  return side + depth
}

// fromTarget: 器具の本体を動かすとき、狙いも同じだけ平行に動かす（向きを保つ）ための開始時の狙い
// grab: 押した点の舞台上の座標。器具と狙いは押した点からのずれだけ動かす（押しただけで中心に飛ばない）
type DragStart = { kind: 'performer' | 'fixture' | 'target' | 'setpiece'; id: string; sceneId: string; from: StagePoint
  fromTarget?: StagePoint; grab?: StagePoint; client?: [number, number]; moved?: boolean }
type OutlineKind = 'scene' | 'chapter'
type OutlineTarget = { id: string; position: 'before' | 'after' | 'chapter' | 'gap';
  chapterId?: string; beforeSceneId?: string | null }
type OutlinePointer = { kind: OutlineKind; id: string; pointerId: number; startX: number; startY: number;
  active: boolean; target: OutlineTarget | null; x: number; y: number }

export function PlanBoard({ open, onClose, onPlay, persistent = false, onNavigate,
  onCloseOutline, onCloseMap, showDirections = true, onToggleDirections,
  sceneEditorOpen = false, onOpenSceneEditor, onCloseSceneEditor }: {
  open: boolean; onClose: () => void; onPlay: () => void; persistent?: boolean; onNavigate?: () => void
  onCloseOutline?: () => void; onCloseMap?: () => void
  showDirections?: boolean; onToggleDirections?: () => void
  sceneEditorOpen?: boolean; onOpenSceneEditor?: () => void; onCloseSceneEditor?: () => void
}) {
  const plan = useStore(s => s.productionPlan)
  const performers = useStore(s => s.performers)
  const fixtures = useStore(s => s.fixtures)
  const setPieces = useStore(s => s.setPieces)
  const stageOutline = stageFootprint(plan.venueLayout ?? DEFAULT_VENUE_LAYOUT)
  // 舞台に置いた物（役者・セット・照明の狙い）。床がとても大きいときは、最初はこれが収まる縮尺にする
  const contentPoints: StagePoint[] = []
  for (const performer of performers) {
    if (performer.onStage !== false) contentPoints.push([performer.position[0], performer.position[2]])
  }
  // 照明は狙いと本体の両方。客席の上の照明も、本当の位置で図に収める
  for (const fixture of fixtures) contentPoints.push([fixture.target[0], fixture.target[2]], [fixture.position[0], fixture.position[2]])
  for (const piece of setPieces) {
    const halfWidth = Math.max(.5, (piece.size?.[0] ?? 1) * Math.abs(piece.scale) / 2)
    const halfDepth = Math.max(.5, (piece.size?.[2] ?? 1) * Math.abs(piece.scale) / 2)
    const angle = piece.rotation[1]
    const dx = Math.abs(Math.cos(angle)) * halfWidth + Math.abs(Math.sin(angle)) * halfDepth
    const dz = Math.abs(Math.sin(angle)) * halfWidth + Math.abs(Math.cos(angle)) * halfDepth
    contentPoints.push([piece.position[0] - dx, piece.position[2] - dz],
      [piece.position[0] + dx, piece.position[2] + dz])
  }
  const stageXs = stageOutline.map(point => point[0])
  const stageZs = stageOutline.map(point => point[1])
  const stageLarge = Math.max(Math.max(...stageXs) - Math.min(...stageXs), Math.max(...stageZs) - Math.min(...stageZs)) > LARGE_STAGE
  // 「舞台全体」: 大きな床でも、床の全体が収まる縮尺にする
  const [showWholeStage, setShowWholeStage] = useState(false)
  const svgRef = useRef<SVGSVGElement>(null)
  // スマホの縦長の画面では、図の枠を入れ物の縦横比に合わせる
  // 入れ物は表示の切り替えで作り直されることがあるので、付くたびに測り直す（ref を関数にする）
  const [mapAspect, setMapAspect] = useState(MAP_WIDE.svgHeight / MAP_WIDE.svgWidth)
  const scrollObserver = useRef<ResizeObserver | null>(null)
  const scrollRef = useCallback((el: HTMLDivElement | null) => {
    scrollObserver.current?.disconnect()
    scrollObserver.current = null
    if (!el) return
    const measure = () => {
      const phone = window.matchMedia('(max-width: 600px)').matches
      const { width, height } = el.getBoundingClientRect()
      if (width <= 0 || height <= 0) return
      const wide = MAP_WIDE.svgHeight / MAP_WIDE.svgWidth
      const next = phone ? Math.min(1.9, Math.max(wide, (height - 10) / (width - 10))) : wide
      setMapAspect(value => Math.abs(value - next) > .02 ? next : value)
    }
    measure()
    scrollObserver.current = new ResizeObserver(measure)
    scrollObserver.current.observe(el)
  }, [])
  const keySelection = useStore(s => s.selection)
  const [showFixtures, setShowFixtures] = useState(true)
  // 仕込み図のように、図には照明の番号だけを描き、名前は欄外の器具表に出す（2026-11-18 オーナー「ごちゃごちゃしてわかりづらい」）。
  // この場面で消えている照明は、初めは描かない。どちらも「表示」から切り替えられ、次に開いたときも覚えておく
  const [fixtureNamesOnPlan, setFixtureNamesOnPlan] = useState(() => { try { return localStorage.getItem('tomoshibi.planFixtureNames') === 'plan' } catch { return false } })
  const [showOffFixtures, setShowOffFixtures] = useState(() => { try { return localStorage.getItem('tomoshibi.planShowOffFixtures') === '1' } catch { return false } })
  useEffect(() => { try { localStorage.setItem('tomoshibi.planFixtureNames', fixtureNamesOnPlan ? 'plan' : 'key') } catch { /* 覚えられなくても使える */ } }, [fixtureNamesOnPlan])
  // 壁・袖幕・ホリゾントの名前は、形で見分けられて場面ごとにも変わらないので、初めは書かない（バトンは番号を図の外に書く）
  const [venueNamesOnPlan, setVenueNamesOnPlan] = useState(() => { try { return localStorage.getItem('tomoshibi.planVenueNames') === '1' } catch { return false } })
  useEffect(() => { try { localStorage.setItem('tomoshibi.planVenueNames', venueNamesOnPlan ? '1' : '0') } catch { /* 覚えられなくても使える */ } }, [venueNamesOnPlan])
  useEffect(() => { try { localStorage.setItem('tomoshibi.planShowOffFixtures', showOffFixtures ? '1' : '0') } catch { /* 覚えられなくても使える */ } }, [showOffFixtures])
  const fixtureShown = (fixture: Fixture) => showOffFixtures || fixture.enabled || (keySelection.kind === 'fixture' && keySelection.id === fixture.id)
  const fixtureNumber = (fixture: Fixture, index: number) => (typeof fixture.number === 'string' && fixture.number.trim()) || String(index + 1)
  // 器具表に載せる照明（番号は器具の並び順か、付けた番号）
  // スマホでは器具表が図を小さくするので、初めは出さない。「細かい表示」の「器具表」で出す（2026-11-19 オーナー「スマホの平面図がごちゃごちゃ」）
  const phoneView = typeof window !== 'undefined' && window.matchMedia('(max-width: 600px)').matches
  const [keyOnPhone, setKeyOnPhone] = useState(() => { try { return localStorage.getItem('tomoshibi.planKeyPhone') === '1' } catch { return false } })
  useEffect(() => { try { localStorage.setItem('tomoshibi.planKeyPhone', keyOnPhone ? '1' : '0') } catch { /* 覚えられなくても使える */ } }, [keyOnPhone])
  const keyFixtures = showFixtures && !fixtureNamesOnPlan && (!phoneView || keyOnPhone)
    ? fixtures.map((fixture, index) => ({ fixture, number: fixtureNumber(fixture, index) })).filter(({ fixture }) => fixtureShown(fixture))
    : []
  MAP = mapFrame(mapAspect, keyFixtures.length)
  // 劇場の壁と客席。最初の縮尺に入れ、後ろの段の客席まで見えるようにする（2026-11-19 オーナー「入れる」。その分、舞台は小さく描かれる）
  const houseOutline: StagePoint[] = []
  {
    const layout = plan.venueLayout ?? DEFAULT_VENUE_LAYOUT
    const offset = layout.stageOffset ?? [0, 0]
    for (const part of resolveStageParts(layout)) for (const [x, z] of partCorners(part)) houseOutline.push([x + offset[0], z + offset[1]])
    for (const block of plan.audienceBlocks ?? []) houseOutline.push(...audienceSeatPositions(block))
  }
  const fitBounds = equalScaleBounds(!plan.venueLayout ? { left: -8, right: 8, rear: -8, front: 2 }
    : stageLarge && !showWholeStage ? objectBounds(contentPoints, stageOutline)
      : {
        left: Math.min(-8, ...[...stageOutline, ...contentPoints].map(point => point[0] - 2), ...houseOutline.map(point => point[0] - .5)),
        right: Math.max(8, ...[...stageOutline, ...contentPoints].map(point => point[0] + 2), ...houseOutline.map(point => point[0] + .5)),
        rear: Math.min(-8, ...[...stageOutline, ...contentPoints].map(point => point[1] - 2), ...houseOutline.map(point => point[1] - .5)),
        front: Math.max(2, ...[...stageOutline, ...contentPoints].map(point => point[1] + 2), ...houseOutline.map(point => point[1] + .5)),
      })
  // ドラッグの間は縮尺を変えない。物を動かすと収める範囲も変わり、つかんだ物が指から逃げる
  const [frozenBounds, setFrozenBounds] = useState<MapBounds | null>(null)
  const mapZoom = useMapZoom(svgRef, () => ({
    center: [(mapBounds.left + mapBounds.right) / 2, (mapBounds.rear + mapBounds.front) / 2],
    toWorld: (clientX, clientY) => {
      const rect = svgRef.current!.getBoundingClientRect()
      const px = (clientX - rect.left) * MAP.svgWidth / rect.width
      const py = (clientY - rect.top) * MAP.svgHeight / rect.height
      return [(px - MAP.left) * (mapBounds.right - mapBounds.left) / MAP.width + mapBounds.left,
        (py - MAP.top) * (mapBounds.front - mapBounds.rear) / MAP.height + mapBounds.rear]
    },
  }))
  const mapBounds = zoomBounds(frozenBounds ?? fitBounds, mapZoom.zoom, mapZoom.pan)
  // 指で図を動かせるのは、拡大したときと大きな床のときだけ。それ以外は、これまでどおり指で図を横にスクロールする
  const autoView = !showWholeStage && mapZoom.zoom === 1 && mapZoom.pan[0] === 0 && mapZoom.pan[1] === 0
  const canPanByTouch = stageLarge || mapZoom.zoom !== 1 || mapZoom.pan[0] !== 0 || mapZoom.pan[1] !== 0
  const mapX = (x: number) => MAP.left + (x - mapBounds.left) * MAP.width / (mapBounds.right - mapBounds.left)
  const stageMapY = (z: number) => MAP.top + (z - mapBounds.rear) * MAP.height / (mapBounds.front - mapBounds.rear)
  const mapY = stageMapY
  const selection = useStore(s => s.selection)
  const select = useStore(s => s.select)
  const updateSettings = useStore(s => s.updateSettings)
  // 平面図では道具を切り替えない。ドラッグは必ず「動かす」。向きは選んだ物に出る取っ手で回す（2026-11-18 オーナー「役割がわからない」→ A 案）
  const tool = 'translate' as Tool
  const ensureScenes = useStore(s => s.ensureScenes)
  const addScene = useStore(s => s.addScene)
  const addSceneAt = useStore(s => s.addSceneAt)
  const addChapter = useStore(s => s.addChapter)
  const addChapterAfter = useStore(s => s.addChapterAfter)
  const addSequence = useStore(s => s.addSequence)
  const updateChapter = useStore(s => s.updateChapter)
  const updateSequence = useStore(s => s.updateSequence)
  const updateProductionPlan = useStore(s => s.updateProductionPlan)
  const selectScene = useStore(s => s.selectScene)
  const updateScene = useStore(s => s.updateScene)
  const removeScene = useStore(s => s.removeScene)
  const removeScenes = useStore(s => s.removeScenes)
  const removeChapter = useStore(s => s.removeChapter)
  const moveScene = useStore(s => s.moveScene)
  const moveSceneToChapter = useStore(s => s.moveSceneToChapter)
  const moveChapter = useStore(s => s.moveChapter)
  const addPerformer = useStore(s => s.addPerformer)
  const updatePerformer = useStore(s => s.updatePerformer)
  const updateFixture = useStore(s => s.updateFixture)
  const updateSetPiece = useStore(s => s.updateSetPiece)
  const [showPerformers, setShowPerformers] = useState(true)
  // スマホでは表示の切り替えを「表示」の小窓にまとめる（2026-11-18 オーナー「スマホで照明や役者の表示を切り替えられない」）
  const [layerMenuOpen, setLayerMenuOpen] = useState(false)
  useEffect(() => {
    if (!layerMenuOpen) return
    const close = (event: globalThis.PointerEvent) => {
      const target = event.target as Element | null
      if (layerMenuRef.current?.contains(target) || target?.closest?.('.plan-layer-menu-button')) return
      setLayerMenuOpen(false)
    }
    const escape = (event: globalThis.KeyboardEvent) => { if (event.key === 'Escape') setLayerMenuOpen(false) }
    window.addEventListener('pointerdown', close)
    window.addEventListener('keydown', escape)
    return () => { window.removeEventListener('pointerdown', close); window.removeEventListener('keydown', escape) }
  }, [layerMenuOpen])
  const [showLabels, setShowLabels] = useState(true)
  // 「細かい表示」の小窓。PC ではボタンの真下に出し、外を押したら閉じる
  const [layerMenuLeft, setLayerMenuLeft] = useState(0)
  const layerMenuRef = useRef<HTMLDivElement>(null)
  // 初めは仕込み図（2026-11-17 オーナー指定）
  const [planStyle, setPlanStyleState] = useState<PlanStyle>(() => { try { return localStorage.getItem(PLAN_STYLE_KEY) === 'light' ? 'light' : 'plot' } catch { return 'plot' } })
  const setPlanStyle = (next: PlanStyle) => { setPlanStyleState(next); try { localStorage.setItem(PLAN_STYLE_KEY, next) } catch { /* 覚えられなくても使える */ } }
  const T = PLAN_THEMES[planStyle]
  const [showSetPieces, setShowSetPieces] = useState(true)
  const [showShared, setShowShared] = useState(true)
  /** 図に出すもの。シーン = このシーンの役者・セット・照明、会場 = 全シーン共通の舞台・部品・客席（オーナー指摘で 1 つにまとめた、2026-11-16） */
  const venue = plan.venueLayout ?? DEFAULT_VENUE_LAYOUT
  const stageParts = resolveStageParts(venue)
  const audienceBlocks = plan.audienceBlocks ?? []
  const [lastMove, setLastMove] = useState<DragStart | null>(null)
  // いま動かしているもの（照明の「位置」か「向き」か）を図の上に出すため
  const [activeDrag, setActiveDrag] = useState<{ kind: 'fixture' | 'target'; id: string } | null>(null)
  // 図の 1px が viewBox の何単位か。つまみを画面上で一定の大きさにする
  const [unitsPerPx, setUnitsPerPx] = useState(1)
  /** 照明・役者の印の大きさ（図の単位）。画面の上で 30px 前後になるようにする */
  const markerSize = Math.max(40, 30 * unitsPerPx)
  const labelFont = Math.max(16, 13 * unitsPerPx)
  // 照明が混み合うときの描き方（2026-11-18 オーナー「照明が多いとカオスで操作できない」）。
  // - 同じ所に吊った照明は、印を少しずつずらして見せる（どれも押せるように。本当の位置には小さな点を残す）
  // - 隣が近い照明は、印を小さくする（重なって番号が読めなくならないように）
  // - 押せる範囲は、隣との間の半分までにする（隣の印を押したのに、こちらが選ばれないように）
  const fixtureLayout = (() => {
    const out = new Map<string, { dx: number; dy: number; scale: number; touch: number }>()
    const base = fixtures.filter(fixtureShown).map(fixture => ({ id: fixture.id, x: mapX(fixture.position[0]), y: mapY(fixture.position[2]) }))
    const shown = base.map(point => ({ ...point }))
    const groups = new Map<string, number[]>()
    base.forEach((point, index) => {
      const key = Math.round(point.x / 3) + ':' + Math.round(point.y / 3)
      groups.set(key, [...(groups.get(key) ?? []), index])
    })
    groups.forEach(members => {
      if (members.length < 2) return
      members.forEach((index, order) => {
        const angle = -Math.PI / 2 + order * 2 * Math.PI / members.length
        shown[index].x += Math.cos(angle) * markerSize * .6
        shown[index].y += Math.sin(angle) * markerSize * .6
      })
    })
    const reach = Math.max(21, TOUCH_RADIUS_PX * unitsPerPx)
    shown.forEach((point, index) => {
      let nearest = Infinity
      shown.forEach((other, otherIndex) => { if (otherIndex !== index) nearest = Math.min(nearest, Math.hypot(other.x - point.x, other.y - point.y)) })
      const scale = Math.max(.45, Math.min(1, nearest / (markerSize * 1.15)))
      out.set(point.id, {
        dx: point.x - base[index].x, dy: point.y - base[index].y, scale,
        touch: Math.max(markerSize * scale * .45, Math.min(reach, nearest / 2)),
      })
    })
    return out
  })()
  const fixtureAt = (fixture: { id: string; position: [number, number, number] }) => {
    const layout = fixtureLayout.get(fixture.id)
    return { x: mapX(fixture.position[0]) + (layout?.dx ?? 0), y: mapY(fixture.position[2]) + (layout?.dy ?? 0), scale: layout?.scale ?? 1, touch: layout?.touch ?? 21 }
  }
  const [feedback, setFeedback] = useState('')
  const [contextMenu, setContextMenu] = useState<{ kind: 'chapter' | 'scene' | 'empty'; id: string; x: number; y: number } | null>(null)
  const [draggingOutline, setDraggingOutline] = useState<{ kind: OutlineKind; id: string } | null>(null)
  /** 並べ替えの間、指（マウス）に付いてくる名札。動きは再描画せずに style で直接動かす */
  const outlineGhostRef = useRef<HTMLDivElement>(null)
  const blockOutlineClickUntil = useRef(0)
  const [movedOutlineId, setMovedOutlineId] = useState<string | null>(null)
  useEffect(() => {
    if (!movedOutlineId) return
    const timer = window.setTimeout(() => setMovedOutlineId(null), 1200)
    return () => window.clearTimeout(timer)
  }, [movedOutlineId])
  const [dropTarget, setDropTarget] = useState<OutlineTarget | null>(null)
  const [selectedSceneIds, setSelectedSceneIds] = useState<Set<string>>(() => new Set())
  const [selectionAnchorId, setSelectionAnchorId] = useState<string | null>(null)
  const [selectionMode, setSelectionMode] = useState(false)
  const outlinePointer = useRef<OutlinePointer | null>(null)
  const suppressOutlineClick = useRef<string | null>(null)
  const outlineRef = useRef<HTMLElement>(null)
  const outlineFrame = useRef(0)
  useEffect(() => () => cancelAnimationFrame(outlineFrame.current), [])
  const dragStart = useRef<DragStart | null>(null)
  useEffect(() => {
    const svg = svgRef.current
    if (!svg || typeof ResizeObserver === 'undefined') return
    const update = () => { const width = svg.getBoundingClientRect().width; if (width > 0) setUnitsPerPx(MAP.svgWidth / width) }
    update()
    const observer = new ResizeObserver(update)
    observer.observe(svg)
    return () => observer.disconnect()
  })
  const chapterNameRef = useRef<HTMLInputElement>(null)
  const sequenceNameRef = useRef<HTMLInputElement>(null)
  const sceneNameRef = useRef<HTMLInputElement>(null)
  const pendingFocus = useRef<'chapter' | 'sequence' | 'scene' | null>(null)
  const [renaming, setRenaming] = useState<{ kind: 'chapter' | 'sequence' | 'scene'; id: string } | null>(null)
  const renameOriginal = useRef('')
  const [collapsedChapters, setCollapsedChapters] = useState<Set<string>>(() => new Set())
  const visibleSelectedIds = plan.scenes.filter(item => selectedSceneIds.has(item.id)).map(item => item.id)

  useEffect(() => {
    const field = pendingFocus.current === 'chapter' ? chapterNameRef.current
      : pendingFocus.current === 'sequence' ? sequenceNameRef.current : sceneNameRef.current
    if (!pendingFocus.current || !field) return
    field.focus()
    field.select()
    pendingFocus.current = null
  }, [plan.activeSceneId, renaming])

  useEffect(() => {
    if (open && (plan.scenes.length === 0 || !plan.chapters?.length || !plan.sequences?.length)) ensureScenes()
  }, [open, plan.scenes.length, plan.chapters?.length, plan.sequences?.length, ensureScenes])

  useEffect(() => {
    if (!contextMenu) return
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return
      event.preventDefault()
      event.stopPropagation()
      setContextMenu(null)
    }
    window.addEventListener('keydown', closeOnEscape, true)
    return () => window.removeEventListener('keydown', closeOnEscape, true)
  }, [contextMenu])

  if (!open) return null
  const activeIndex = plan.scenes.findIndex(item => item.id === plan.activeSceneId)
  const scene = plan.scenes[activeIndex]
  if (!scene) return null
  const sequence = plan.sequences?.find(item => item.id === scene.sequenceId)
  const chapter = plan.chapters?.find(item => item.id === sequence?.chapterId)
  const sequenceScenes = plan.scenes.filter(item => item.sequenceId === sequence?.id)
  const sequenceSceneIndex = sequenceScenes.findIndex(item => item.id === scene.id)
  const previousScene = plan.scenes[activeIndex - 1]
  const directions = activeSceneDirections(plan, performers)
  const targetChanges = previousScene ? fixtures.flatMap(fixture => {
    const previous = previousScene.fixtures.find(item => item.id === fixture.id)
    if (!previous || Math.hypot(previous.target[0] - fixture.target[0], previous.target[2] - fixture.target[2]) < .12) return []
    return [{ fixture, from: previous.target }]
  }) : []
  const selectedPerformer = selection.kind === 'performer'
    ? performers.find(item => item.id === selection.id) : undefined
  const selectedFixture = selection.kind === 'fixture'
    ? fixtures.find(item => item.id === selection.id) : undefined
  const selectedSetPiece = selection.kind === 'setpiece'
    ? setPieces.find(item => item.id === selection.id) : undefined
  const selectedName = selectedPerformer?.name ?? selectedFixture?.name ?? selectedSetPiece?.name
  const selectedPath = directions.find(item => item.performerId === selectedPerformer?.id)
  const stageIsEmpty = performers.length === 0 && fixtures.length === 0 && setPieces.length === 0

  const selectActor = (id: string) => {
    select('performer', id)
  }
  const selectFixture = (id: string, handle: 'position' | 'target' = 'position') => {
    select('fixture', id, handle)
  }
  const selectSetPiece = (id: string) => {
    select('setpiece', id)
  }
  const beginDrag = (event: PointerEvent<SVGElement>, kind: DragStart['kind'], id: string, from: StagePoint) => {
    event.preventDefault()
    event.stopPropagation()
    // 平面図でも道具に従う。「移動」のときだけドラッグで動かし、ほかの道具では選ぶだけ
    const selectKind = kind === 'target' ? 'fixture' : kind
    // 固定した物は動かさない。選んで、図を動かす（選んであれば鍵のボタンを光らせる）
    if (kind !== 'target' && lockedNow(kind, id)) {
      const current = useStore.getState().selection
      if (current.kind === kind && current.id === id) nudgeLock()
      if (kind === 'performer') selectActor(id)
      else if (kind === 'fixture') selectFixture(id, 'position')
      else selectSetPiece(id)
      if (event.button === 0) mapZoom.beginPan(event)
      return
    }
    if (tool === 'select' || toolFor(tool, selectKind, kind === 'target' ? 'target' : 'position') !== 'translate') {
      if (kind === 'performer') selectActor(id)
      else if (kind === 'target' || kind === 'fixture') selectFixture(id, kind === 'target' ? 'target' : 'position')
      else selectSetPiece(id)
      return
    }
    const fixture = kind === 'fixture' ? useStore.getState().fixtures.find(item => item.id === id) : undefined
    const svg = svgRef.current
    dragStart.current = { kind, id, sceneId: scene.id, from,
      fromTarget: fixture ? [fixture.target[0], fixture.target[2]] : undefined,
      grab: svg && (kind === 'fixture' || kind === 'target') ? rawMapPoint(event, svg, kind === 'fixture', mapBounds) : undefined,
      client: [event.clientX, event.clientY] }
    svg?.setPointerCapture(event.pointerId)
    setFrozenBounds(frozenBounds ?? fitBounds)
    if (kind === 'fixture' || kind === 'target') setActiveDrag({ kind, id })
    if (kind === 'performer') selectActor(id)
    else if (kind === 'target' || kind === 'fixture') selectFixture(id, kind === 'target' ? 'target' : 'position')
    else selectSetPiece(id)
  }
  /**
   * 回転の道具で、物を中心のまわりに回す（2026-11-17 オーナー指摘「平面図で回転がうまくできない」）。
   * center は世界の (x, z)。onTurn には、押したときからの回転（度。画面で時計回りが正）を渡す。5° ごとに止まる
   */
  const dragRotate = (event: PointerEvent<SVGElement>, center: StagePoint, label: string, onTurn: (deg: number) => void) => {
    event.preventDefault()
    event.stopPropagation()
    const svg = svgRef.current
    if (!svg) return
    const bounds = mapBounds
    setFrozenBounds(frozenBounds ?? fitBounds)
    const angleOf = (point: { clientX: number; clientY: number }) => {
      const [x, z] = rawMapPoint(point as unknown as PointerEvent<SVGSVGElement>, svg, true, bounds)
      return Math.atan2(z - center[1], x - center[0]) * 180 / Math.PI
    }
    const start = angleOf(event)
    let turned = 0
    const move = (next: globalThis.PointerEvent) => {
      if (next.pointerId !== event.pointerId) return
      // 2 本目の指が触れたら拡大のつもり。動かすのをやめる
      if (multiTouch()) { up(next); return }
      let deg = angleOf(next) - start
      deg = ((deg + 540) % 360) - 180
      turned = Math.round(deg / 5) * 5
      onTurn(turned)
    }
    const up = (next: globalThis.PointerEvent) => {
      if (next.pointerId !== event.pointerId) return
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', up)
      window.removeEventListener('pointercancel', up)
      setFrozenBounds(null)
    }
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', up)
    window.addEventListener('pointercancel', up)
  }
  // 全シーン共通の物（舞台・客席）をドラッグで動かす。動きは window で受ける（StagePartsLayer と同じ）
  const dragShared = (event: PointerEvent<SVGElement>, label: string, onMove: (dx: number, dz: number) => void, lock?: { kind: 'stage' | 'audience'; id: string }) => {
    event.preventDefault()
    event.stopPropagation()
    if (lock && lockedNow(lock.kind, lock.id)) { nudgeLock(); if (event.button === 0) mapZoom.beginPan(event); return }
    const svg = svgRef.current
    if (!svg) return
    const bounds = mapBounds
    setFrozenBounds(frozenBounds ?? fitBounds)
    const start = rawMapPoint(event, svg, true, bounds)
    let moved = false
    const move = (next: globalThis.PointerEvent) => {
      if (next.pointerId !== event.pointerId) return
      // 2 本目の指が触れたら拡大のつもり。動かすのをやめる
      if (multiTouch()) { up(next); return }
      const [x, z] = rawMapPoint(next as unknown as PointerEvent<SVGSVGElement>, svg, true, bounds)
      moved = true
      onMove(round1(x - start[0]), round1(z - start[1]))
    }
    const up = (next: globalThis.PointerEvent) => {
      if (next.pointerId !== event.pointerId) return
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', up)
      window.removeEventListener('pointercancel', up)
      setFrozenBounds(null)
    }
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', up)
    window.addEventListener('pointercancel', up)
  }
  /** 自由形状の舞台の角を引っぱって、形を変える（2026-11-18。以前の「会場」の切り替えで出していた金色の点を、1 枚の平面図に戻した） */
  const dragVertex = (event: PointerEvent<SVGElement>, index: number) => {
    event.preventDefault()
    event.stopPropagation()
    const svg = svgRef.current
    if (!svg) return
    const bounds = mapBounds
    setFrozenBounds(frozenBounds ?? fitBounds)
    const layout = useStore.getState().productionPlan.venueLayout ?? DEFAULT_VENUE_LAYOUT
    const offset = layout.stageOffset ?? [0, 0]
    const start = stageFootprint(layout)
    const move = (next: globalThis.PointerEvent) => {
      if (next.pointerId !== event.pointerId) return
      // 2 本目の指が触れたら拡大のつもり。動かすのをやめる
      if (multiTouch()) { up(next); return }
      const [x, z] = rawMapPoint(next as unknown as PointerEvent<SVGSVGElement>, svg, true, bounds)
      const vertices = start.map((point, at) => at === index ? [round1(x), round1(z)] as StagePoint : point)
      useStore.getState().updateVenueLayout({ stageVertices: vertices.map(([px, pz]) => [round1(px - offset[0]), round1(pz - offset[1])] as StagePoint) })
    }
    const up = (next: globalThis.PointerEvent) => {
      if (next.pointerId !== event.pointerId) return
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', up)
      window.removeEventListener('pointercancel', up)
      setFrozenBounds(null)
    }
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', up)
    window.addEventListener('pointercancel', up)
  }
  const moveDrag = (event: PointerEvent<SVGSVGElement>) => {
    const start = dragStart.current
    if (!start || start.sceneId !== scene.id) return
    // 2 本目の指が触れたら拡大のつもり。ドラッグをやめる（もう動かしていたら元に戻す）
    if (multiTouch()) {
      dragStart.current = null
      setActiveDrag(null)
      setFrozenBounds(null)
      if (start.moved) {
        if (start.kind === 'performer') {
          const actor = useStore.getState().performers.find(item => item.id === start.id)
          if (actor) updatePerformer(actor.id, { position: [start.from[0], actor.position[1], start.from[1]] })
        } else if (start.kind === 'fixture' || start.kind === 'target') {
          const fixture = useStore.getState().fixtures.find(item => item.id === start.id)
          if (fixture && start.kind === 'target') updateFixture(fixture.id, { target: [start.from[0], fixture.target[1], start.from[1]] })
          else if (fixture) updateFixture(fixture.id, { position: [start.from[0], fixture.position[1], start.from[1]],
            ...(start.fromTarget ? { target: [start.fromTarget[0], fixture.target[1], start.fromTarget[1]] as [number, number, number] } : {}) })
        } else {
          const piece = useStore.getState().setPieces.find(item => item.id === start.id)
          if (piece) updateSetPiece(piece.id, { position: [start.from[0], piece.position[1], start.from[1]] })
        }
      }
      return
    }
    // 押しただけ（指が数 px ぶれただけ）では動かさない。選ぶつもりで触れた照明が動いてしまうのを防ぐ
    if (!start.moved && start.client && Math.hypot(event.clientX - start.client[0], event.clientY - start.client[1]) < 6) return
    start.moved = true
    if ((start.kind === 'fixture' || start.kind === 'target') && start.grab) {
      const fixture = useStore.getState().fixtures.find(item => item.id === start.id)
      if (!fixture) return
      const now = rawMapPoint(event, event.currentTarget, start.kind === 'fixture', mapBounds)
      const dx = now[0] - start.grab[0]
      const dz = now[1] - start.grab[1]
      const clampTarget = (x: number, z: number): [number, number, number] => [
        round1(clamp(x, mapBounds.left + .2, mapBounds.right - .2)), fixture.target[1],
        round1(clamp(z, mapBounds.rear + .2, mapBounds.front - .2))]
      if (start.kind === 'target') {
        // 向きだけ変える: 器具の位置はそのまま、狙いだけ動かす
        updateFixture(fixture.id, { target: clampTarget(start.from[0] + dx, start.from[1] + dz) })
      } else {
        // 位置だけ変える: 器具を動かした分だけ狙いも平行に動かし、向きを保つ
        const x = round1(clamp(start.from[0] + dx, mapBounds.left + .5, mapBounds.right - .5))
        const z = round1(clamp(start.from[1] + dz, mapBounds.rear + .5, THEATRE.maxZ))
        const fromTarget = start.fromTarget ?? [fixture.target[0], fixture.target[2]]
        updateFixture(fixture.id, {
          position: [x, fixture.position[1], z],
          target: clampTarget(fromTarget[0] + (x - start.from[0]), fromTarget[1] + (z - start.from[1])),
        })
        // 吊る位置は全シーン共通。向きを保つための狙いの動きは「このシーンだけの変更」として出さない
        clearChange()
      }
      return
    }
    const [x, z] = mapPoint(event, mapBounds, start.kind === 'fixture')
    if (start.kind === 'performer') {
      const actor = useStore.getState().performers.find(item => item.id === start.id)
      if (actor) updatePerformer(actor.id, { position: [x, actor.position[1], z] })
    } else if (start.kind === 'target') {
      const fixture = useStore.getState().fixtures.find(item => item.id === start.id)
      if (fixture) updateFixture(fixture.id, {
        target: [clamp(x, mapBounds.left + .2, mapBounds.right - .2), fixture.target[1], z],
      })
    } else if (start.kind === 'fixture') {
      const fixture = useStore.getState().fixtures.find(item => item.id === start.id)
      if (fixture) updateFixture(fixture.id, {
        position: [clamp(x, mapBounds.left + .5, mapBounds.right - .5), fixture.position[1], clamp(z, mapBounds.rear + .5, THEATRE.maxZ)],
      })
    } else {
      const piece = useStore.getState().setPieces.find(item => item.id === start.id)
      if (piece) updateSetPiece(piece.id, {
        position: [clamp(x, mapBounds.left + .5, mapBounds.right - .5), piece.position[1],
          clamp(z, mapBounds.rear + .5, mapBounds.front - .2)],
      })
    }
  }
  const endDrag = (event: PointerEvent<SVGSVGElement>) => {
    const start = dragStart.current
    dragStart.current = null
    setActiveDrag(null)
    setFrozenBounds(null)
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId)
    if (!start) return
    const point = start.kind === 'target'
      ? useStore.getState().fixtures.find(fixture => fixture.id === start.id)?.target
      : start.kind === 'fixture'
        ? useStore.getState().fixtures.find(fixture => fixture.id === start.id)?.position
        : start.kind === 'performer'
          ? useStore.getState().performers.find(actor => actor.id === start.id)?.position
          : useStore.getState().setPieces.find(piece => piece.id === start.id)?.position
    if (point && Math.hypot(point[0] - start.from[0], point[2] - start.from[1]) > 0.01) {
      setLastMove(start)
      // 動かした・回したことは図を見ればわかるので、知らせは出さない（2026-11-17 オーナー「動かすたびに通知が出る」）
    }
  }
  const undoMove = () => {
    if (!lastMove) return
    if (lastMove.kind === 'performer') {
      if (plan.activeSceneId !== lastMove.sceneId) selectScene(lastMove.sceneId)
      const actor = useStore.getState().performers.find(item => item.id === lastMove.id)
      if (actor) updatePerformer(actor.id, {
        position: [lastMove.from[0], actor.position[1], lastMove.from[1]],
      })
    } else if (lastMove.kind === 'fixture' || lastMove.kind === 'target') {
      const fixture = useStore.getState().fixtures.find(item => item.id === lastMove.id)
      if (fixture) updateFixture(fixture.id, lastMove.kind === 'target'
        ? { target: [lastMove.from[0], fixture.target[1], lastMove.from[1]] }
        : { position: [lastMove.from[0], fixture.position[1], lastMove.from[1]],
          ...(lastMove.fromTarget ? { target: [lastMove.fromTarget[0], fixture.target[1], lastMove.fromTarget[1]] as [number, number, number] } : {}) })
    } else if (lastMove.kind === 'setpiece') {
      const piece = useStore.getState().setPieces.find(item => item.id === lastMove.id)
      if (piece) updateSetPiece(piece.id, {
        position: [lastMove.from[0], piece.position[1], lastMove.from[1]],
      })
    }
    setLastMove(null)
    setFeedback('移動を元の位置に戻しました')
  }
  const createSceneAt = (chapterId: string, beforeSceneId: string | null) => {
    const id = addSceneAt(chapterId, beforeSceneId)
    if (!id) { setFeedback('シーンを追加できませんでした'); return }
    setCollapsedChapters(previous => {
      const next = new Set(previous); next.delete(chapterId); return next
    })
    setLastMove(null)
    setFeedback('シーンを追加しました。名前の変更は右の ⋯ からできます。')
  }
  const createChapterAfter = (chapterId: string) => {
    const id = addChapterAfter(chapterId)
    if (!id) { setFeedback('章を追加できませんでした'); return }
    setCollapsedChapters(previous => {
      const next = new Set(previous); next.delete(id); return next
    })
    setLastMove(null)
    setFeedback('章を追加しました。直前の章の最後の舞台を引き継いでいます。')
  }
  const createNext = (kind: 'scene' | 'sequence' | 'chapter') => {
    if (kind === 'scene') addScene()
    else if (kind === 'sequence') addSequence()
    else addChapter()
    pendingFocus.current = kind
    setLastMove(null)
    setFeedback(kind === 'scene' ? '次のシーンを追加しました。名前を入力してください。舞台の配置は引き継いでいます。'
      : kind === 'sequence' ? 'この章にシーケンスを追加しました。名前を入力してください。'
        : '次の章を追加しました。章名を入力してください。')
  }
  const navigateScene = (id: string, _label: string) => {
    setRenaming(null)
    selectScene(id)
    setLastMove(null)
    setFeedback('')
    onNavigate?.()
  }
  const startRename = (kind: 'chapter' | 'sequence' | 'scene', id: string, title: string) => {
    renameOriginal.current = title
    pendingFocus.current = kind
    setRenaming({ kind, id })
  }
  const cancelRename = () => {
    if (!renaming) return
    if (renaming.kind === 'chapter') updateChapter(renaming.id, renameOriginal.current)
    else if (renaming.kind === 'sequence') updateSequence(renaming.id, renameOriginal.current)
    else updateScene(renaming.id, { title: renameOriginal.current })
    setRenaming(null)
  }
  const openContextMenu = (event: MouseEvent, kind: 'chapter' | 'scene' | 'empty', id: string) => {
    event.preventDefault()
    event.stopPropagation()
    const rect = event.currentTarget.getBoundingClientRect()
    const x = event.clientX || rect.right
    const y = event.clientY || rect.bottom
    setContextMenu({ kind, id, x: Math.max(8, Math.min(x, window.innerWidth - 230)),
      y: Math.max(8, Math.min(y, window.innerHeight - 350)) })
  }
  const reportMove = (result: MoveSceneResult, kind: OutlineKind = 'scene', id?: string) => {
    if (result === 'moved' && id) setMovedOutlineId(id)
    if (result === 'moved') setFeedback(kind === 'chapter' ? '章の順番を変更しました' : 'シーンの順番を変更しました')
    else if (result === 'invalid') setFeedback('移動できませんでした')
  }
  const gapId = (chapterId: string, beforeSceneId: string | null) => `${chapterId}:${beforeSceneId ?? 'end'}`
  const sceneInsertSlot = (chapterId: string, beforeSceneId: string | null) => {
    const id = gapId(chapterId, beforeSceneId)
    return <div className={'plan-scene-slot' + (dropTarget?.position === 'gap' && dropTarget.id === id ? ' drop-active' : '')}
      data-plan-drop="gap" data-chapter-id={chapterId} data-before-scene-id={beforeSceneId ?? ''}>
      <span className="plan-scene-slot-line" aria-hidden="true" />
      <button type="button" disabled={!!draggingOutline || plan.scenes.length >= PLAN_LIMITS.scenes}
        aria-label="ここにシーンを追加" title="ここにシーンを追加"
        onClick={() => {
          if (!outlinePointer.current?.active && Date.now() >= blockOutlineClickUntil.current) createSceneAt(chapterId, beforeSceneId)
        }}>＋ <span>ここにシーンを追加</span></button>
    </div>
  }
  const startOutlineDrag = (event: PointerEvent<HTMLElement>, kind: OutlineKind, id: string) => {
    if (selectionMode || event.button !== 0 || renaming?.id === id) return
    const target = event.target as Element
    if (target.closest('input, textarea, .plan-outline-select, .plan-outline-node-edit')) return
    if (event.pointerType === 'touch' && !target.closest('.plan-scene-grip')) return
    event.currentTarget.setPointerCapture(event.pointerId)
    outlinePointer.current = { kind, id, pointerId: event.pointerId, startX: event.clientX,
      startY: event.clientY, x: event.clientX, y: event.clientY, active: false, target: null }
  }
  const updateOutlinePosition = (x: number, y: number) => {
    const drag = outlinePointer.current
    const outline = outlineRef.current
    if (!drag || !outline) return
    const bounds = outline.getBoundingClientRect()
    let target: OutlineTarget | null = null
    const tree = outline.querySelector<HTMLElement>('.plan-outline-tree')
    const treeBounds = tree?.getBoundingClientRect()
    if (tree && treeBounds && x >= bounds.left && x <= bounds.right &&
        y >= Math.max(bounds.top, treeBounds.top) && y <= Math.min(bounds.bottom, treeBounds.bottom)) {
      const chapters = Array.from(tree.querySelectorAll<HTMLElement>('[data-plan-chapter-id]'))
      const chapterNode = chapters.reduce<HTMLElement | null>((nearest, node) => {
        const distance = (item: HTMLElement) => {
          const rect = item.getBoundingClientRect()
          return Math.max(rect.top - y, y - rect.bottom, 0)
        }
        return !nearest || distance(node) < distance(nearest) ? node : nearest
      }, null)
      if (chapterNode) {
        const chapterId = chapterNode.dataset.planChapterId!
        if (drag.kind === 'scene') {
          const slots = Array.from(chapterNode.querySelectorAll<HTMLElement>('[data-plan-drop="gap"]'))
          const slot = slots.reduce<HTMLElement | null>((nearest, node) => {
            const distance = (item: HTMLElement) => {
              const rect = item.getBoundingClientRect()
              return Math.abs(y - (rect.top + rect.height / 2))
            }
            return !nearest || distance(node) < distance(nearest) ? node : nearest
          }, null)
          if (slot) {
            const beforeSceneId = slot.dataset.beforeSceneId || null
            target = { id: gapId(chapterId, beforeSceneId), position: 'gap', chapterId, beforeSceneId }
          } else {
            target = { id: chapterId, position: 'chapter' }
          }
        } else if (chapterId !== drag.id) {
          const rect = chapterNode.getBoundingClientRect()
          target = { id: chapterId, position: y < rect.top + rect.height / 2 ? 'before' : 'after' }
        }
      }
    }
    drag.target = target
    setDropTarget(previous => JSON.stringify(previous) === JSON.stringify(target) ? previous : target)
  }
  const animateOutlineScroll = (previousTime: number) => {
    outlineFrame.current = requestAnimationFrame(now => {
      const drag = outlinePointer.current
      const outline = outlineRef.current
      if (!drag?.active || !outline) return
      const tree = outline.querySelector<HTMLElement>('.plan-outline-tree')
      const scroller = tree && tree.scrollHeight > tree.clientHeight + 1 ? tree : outline
      const rect = scroller.getBoundingClientRect()
      if (drag.x >= rect.left && drag.x <= rect.right && drag.y >= rect.top && drag.y <= rect.bottom) {
        const edge = 48
        const speed = drag.y < rect.top + edge ? -Math.min(1, (rect.top + edge - drag.y) / edge)
          : drag.y > rect.bottom - edge ? Math.min(1, (drag.y - rect.bottom + edge) / edge) : 0
        const before = scroller.scrollTop
        scroller.scrollTop += speed * Math.min(now - previousTime, 32) * .6
        if (scroller.scrollTop !== before) updateOutlinePosition(drag.x, drag.y)
      }
      animateOutlineScroll(now)
    })
  }
  const updateOutlineDrag = (event: PointerEvent<HTMLElement>) => {
    const drag = outlinePointer.current
    if (!drag || drag.pointerId !== event.pointerId) return
    drag.x = event.clientX
    drag.y = event.clientY
    if (!drag.active && Math.hypot(drag.x - drag.startX, drag.y - drag.startY) < 5) return
    if (!drag.active) {
      drag.active = true
      blockOutlineClickUntil.current = Infinity
      setMovedOutlineId(null)
      setDraggingOutline({ kind: drag.kind, id: drag.id })
      animateOutlineScroll(performance.now())
    }
    if (outlineGhostRef.current) outlineGhostRef.current.style.transform = `translate(${drag.x + 14}px, ${drag.y - 22}px)`
    updateOutlinePosition(drag.x, drag.y)
  }
  const endOutlineDrag = (event: PointerEvent<HTMLElement>) => {
    const drag = outlinePointer.current
    if (!drag || drag.pointerId !== event.pointerId) return
    if (event.type === 'pointerup' && drag.active) updateOutlinePosition(event.clientX, event.clientY)
    cancelAnimationFrame(outlineFrame.current)
    outlinePointer.current = null
    setDraggingOutline(null)
    setDropTarget(null)
    if (drag.active) {
      blockOutlineClickUntil.current = Date.now() + 400
      const key = `${drag.kind}:${drag.id}`
      suppressOutlineClick.current = key
      window.setTimeout(() => { if (suppressOutlineClick.current === key) suppressOutlineClick.current = null }, 0)
    }
    if ((event.type === 'pointercancel' || event.type === 'lostpointercapture') || !drag.active || !drag.target) return
    const target = drag.target
    if (drag.kind === 'chapter' && (target.position === 'before' || target.position === 'after'))
      reportMove(moveChapter(drag.id, target.id, target.position), 'chapter', drag.id)
    else if (drag.kind === 'scene' && target.position === 'gap')
      reportMove(target.beforeSceneId ? moveScene(drag.id, target.beforeSceneId, 'before')
        : moveSceneToChapter(drag.id, target.chapterId!), 'scene', drag.id)
    else if (drag.kind === 'scene' && target.position === 'chapter') reportMove(moveSceneToChapter(drag.id, target.id), 'scene', drag.id)
    else if (drag.kind === 'scene' && (target.position === 'before' || target.position === 'after'))
      reportMove(moveScene(drag.id, target.id, target.position), 'scene', drag.id)
  }
  const toggleSceneSelection = (id: string, range: boolean) => {
    if (range && selectionAnchorId) {
      const start = plan.scenes.findIndex(item => item.id === selectionAnchorId)
      const end = plan.scenes.findIndex(item => item.id === id)
      if (start >= 0 && end >= 0) {
        const ids = plan.scenes.slice(Math.min(start, end), Math.max(start, end) + 1).map(item => item.id)
        setSelectedSceneIds(new Set(ids))
        return
      }
    }
    setSelectedSceneIds(previous => {
      const next = new Set(previous)
      if (next.has(id)) next.delete(id); else next.add(id)
      return next
    })
    setSelectionAnchorId(id)
  }
  const handleSceneClick = (event: MouseEvent<HTMLButtonElement>, id: string) => {
    if (suppressOutlineClick.current === `scene:${id}`) {
      event.preventDefault()
      suppressOutlineClick.current = null
      return
    }
    if (selectionMode || event.shiftKey || event.metaKey || event.ctrlKey) {
      setSelectionMode(true)
      toggleSceneSelection(id, event.shiftKey)
      return
    }
    setSelectionAnchorId(id)
    navigateScene(id, sceneDisplayTitle(plan, id))
  }
  const toggleChapterSelection = (ids: string[]) => {
    if (!ids.length) return
    setSelectedSceneIds(previous => {
      const next = new Set(previous)
      if (ids.every(id => next.has(id))) ids.forEach(id => next.delete(id))
      else ids.forEach(id => next.add(id))
      return next
    })
    setSelectionAnchorId(ids[0])
  }
  const deleteSelectedScenes = async () => {
    if (!visibleSelectedIds.length || !await askConfirm(`選択した${visibleSelectedIds.length}シーンを削除しますか？`)) return
    const count = removeScenes(visibleSelectedIds)
    setSelectedSceneIds(new Set())
    setSelectionAnchorId(null)
    setFeedback(`${count}シーンを削除しました`)
  }
  const deleteChapter = async (id: string) => {
    const item = plan.chapters?.find(chapter => chapter.id === id)
    if (!item || plan.chapters!.length <= 1 || !await askConfirm(`「${item.title || '無題の章'}」と中のシーンを削除しますか？`)) return
    if (removeChapter(id)) {
      setSelectedSceneIds(new Set())
      setSelectionAnchorId(null)
      setFeedback('章と中のシーンを削除しました')
    }
  }
  const moveByOne = (id: string, direction: -1 | 1) => {
    const currentPlan = useStore.getState().productionPlan
    const moving = currentPlan.scenes.find(item => item.id === id)
    const currentChapterId = currentPlan.sequences?.find(item => item.id === moving?.sequenceId)?.chapterId
    const groupIds = new Set(currentPlan.sequences?.filter(item => item.chapterId === currentChapterId).map(item => item.id) ?? [])
    const entries = currentPlan.scenes.filter(item => groupIds.has(item.sequenceId ?? ''))
    const index = entries.findIndex(item => item.id === id)
    const target = entries[index + direction]
    if (target) reportMove(moveScene(id, target.id, direction < 0 ? 'before' : 'after'))
  }
  const moveChapterByOne = (id: string, direction: -1 | 1) => {
    const chapters = useStore.getState().productionPlan.chapters ?? []
    const index = chapters.findIndex(item => item.id === id)
    const target = chapters[index + direction]
    if (target) reportMove(moveChapter(id, target.id, direction < 0 ? 'before' : 'after'), 'chapter')
  }
  const deleteScene = async (id: string) => {
    if (plan.scenes.length <= 1 || !await askConfirm('このシーンを削除しますか？')) return
    removeScene(id)
    setLastMove(null)
    setFeedback('シーンを削除しました')
  }
  const menuScene = contextMenu?.kind === 'scene' ? plan.scenes.find(item => item.id === contextMenu.id) : undefined
  const menuSceneChapterId = plan.sequences?.find(item => item.id === menuScene?.sequenceId)?.chapterId
  const menuChapterSequenceIds = new Set(plan.sequences?.filter(item => item.chapterId === menuSceneChapterId).map(item => item.id) ?? [])
  const menuChapterScenes = plan.scenes.filter(item => menuChapterSequenceIds.has(item.sequenceId ?? ''))
  const menuSceneIndex = menuChapterScenes.findIndex(item => item.id === menuScene?.id)
  const lastChapterId = plan.chapters?.slice(-1)[0]?.id
  // 平面図を PNG の画像で保存する（SVG はなじみが薄いため。2026-11-17 オーナー指摘）。大きさは図の 2 倍
  const saveDiagram = async () => {
    if (!svgRef.current) return
    const clone = svgRef.current.cloneNode(true) as SVGSVGElement
    clone.setAttribute('width', String(MAP.svgWidth * 2))
    clone.setAttribute('height', String(MAP.svgHeight * 2))
    const source = URL.createObjectURL(new Blob([new XMLSerializer().serializeToString(clone)], { type: 'image/svg+xml' }))
    let blob: Blob | null = null
    try {
      const image = new Image()
      await new Promise((resolve, reject) => { image.onload = resolve; image.onerror = reject; image.src = source })
      const canvas = document.createElement('canvas')
      canvas.width = MAP.svgWidth * 2
      canvas.height = MAP.svgHeight * 2
      const context = canvas.getContext('2d')
      if (!context) throw new Error('canvas')
      context.fillStyle = '#ffffff'
      context.fillRect(0, 0, canvas.width, canvas.height)
      context.drawImage(image, 0, 0, canvas.width, canvas.height)
      blob = await new Promise<Blob | null>(resolve => canvas.toBlob(resolve, 'image/png'))
    } catch {
      setFeedback('平面図を画像にできませんでした。もう一度お試しください')
      return
    } finally { URL.revokeObjectURL(source) }
    if (!blob) return
    const name = (persistent ? sceneDisplayTitle(plan, scene.id) : scene.title.trim() || '演出プラン')
      .replace(/[\\/:*?"<>|]/g, '_')
    const file = new File([blob], name + (persistent ? '' : '-シーン' + (activeIndex + 1)) + '-平面図.png', { type: 'image/png' })
    // 共有の画面は、指で操作する端末（スマホ・アプリ）だけ。PC は Mac でも共有の画面が出てしまい、すぐ保存できなかった（2026-11-18 オーナー）
    const touchDevice = window.matchMedia?.('(pointer: coarse)').matches
    if (touchDevice && navigator.canShare?.({ files: [file] })) {
      try {
        await navigator.share({ files: [file], title: persistent ? sceneDisplayTitle(plan, scene.id) : scene.title || '演出プラン' })
        setFeedback('平面図を共有しました')
        return
      } catch (error) {
        if (error instanceof DOMException && error.name === 'AbortError') return
      }
    }
    const url = URL.createObjectURL(file)
    const link = document.createElement('a')
    link.href = url
    link.download = file.name
    link.click()
    setFeedback('平面図を画像（PNG）で保存しました')
    window.setTimeout(() => URL.revokeObjectURL(url), 1000)
  }

  return <section id="plan-board" className={'plan-board' + (contextMenu ? ' context-open' : '') +
    (sceneEditorOpen ? ' scene-editor-open' : '')} aria-label="平面図・演出プラン">
    <div className="plan-board-head">
      <strong>{plan.projectTitle?.trim() || '名称未設定のプロジェクト'}</strong>
      <span>演出プラン</span>
      {!persistent && <button className="plan-play-button" onClick={onPlay}>▶ 通しで見る</button>}
      {!persistent && <button className="plan-board-close" onClick={onClose}>3D 舞台に戻る</button>}
    </div>
    <div className="plan-board-body">
      <aside id="plan-outline" ref={outlineRef} className={'plan-outline' + (selectionMode ? ' selection-mode' : '') + (draggingOutline ? ' outline-dragging' : '')}
        onClickCapture={event => {
          if (Date.now() < blockOutlineClickUntil.current) { event.preventDefault(); event.stopPropagation() }
        }} aria-label="プロジェクトの構成">
        {persistent ? <div className="plan-outline-project plan-outline-heading">
          <div className="plan-outline-heading-row"><strong>公演の流れ</strong>
            <button type="button" className="plan-selection-toggle" aria-pressed={selectionMode}
              onClick={() => {
                setSelectionMode(value => !value)
                setSelectedSceneIds(new Set())
                setSelectionAnchorId(null)
              }} title={selectionMode ? 'まとめて削除をやめる' : 'シーンにチェックを付けて、まとめて削除する'}>{selectionMode ? '完了' : 'まとめて削除'}</button>
            <button type="button" className="plan-pane-close" aria-label="シーン一覧を閉じる"
              title="シーン一覧を閉じる" onClick={onCloseOutline}>×</button></div>
          {selectionMode ? <small>消すシーンにチェックを付けて「削除」。Shift を押しながらで範囲をまとめて選べます</small>
            : <><small>章を開き、シーンを選ぶと舞台が切り替わります</small>
              <small>行をドラッグして並べ替え · 行間の＋で追加 · ⋯で編集</small></>}
        </div> : <div className="plan-outline-project">
          <label>プロジェクト名<input value={plan.projectTitle ?? ''} maxLength={60} placeholder="例：秋公演 A劇場"
            onChange={event => updateProductionPlan({ projectTitle: event.target.value })} /></label>
        </div>}
        {/* 一覧は引き出しで transform が付くので、名札は body に出す（fixed の基準がずれないように） */}
        {draggingOutline && createPortal(<div ref={outlineGhostRef} className="plan-outline-ghost" aria-hidden="true"
          style={{ transform: `translate(${(outlinePointer.current?.x ?? 0) + 14}px, ${(outlinePointer.current?.y ?? 0) - 22}px)` }}>
          <span>{draggingOutline.kind === 'chapter' ? '章' : 'シーン'}</span>
          {draggingOutline.kind === 'chapter'
            ? plan.chapters?.find(item => item.id === draggingOutline.id)?.title || '無題の章'
            : sceneDisplayTitle(plan, draggingOutline.id)}
        </div>, document.body)}
        {persistent && selectionMode && <div className="plan-outline-selection-bar">
          <strong>{visibleSelectedIds.length} / {plan.scenes.length} シーン選択中</strong>
          <button type="button" disabled={visibleSelectedIds.length === plan.scenes.length}
            onClick={() => setSelectedSceneIds(new Set(plan.scenes.map(item => item.id)))}>すべて選択</button>
          <button type="button" disabled={!visibleSelectedIds.length} onClick={deleteSelectedScenes}>削除</button>
          <button type="button" disabled={!visibleSelectedIds.length} onClick={() => setSelectedSceneIds(new Set())}>解除</button>
        </div>}
        <nav className="plan-outline-tree" aria-label={persistent ? '章とシーン' : '章・シーケンス・シーン'}
          onContextMenu={persistent ? event => openContextMenu(event, 'empty', '') : undefined}>
          {plan.chapters?.map((item, chapterIndex) => {
            const groups = plan.sequences?.filter(group => group.chapterId === item.id) ?? []
            const groupIds = new Set(groups.map(group => group.id))
            const scenesInChapter = plan.scenes.filter(entry => groupIds.has(entry.sequenceId ?? ''))
            return <div className="plan-outline-chapter" key={item.id} data-plan-chapter-id={item.id}>
              {persistent ? <div className={'plan-outline-node chapter' + (chapter?.id === item.id ? ' in-path' : '') +
                (movedOutlineId === item.id ? ' just-moved' : '') +
                (draggingOutline?.kind === 'chapter' && draggingOutline.id === item.id ? ' dragging' : '') +
                (dropTarget?.id === item.id ? ` drop-${dropTarget.position}` : '')}
                data-plan-drop="chapter" data-chapter-id={item.id}
                onContextMenu={event => openContextMenu(event, 'chapter', item.id)}>
                {selectionMode && <button type="button" className="plan-outline-select" disabled={!scenesInChapter.length}
                  aria-pressed={scenesInChapter.length > 0 && scenesInChapter.every(entry => selectedSceneIds.has(entry.id))}
                  aria-label={`${item.title || '章'}のシーンをまとめて選択`}
                  onClick={() => toggleChapterSelection(scenesInChapter.map(entry => entry.id))}>
                  {scenesInChapter.length > 0 && scenesInChapter.every(entry => selectedSceneIds.has(entry.id)) ? '✓' : ''}</button>}
                <span className="plan-scene-grip" role="button" tabIndex={0}
                  aria-label={`${item.title || '章'}を並べ替え。上下キーでも移動できます`} title="ドラッグまたは上下キーで章ごと並べ替え"
                  onKeyDown={event => {
                    if (event.key === 'ArrowUp' || event.key === 'ArrowDown') {
                      event.preventDefault(); moveChapterByOne(item.id, event.key === 'ArrowUp' ? -1 : 1)
                    }
                  }}
                  onPointerDown={event => startOutlineDrag(event, 'chapter', item.id)}
                  onPointerMove={updateOutlineDrag} onPointerUp={endOutlineDrag} onPointerCancel={endOutlineDrag} onLostPointerCapture={endOutlineDrag}>⠿</span>
                {renaming?.kind === 'chapter' && renaming.id === item.id
                  ? <input ref={chapterNameRef} aria-label="章名" value={item.title} maxLength={60} placeholder="章名"
                    onChange={event => updateChapter(item.id, event.target.value)}
                    onBlur={() => setRenaming(null)}
                    onKeyDown={event => {
                      if (event.key === 'Enter') setRenaming(null)
                      else if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); cancelRename() }
                    }} />
                  : <><button className="plan-outline-node-main" aria-expanded={!collapsedChapters.has(item.id)}
                    onKeyDown={event => { if (event.key === 'F2') { event.preventDefault(); startRename('chapter', item.id, item.title) } }}
                    onPointerDown={event => startOutlineDrag(event, 'chapter', item.id)}
                    onPointerMove={updateOutlineDrag} onPointerUp={endOutlineDrag} onPointerCancel={endOutlineDrag} onLostPointerCapture={endOutlineDrag}
                    onClick={event => {
                      if (suppressOutlineClick.current === `chapter:${item.id}`) {
                        event.preventDefault()
                        suppressOutlineClick.current = null
                        return
                      }
                      setCollapsedChapters(previous => {
                        const next = new Set(previous)
                        if (next.has(item.id)) next.delete(item.id); else next.add(item.id)
                        return next
                      })
                    }}><small>{collapsedChapters.has(item.id) ? '▶' : '▼'} 章</small><strong>{item.title || '無題の章'}</strong></button>
                    <button className="plan-outline-node-edit" aria-label={`${item.title || '章'}の操作メニュー`}
                      title="章の操作" onClick={event => openContextMenu(event, 'chapter', item.id)}>⋯</button></>}
              </div> : <button className={'plan-outline-chapter-button' + (chapter?.id === item.id ? ' active' : '')}
                onClick={() => {
                  const first = plan.scenes.find(entry => groups.some(group => group.id === entry.sequenceId))
                  if (first) navigateScene(first.id, item.title || '章')
                }}>{chapterIndex + 1}. {item.title || '無題の章'}</button>}
              {!persistent && chapter?.id === item.id && <label className="plan-outline-rename">章名
                <input ref={chapterNameRef} value={item.title} maxLength={60} placeholder="章名"
                  onChange={event => updateChapter(item.id, event.target.value)} />
              </label>}
              {persistent && !collapsedChapters.has(item.id) && sceneInsertSlot(item.id, scenesInChapter[0]?.id ?? null)}
              {persistent && !collapsedChapters.has(item.id) && scenesInChapter.map((entry, entryIndex) =>
                <Fragment key={entry.id}><div
                  className={'plan-outline-node scene' + (entry.id === scene.id ? ' active' : '') +
                    (selectedSceneIds.has(entry.id) ? ' multi-selected' : '') +
                    (movedOutlineId === entry.id ? ' just-moved' : '') +
                    (draggingOutline?.kind === 'scene' && draggingOutline.id === entry.id ? ' dragging' : '') +
                    (dropTarget?.id === entry.id ? ` drop-${dropTarget.position}` : '')}
                  data-plan-drop="scene" data-scene-id={entry.id}
                  onContextMenu={event => openContextMenu(event, 'scene', entry.id)}>
                  {selectionMode && <button type="button" className="plan-outline-select"
                    aria-pressed={selectedSceneIds.has(entry.id)} aria-label={`${sceneDisplayTitle(plan, entry.id)}を選択`}
                    onClick={event => { event.stopPropagation(); toggleSceneSelection(entry.id, event.shiftKey) }}>
                    {selectedSceneIds.has(entry.id) ? '✓' : ''}</button>}
                  <span className="plan-scene-grip" role="button" tabIndex={0}
                    aria-label={`${sceneDisplayTitle(plan, entry.id)}を並べ替え。上下キーでも移動できます`} title="ドラッグまたは上下キーでシーンを並べ替え"
                    onKeyDown={event => {
                      if (event.key === 'ArrowUp' || event.key === 'ArrowDown') {
                        event.preventDefault(); moveByOne(entry.id, event.key === 'ArrowUp' ? -1 : 1)
                      }
                    }}
                    onPointerDown={event => startOutlineDrag(event, 'scene', entry.id)}
                    onPointerMove={updateOutlineDrag} onPointerUp={endOutlineDrag} onPointerCancel={endOutlineDrag} onLostPointerCapture={endOutlineDrag}>⠿</span>
                  {renaming?.kind === 'scene' && renaming.id === entry.id
                    ? <input ref={sceneNameRef} aria-label="シーン名" value={entry.title} maxLength={60} placeholder="シーン名"
                      onChange={event => updateScene(entry.id, { title: event.target.value })}
                      onBlur={() => setRenaming(null)}
                      onKeyDown={event => {
                        if (event.key === 'Enter') setRenaming(null)
                        else if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); cancelRename() }
                      }} />
                    : <><button className="plan-outline-node-main" aria-current={entry.id === scene.id ? 'step' : undefined}
                      onKeyDown={event => { if (event.key === 'F2') { event.preventDefault(); startRename('scene', entry.id, entry.title) } }}
                      onPointerDown={event => startOutlineDrag(event, 'scene', entry.id)}
                      onPointerMove={updateOutlineDrag} onPointerUp={endOutlineDrag} onPointerCancel={endOutlineDrag} onLostPointerCapture={endOutlineDrag}
                      onClick={event => handleSceneClick(event, entry.id)}>
                      <strong>{sceneDisplayTitle(plan, entry.id)}</strong>
                      {(entry.trigger ?? '').trim() && <small className="plan-scene-cue-summary"
                        aria-label={entry.triggerType && entry.triggerType !== 'other'
                          ? `${SCENE_TRIGGER_LABELS[entry.triggerType]}: ${entry.trigger}` : entry.trigger}>
                        <CueIcon type={entry.triggerType} /><span>{entry.trigger}</span></small>}</button>
                      <button className="plan-outline-node-edit" aria-label={`${sceneDisplayTitle(plan, entry.id)}の操作メニュー`}
                        title="シーンの操作" onClick={event => openContextMenu(event, 'scene', entry.id)}>⋯</button></>}
                </div>
                  {sceneInsertSlot(item.id, scenesInChapter[entryIndex + 1]?.id ?? null)}</Fragment>)}
              {!persistent && groups.map((group, groupIndex) => {
                const entries = plan.scenes.filter(entry => entry.sequenceId === group.id)
                return <div className="plan-outline-sequence" key={group.id}>
                  <button className={'plan-outline-sequence-button' + (sequence?.id === group.id ? ' active' : '')}
                    onClick={() => { if (entries[0]) navigateScene(entries[0].id, group.title || 'シーケンス') }}>
                    {groupIndex + 1}. {group.title || '無題のシーケンス'}</button>
                  {sequence?.id === group.id && <label className="plan-outline-rename">シーケンス名
                    <input ref={sequenceNameRef} value={group.title} maxLength={60} placeholder="シーケンス名"
                      onChange={event => updateSequence(group.id, event.target.value)} />
                  </label>}
                  {entries.map((entry, entryIndex) => <button key={entry.id}
                    className={'plan-outline-scene-button' + (entry.id === scene.id ? ' active' : '')}
                    aria-current={entry.id === scene.id ? 'step' : undefined}
                    onClick={() => navigateScene(entry.id, entry.title || 'シーン')}>
                    {entryIndex + 1}. {entry.title || '無題のシーン'}
                  </button>)}
                </div>
              })}
            </div>
          })}
        </nav>
        <div className="plan-outline-actions">
          {!persistent && <button className="plan-add-scene" onClick={() => createNext('scene')} disabled={plan.scenes.length >= PLAN_LIMITS.scenes}>
            ＋ 次のシーン<small>現在の舞台を複製</small></button>}
          {!persistent && <button onClick={() => createNext('sequence')} disabled={plan.scenes.length >= PLAN_LIMITS.scenes}>
            ＋ 次のシーケンス<small>この章に追加</small></button>}
          <button className={persistent ? 'plan-add-chapter' : undefined}
            onClick={() => persistent && lastChapterId ? createChapterAfter(lastChapterId) : createNext('chapter')}
            disabled={plan.scenes.length >= PLAN_LIMITS.scenes || (plan.chapters?.length ?? 0) >= PLAN_LIMITS.chapters}>
            {persistent ? '＋ 章を追加' : '＋ 次の章'}<small>{persistent ? '最後の章の舞台を引き継ぐ' : '章を追加'}</small></button>
          {persistent && plan.scenes.length >= PLAN_LIMITS.scenes &&
            <small className="plan-outline-limit">シーンは最大{PLAN_LIMITS.scenes}件です。追加するには不要なシーンを削除してください。</small>}
          {persistent && (plan.chapters?.length ?? 0) >= PLAN_LIMITS.chapters &&
            <small className="plan-outline-limit">章は最大{PLAN_LIMITS.chapters}件です。</small>}
          {!persistent && <small>新しいシーンには現在の舞台の配置を引き継ぎます</small>}
        </div>
      </aside>
      {feedback && <WorkspaceNotice>
        <span>{feedback}</span>
        <button aria-label="通知を閉じる" onClick={() => setFeedback('')}>×</button>
      </WorkspaceNotice>}
      {persistent && contextMenu && <>
        <div className="plan-context-backdrop" onPointerDown={() => setContextMenu(null)} />
        <div className="plan-context-menu" role="menu" aria-label="構成の操作"
          style={{ left: contextMenu.x, top: contextMenu.y }}>
          {contextMenu.kind === 'scene' && menuScene ? <>
            <strong>{sceneDisplayTitle(plan, menuScene.id)}</strong>
            <button role="menuitem" autoFocus onClick={() => { setContextMenu(null); startRename('scene', menuScene.id, menuScene.title) }}>名前を変更</button>
            <button role="menuitem" onClick={() => {
              setContextMenu(null)
              if (menuScene.id !== scene.id) selectScene(menuScene.id)
              onOpenSceneEditor?.()
            }}>きっかけ・メモを編集</button>
            <button role="menuitem" disabled={!menuSceneChapterId || plan.scenes.length >= PLAN_LIMITS.scenes}
              onClick={() => {
                setContextMenu(null)
                if (menuSceneChapterId) createSceneAt(menuSceneChapterId, menuChapterScenes[menuSceneIndex + 1]?.id ?? null)
              }}>この後にシーンを追加</button>
            <button role="menuitem" disabled={menuSceneIndex <= 0}
              onClick={() => { setContextMenu(null); moveByOne(menuScene.id, -1) }}>一つ上へ移動</button>
            <button role="menuitem" disabled={menuSceneIndex >= menuChapterScenes.length - 1}
              onClick={() => { setContextMenu(null); moveByOne(menuScene.id, 1) }}>一つ下へ移動</button>
            {plan.chapters && plan.chapters.length > 1 && <>
              <span className="plan-context-label">別の章へ移動</span>
              {plan.chapters.filter(item => item.id !== menuSceneChapterId).map(item =>
                <button role="menuitem" key={item.id} onClick={() => {
                  setContextMenu(null)
                  reportMove(moveSceneToChapter(menuScene.id, item.id))
                }}>{item.title || '無題の章'}へ</button>)}
            </>}
            <button role="menuitem" className="danger" disabled={plan.scenes.length <= 1}
              onClick={() => { setContextMenu(null); deleteScene(menuScene.id) }}>このシーンを削除</button>
          </> : contextMenu.kind === 'chapter' ? <>
            <strong>{plan.chapters?.find(item => item.id === contextMenu.id)?.title || '章'}</strong>
            <button role="menuitem" autoFocus onClick={() => {
              const item = plan.chapters?.find(item => item.id === contextMenu.id)
              setContextMenu(null)
              if (item) startRename('chapter', item.id, item.title)
            }}>章名を変更</button>
            <button role="menuitem" onClick={() => { setContextMenu(null); createChapterAfter(contextMenu.id) }}>この後に章を追加</button>
            <button role="menuitem" disabled={plan.scenes.length >= PLAN_LIMITS.scenes}
              onClick={() => { setContextMenu(null); createSceneAt(contextMenu.id, null) }}>この章にシーンを追加</button>
            <button role="menuitem" disabled={(plan.chapters?.findIndex(item => item.id === contextMenu.id) ?? 0) <= 0}
              onClick={() => {
                const index = plan.chapters?.findIndex(item => item.id === contextMenu.id) ?? -1
                const target = plan.chapters?.[index - 1]
                setContextMenu(null)
                if (target) reportMove(moveChapter(contextMenu.id, target.id, 'before'), 'chapter')
              }}>章ごと一つ上へ移動</button>
            <button role="menuitem" disabled={(plan.chapters?.findIndex(item => item.id === contextMenu.id) ?? 0) >= (plan.chapters?.length ?? 0) - 1}
              onClick={() => {
                const index = plan.chapters?.findIndex(item => item.id === contextMenu.id) ?? -1
                const target = plan.chapters?.[index + 1]
                setContextMenu(null)
                if (target) reportMove(moveChapter(contextMenu.id, target.id, 'after'), 'chapter')
              }}>章ごと一つ下へ移動</button>
            <button role="menuitem" className="danger" disabled={(plan.chapters?.length ?? 0) <= 1}
              onClick={() => { setContextMenu(null); deleteChapter(contextMenu.id) }}>章と中のシーンを削除</button>
          </> : <>
            <strong>公演の流れ</strong>
            <button role="menuitem" autoFocus onClick={() => {
              setContextMenu(null)
              if (lastChapterId) createChapterAfter(lastChapterId)
            }}>章を追加</button>
          </>}
        </div>
      </>}
      {persistent && sceneEditorOpen && <div className="plan-scene-editor-backdrop"
        onPointerDown={event => { if (event.target === event.currentTarget) onCloseSceneEditor?.() }}>
        <section className="plan-scene-editor" role="dialog" aria-modal="true" aria-labelledby="plan-scene-editor-heading"
          onKeyDown={event => {
            if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); onCloseSceneEditor?.() }
          }}>
          <header><div><small>シーンの設定</small><h2 id="plan-scene-editor-heading">{sceneDisplayTitle(plan, scene.id)}</h2></div>
            <button type="button" aria-label="シーンの設定を閉じる" onClick={onCloseSceneEditor}>×</button></header>
          <div className="plan-scene-editor-body">
            <div className="plan-scene-editor-cue"><span>切り替えのきっかけ</span>
              <div>
                <select autoFocus aria-label="きっかけの種類"
                  value={scene.triggerType ?? (scene.trigger ? 'other' : '')}
                  onChange={event => {
                    const type = event.target.value as SceneTriggerType | ''
                    updateScene(scene.id, type ? { triggerType: type } : { triggerType: undefined, trigger: '' })
                  }}>
                  <option value="">なし</option>
                  {Object.entries(SCENE_TRIGGER_LABELS).map(([value, label]) =>
                    <option key={value} value={value}>{label}</option>)}
                </select>
                {(scene.triggerType || scene.trigger) && <input aria-label="きっかけの内容" value={scene.trigger}
                  maxLength={160} placeholder={triggerPlaceholders[scene.triggerType ?? 'other']}
                  onChange={event => updateScene(scene.id, { trigger: event.target.value })} />}
              </div>
            </div>
            <label>演出メモ<textarea value={scene.note} maxLength={1000} rows={5}
              placeholder="役者の動きや照明の意図、確認事項など"
              onChange={event => updateScene(scene.id, { note: event.target.value })} /></label>
            <small>変更は自動保存されます</small>
          </div>
          <footer><button type="button" onClick={onCloseSceneEditor}>閉じる</button></footer>
        </section>
      </div>}
    <div className="plan-board-content">
      {persistent && <PlanResizeHandle />}
      <div className="plan-map-pane">
        <div className="plan-map-caption">
          <span>{stageIsEmpty
          ? 'まず舞台に置くものを選んでください'
            : selectedPerformer ? `${selectedPerformer.name}を選択中 · 丸をドラッグして立ち位置を変更`
            : selectedFixture ? `${selectedFixture.name}を選択中 · 番号をドラッグして設置位置、色の輪で光の狙いを変更`
              : selectedSetPiece ? `${selectedSetPiece.name}を選択中 · 四角をドラッグして位置を変更`
                : '丸や四角をドラッグして移動します'}</span>
          {persistent && <button type="button" className="plan-pane-close plan-map-close"
            aria-label="平面図を閉じる" title="平面図を閉じる" onClick={onCloseMap}>×</button>}
        </div>
        <>
        <div className="plan-map-layerbar" role="group" aria-label="平面図の表示">
          <span>図に表示</span>
          <button type="button" className={showShared ? 'active' : ''} aria-pressed={showShared}
            title="全シーン共通の壁・バトン・客席を、灰色で下に描きます"
            onClick={() => setShowShared(value => !value)}>壁・客席</button>
          <button type="button" className={showSetPieces ? 'active' : ''} aria-pressed={showSetPieces}
            onClick={() => setShowSetPieces(value => !value)}>舞台セット</button>
          <button type="button" className={showFixtures ? 'active' : ''} aria-pressed={showFixtures}
            onClick={() => setShowFixtures(value => !value)}>照明</button>
          <button type="button" className={showPerformers ? 'active' : ''} aria-pressed={showPerformers}
            onClick={() => setShowPerformers(value => !value)}>役者</button>
          {/* 細かい表示（名前・消えている照明・前のシーンからの変化）は、この小窓にまとめる（2026-11-18 オーナー「メニュー多すぎてわかりづらい」）。
              スマホは帯に何も出さないので、壁・客席などの切り替えもここに入れる */}
          <button type="button" className="plan-layer-menu-button" aria-expanded={layerMenuOpen} aria-haspopup="true"
            onClick={event => { setLayerMenuLeft(event.currentTarget.offsetLeft); setLayerMenuOpen(open => !open) }}>細かい表示 <span aria-hidden="true">⌄</span></button>
          {layerMenuOpen && <div className="plan-layer-menu" ref={layerMenuRef} role="group" aria-label="平面図の細かい表示" style={{ left: layerMenuLeft }}>
            {([
              ['壁・客席', showShared, setShowShared, true],
              ['舞台セット', showSetPieces, setShowSetPieces, true],
              ['照明', showFixtures, setShowFixtures, true],
              ['役者', showPerformers, setShowPerformers, true],
              ...(phoneView ? [['器具表', keyOnPhone, setKeyOnPhone, false] as [string, boolean, (update: (value: boolean) => boolean) => void, boolean]] : []),
              ['役者・セットの名前', showLabels, setShowLabels, false],
              ['照明の名前を図に書く', fixtureNamesOnPlan, setFixtureNamesOnPlan, false],
              ['消えている照明', showOffFixtures, setShowOffFixtures, false],
              ['壁・袖幕の名前', venueNamesOnPlan, setVenueNamesOnPlan, false],
            ] as Array<[string, boolean, (update: (value: boolean) => boolean) => void, boolean]>).map(([label, on, set, basic]) =>
              <label key={label} className={'plan-layer-menu-row' + (basic ? ' plan-layer-menu-basic' : '')}>
                <input type="checkbox" checked={on} onChange={() => set(value => !value)} />{label}</label>)}
            {persistent && onToggleDirections && <label className="plan-layer-menu-row">
              <input type="checkbox" checked={showDirections} onChange={onToggleDirections} />前の場面からの矢印</label>}
            <button type="button" className="plan-layer-menu-close" onClick={() => setLayerMenuOpen(false)}>閉じる</button>
          </div>}
          <div className="plan-map-zoom" role="group" aria-label="平面図の縮尺">
            <button type="button" aria-label="縮小" title="縮小（ホイールでも変えられます）" onClick={() => mapZoom.zoomBy(1 / 1.5)}>−</button>
            <button type="button" aria-label="拡大" title="拡大（ホイールでも変えられます）" onClick={() => mapZoom.zoomBy(1.5)}>＋</button>
            {/* 自動: 置いた物（大きな床のとき）か舞台の全体が収まる縮尺。拡大や移動をしていなければ押した状態で出す */}
            <button type="button" className={autoView ? 'active' : ''} aria-pressed={autoView}
              title="置いた物が収まるように、縮尺を自動で合わせます。何も無い所をドラッグすると、図を動かせます"
              onClick={() => { setShowWholeStage(false); mapZoom.reset() }}>自動</button>
            {stageLarge && <button type="button" className={showWholeStage ? 'active' : ''} aria-pressed={showWholeStage}
              onClick={() => { setShowWholeStage(true); mapZoom.reset() }}>舞台全体</button>}
          </div>
          <div className="plan-style-switch" role="group" aria-label="平面図の見た目">
            <button type="button" aria-pressed={planStyle === 'light'} onClick={() => setPlanStyle('light')}
              title="3D と同じ暗い舞台に、明かりの当たる所を色の輪で描きます">明かり</button>
            <button type="button" aria-pressed={planStyle === 'plot'} onClick={() => setPlanStyle('plot')}
              title="紙と墨の線の仕込み図。画像で保存して配れます">仕込み図</button>
          </div>
          <button type="button" className="plan-save-image" onClick={saveDiagram}>画像で保存</button>
          <small>図を左右にスワイプ</small>
        </div>
        <div className="plan-map-scroll" ref={scrollRef}>
          <svg ref={svgRef} xmlns="http://www.w3.org/2000/svg" viewBox={`0 0 ${MAP.svgWidth} ${MAP.svgHeight}`}
            aria-label="舞台の平面図。役者の立ち位置と器具の狙う位置を変更できます"
            style={{ touchAction: 'none' }}
            onPointerDown={event => {
              // 何も無い所をドラッグすると、図を動かす（物の上を押したときは、物の側で止めている）
              if (event.button !== 0 || (event.pointerType === 'touch' && !canPanByTouch)) return
              if ((event.target as Element).closest('[role="button"], [data-menu-kind]')) return
              mapZoom.beginPan(event)
            }}
            onPointerMove={moveDrag} onPointerUp={endDrag} onPointerCancel={endDrag}
            onContextMenu={event => {
              // 右クリック: 物の上ならその物の、何も無い所なら「ここに足す」のメニュー（ObjectContextMenu.tsx）
              event.preventDefault()
              const item = (event.target as Element).closest<SVGElement>('[data-menu-kind]')
              const kind = item?.dataset.menuKind as 'fixture' | 'performer' | 'setpiece' | undefined
              const [x, z] = rawMapPoint(event as unknown as PointerEvent<SVGSVGElement>, event.currentTarget, true, mapBounds)
              useObjectMenu.getState().open({ x: event.clientX, y: event.clientY,
                target: kind && item?.dataset.menuId ? { kind, id: item.dataset.menuId } : null,
                point: kind ? undefined : [round1(x), 0, round1(z)], from: 'plan' })
            }}>
            <defs>
              {Object.entries(pathColors).map(([kind, color]) => <marker key={kind}
                id={'plan-arrow-' + kind} markerWidth="10" markerHeight="10"
                refX="8" refY="5" orient="auto" markerUnits="strokeWidth">
                <path d="M 1 1 L 9 5 L 1 9 z" fill={color} />
              </marker>)}
              <marker id="plan-arrow-light" markerWidth="10" markerHeight="10"
                refX="8" refY="5" orient="auto" markerUnits="strokeWidth">
                <path d="M 1 1 L 9 5 L 1 9 z" fill="#5b88a0" />
              </marker>
              <pattern id="plan-hatch" width="7" height="7" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
                <line x1="0" y1="0" x2="0" y2="7" stroke="#1d1d1f" strokeWidth="1" />
              </pattern>
              <pattern id="plan-grid" width="20" height="20" patternUnits="userSpaceOnUse">
                <path d="M20 0H0V20" fill="none" stroke={T.grid} strokeWidth=".8" />
              </pattern>
              {planStyle === 'light' && fixtures.map(fixture => <radialGradient key={'pool-' + fixture.id} id={'plan-pool-' + fixture.id}>
                <stop offset="0" stopColor={colorToHex(fixture.color)} stopOpacity=".85" />
                <stop offset=".55" stopColor={colorToHex(fixture.color)} stopOpacity=".3" />
                <stop offset="1" stopColor={colorToHex(fixture.color)} stopOpacity="0" />
              </radialGradient>)}
            </defs>
            <rect width={MAP.svgWidth} height={MAP.svgHeight} fill={planStyle === 'plot' ? 'url(#plan-grid)' : T.paper} />
            {planStyle === 'plot' && <rect width={MAP.svgWidth} height={MAP.svgHeight} fill={T.paper} opacity=".55" />}
            {planStyle === 'plot' && <text x="936" y="35" textAnchor="end" fill={T.title} fontSize="13" fontFamily="sans-serif">
              {(plan.projectTitle || plan.title || '').slice(0, 30)}　目盛り 1m</text>}
            <text x="24" y="35" fill={T.title} fontSize="21" fontWeight="700" fontFamily="sans-serif">
              {persistent ? sceneDisplayTitle(plan, scene.id).slice(0, 40)
                : `${sequenceSceneIndex + 1} / ${sequenceScenes.length}　${scene.title.slice(0, 32)}`}
            </text>
            <clipPath id="plan-map-clip"><rect x="8" y={MAP.top} width={MAP.svgWidth - 16} height={MAP.svgHeight - MAP.top - 8} /></clipPath>
            <g clipPath="url(#plan-map-clip)">
            {/* 全シーン共通の物（奥行の目盛り、舞台、壁・バトン、客席）は下絵として描き、触れない（「舞台・仕込みを動かす」で動かす） */}
            {(() => {
              const step = gridStep(MAP.height / (mapBounds.front - mapBounds.rear))
              const first = Math.ceil(mapBounds.rear / step)
              return Array.from({ length: 60 }, (_, index) => (first + index) * step).filter(z => z <= mapBounds.front)
                .map(z => <g key={'grid-' + z} pointerEvents="none">
                  <line x1="12" x2="948" y1={mapY(z)} y2={mapY(z)} stroke={T.grid} strokeDasharray="5 9" />
                  <text x="15" y={mapY(z) - 5} fill={T.gridText} fontSize="12">z {z}m</text>
                </g>)
            })()}
            <polygon points={stageOutline.map(([x, z]) => `${mapX(x)},${stageMapY(z)}`).join(' ')}
              fill={T.stageFill} stroke={selection.kind === 'stage' ? '#f2c27b' : T.stageStroke} strokeWidth={T.stageWidth * (selection.kind === 'stage' ? 2 : 1)}
              role="button" tabIndex={0} aria-label="舞台（全シーン共通）。ドラッグで移動" data-menu-kind="stage" data-menu-id="stage"
              style={{ cursor: tool === 'translate' ? 'grab' : 'pointer', touchAction: 'none' }}
              onPointerDown={event => {
                select('stage', 'stage')
                const from = venue.stageOffset ?? [0, 0]
                dragShared(event, '舞台', (dx, dz) => useStore.getState().moveStageTo([round1(from[0] + dx), round1(from[1] + dz)]), { kind: 'stage', id: 'stage' })
              }} />
            {/* 自由形状の舞台を選んでいるときは、角に金色の点を出す。引っぱると形が変わる（固定していても、形はここで変えられる） */}
            {selection.kind === 'stage' && venue.stageShape === 'custom' && stageOutline.map(([vx, vz], index) =>
              <circle key={'stage-vertex-' + index} cx={mapX(vx)} cy={stageMapY(vz)} r={Math.max(10, 10 * unitsPerPx)}
                fill="#e0b45c" stroke="#14110d" strokeWidth={2 * unitsPerPx} style={{ cursor: 'move', touchAction: 'none' }}
                role="button" aria-label={`舞台の角 ${index + 1}。引っぱると形が変わります`} data-stage-vertex={index}
                onPointerDown={event => dragVertex(event, index)} />)}
            {showShared && <StagePartsLayer selectedId={selection.kind === 'stagepart' ? selection.id : null}
              onSelect={id => select(id ? 'stagepart' : null, id)} tool={tool} onPan={mapZoom.beginPan}
              toWorld={point => rawMapPoint(point as unknown as PointerEvent<SVGSVGElement>, svgRef.current!, true, mapBounds)}
              mapX={mapX} mapY={mapY} unitsPerPx={unitsPerPx} showLabels={showLabels} partNames={venueNamesOnPlan} labelLeft={12} handlesWhenSelected theme={planStyle} />}
            {showShared && audienceBlocks.map(block => {
              const seat = Math.max(3, MAP.width / (mapBounds.right - mapBounds.left) * .5)
              const active = selection.kind === 'audience' && selection.id === block.id
              return <g key={block.id} opacity={active ? .9 : .55} role="button" tabIndex={0} data-menu-kind="audience" data-menu-id={block.id}
                aria-label={`${block.name}（全シーン共通）。ドラッグで移動`} style={{ cursor: tool === 'translate' ? 'grab' : 'pointer', touchAction: 'none' }}
                onPointerDown={event => {
                  select('audience', block.id)
                  const from = block.position
                  dragShared(event, block.name || '客席', (dx, dz) => {
                    const current = useStore.getState().productionPlan.audienceBlocks?.find(item => item.id === block.id)
                    if (current) useStore.getState().updateAudienceBlock(block.id, { position: clampAudiencePosition(current, round1(from[0] + dx), round1(from[1] + dz)) })
                  }, { kind: 'audience', id: block.id })
                }}>
                {audienceSeatPositions(block).map(([x, z], index) => <rect key={index}
                  x={mapX(x) - seat / 2} y={mapY(z) - seat * .45} width={seat} height={seat * .9} rx="2"
                  transform={`rotate(${-block.rotationDeg} ${mapX(x)} ${mapY(z)})`} fill={T.seat} stroke={T.seatStroke} strokeWidth=".8" />)}
              </g>
            })}
            {/* 明かりの輪（明かりの地図だけ）。器具の開きと距離から、床に当たる大きさを目安で出す */}
            {planStyle === 'light' && showFixtures && <g style={{ mixBlendMode: 'screen' }} pointerEvents="none">
              {fixtures.filter(fixture => fixture.enabled && fixture.intensity > 0).map(fixture => {
                const distance = Math.hypot(fixture.target[0] - fixture.position[0], fixture.target[1] - fixture.position[1], fixture.target[2] - fixture.position[2])
                const meters = Math.max(.6, distance * Math.tan((fixture.beamAngleDeg || 30) * Math.PI / 360))
                const radius = meters * MAP.width / (mapBounds.right - mapBounds.left)
                return <ellipse key={'pool-' + fixture.id} cx={mapX(fixture.target[0])} cy={mapY(fixture.target[2])}
                  rx={radius} ry={radius * .85} fill={`url(#plan-pool-${fixture.id})`} opacity={Math.min(1, .35 + fixture.intensity * .6)} />
              })}
            </g>}
            {showSetPieces && setPieces.map((piece, index) => {
              const active = selectedSetPiece?.id === piece.id
              const width = Math.max(28, (piece.size?.[0] ?? 1) * Math.abs(piece.scale) * MAP.width / (mapBounds.right - mapBounds.left))
              const depth = Math.max(24, (piece.size?.[2] ?? 1) * Math.abs(piece.scale) * MAP.height / (mapBounds.front - mapBounds.rear))
              const duplicates = setPieces.filter(item => item.name === piece.name)
              const order = setPieces.slice(0, index + 1).filter(item => item.name === piece.name).length
              const name = (piece.name.trim() || '名称未設定') + (duplicates.length > 1 ? ` ${order}` : '')
              const x = mapX(piece.position[0])
              const y = mapY(piece.position[2])
              return <g key={piece.id} transform={`translate(${x} ${y})`}
                role="button" tabIndex={0} aria-label={`${name}を選択・移動`} data-menu-kind="setpiece" data-menu-id={piece.id}
                style={{ cursor: 'grab', touchAction: 'none' }}
                onPointerDown={event => beginDrag(event, 'setpiece', piece.id, [piece.position[0], piece.position[2]])}
                onKeyDown={event => {
                  const delta = event.key === 'ArrowLeft' ? [-.5, 0] : event.key === 'ArrowRight' ? [.5, 0]
                    : event.key === 'ArrowUp' ? [0, -.5] : event.key === 'ArrowDown' ? [0, .5] : null
                  if (event.key === 'Enter' || event.key === ' ') {
                    event.preventDefault()
                    selectSetPiece(piece.id)
                    return
                  }
                  if (!delta) return
                  event.preventDefault()
                  selectSetPiece(piece.id)
                  setLastMove({ kind: 'setpiece', id: piece.id, sceneId: scene.id, from: [piece.position[0], piece.position[2]] })
                  updateSetPiece(piece.id, { position: [
                    clamp(piece.position[0] + delta[0], mapBounds.left + .5, mapBounds.right - .5), piece.position[1],
                    clamp(piece.position[2] + delta[1], mapBounds.rear + .5, mapBounds.front - .2),
                  ] })
                }}>
                {piece.kind === 'gltf' && <title>3D モデルの平面上の大きさは目安です</title>}
                <rect x={-width / 2} y={-depth / 2} width={width} height={depth}
                  transform={`rotate(${-piece.rotation[1] * 180 / Math.PI})`}
                  fill={planStyle === 'plot' ? 'url(#plan-hatch)' : piece.color ?? '#8d795e'} fillOpacity={planStyle === 'plot' ? 1 : active ? .8 : .6}
                  stroke={active ? T.setActive : T.setStroke} strokeWidth={active ? 3 : 1.4}
                  strokeDasharray={piece.kind === 'gltf' ? '6 4' : undefined} />
                {piece.appearance === 'bench' && <line x1={-width * .4} x2={width * .4} y1={-depth * .28} y2={-depth * .28}
                  stroke="#382b22" strokeWidth="5" pointerEvents="none" />}
                {piece.appearance === 'door' && <circle cx={width * .23} cy="0" r="4"
                  fill="#f1d999" pointerEvents="none" />}
                {piece.appearance === 'suitcase' && <path d={`M ${-width * .15} ${-depth * .5} v -7 h ${width * .3} v 7`}
                  fill="none" stroke="#382b22" strokeWidth="3" pointerEvents="none" />}
                {piece.appearance === 'table' && <rect x={-width * .38} y={-depth * .34}
                  width={width * .76} height={depth * .68} rx="3" fill="none"
                  stroke="#382b22" strokeWidth="3" pointerEvents="none" />}
                {piece.appearance === 'bookshelf' && [-.25, 0, .25].map(offset => <line key={offset}
                  x1={-width * .43} x2={width * .43} y1={depth * offset} y2={depth * offset}
                  stroke="#2f2522" strokeWidth="3" pointerEvents="none" />)}
                {piece.appearance === 'window' && <path d={`M 0 ${-depth * .5} V ${depth * .5} M ${-width * .5} 0 H ${width * .5}`}
                  fill="none" stroke="#d7e7ed" strokeWidth="3" pointerEvents="none" />}
              </g>
            })}
            {showDirections && directions.map(direction => <line key={direction.id}
              x1={mapX(direction.from[0])} y1={mapY(direction.from[1])}
              x2={mapX(direction.to[0])} y2={mapY(direction.to[1])}
              stroke={pathColors[direction.kind]}
              strokeWidth={direction.performerId === selectedPerformer?.id ? 6 : 4}
              strokeDasharray={direction.performerId === selectedPerformer?.id ? undefined : '8 5'}
              markerEnd={'url(#plan-arrow-' + direction.kind + ')'} />)}
            {showDirections && directions.filter(direction => direction.kind !== 'entrance').map(direction => <g key={'previous-' + direction.id} pointerEvents="none">
              <circle cx={mapX(direction.from[0])} cy={mapY(direction.from[1])} r="22"
                fill="#fffdf8" fillOpacity=".65" stroke={pathColors[direction.kind]}
                strokeWidth="3" strokeDasharray="5 4" />
              <text x={mapX(direction.from[0])} y={mapY(direction.from[1]) + 5}
                textAnchor="middle" fill="#665b4c" fontSize="13" fontWeight="700">前のシーン</text>
            </g>)}
            {/* 前のシーンからの照明の狙いの変化。「前のシーンからの変化」を出したときだけ（いつも出すとわかりにくい） */}
            {showFixtures && showDirections && targetChanges.map(({ fixture, from }) => <g key={'light-move-' + fixture.id} pointerEvents="none">
              <line x1={mapX(from[0])} y1={mapY(from[2])}
                x2={mapX(fixture.target[0])} y2={mapY(fixture.target[2])}
                stroke="#5b88a0" strokeWidth={fixture.id === selectedFixture?.id ? 5 : 3}
                strokeDasharray="8 6" markerEnd="url(#plan-arrow-light)" />
              {fixture.id === selectedFixture?.id && <text x={mapX(from[0])} y={mapY(from[2]) - 17}
                textAnchor="middle" fill="#42677a" fontSize="14" fontWeight="700"
                paintOrder="stroke" stroke="#fffdf8" strokeWidth="4">前のシーンの狙い</text>}
            </g>)}
            {/* 選んだ照明は最後に描く（隣の印の下に隠れないように） */}
            {showFixtures && fixtures.map((fixture, index) => ({ fixture, index })).filter(({ fixture }) => fixtureShown(fixture))
              .sort((a, b) => Number(a.fixture.id === selectedFixture?.id) - Number(b.fixture.id === selectedFixture?.id))
              .map(({ fixture, index }) => {
              const active = selectedFixture?.id === fixture.id
              const at = fixtureAt(fixture)
              const px = at.x, py = at.y
              const trueX = mapX(fixture.position[0]), trueY = mapY(fixture.position[2])
              const tx = mapX(fixture.target[0]), ty = mapY(fixture.target[2])
              const dragging = activeDrag?.id === fixture.id ? activeDrag.kind : null
              const arrowDelta = (key: string): [number, number] | null => key === 'ArrowLeft' ? [-.5, 0] : key === 'ArrowRight' ? [.5, 0]
                : key === 'ArrowUp' ? [0, -.5] : key === 'ArrowDown' ? [0, .5] : null
              return <g key={fixture.id} opacity={fixture.enabled ? 1 : .45}>
                {/* 狙いへの線と狙いの印は、選んだ照明だけに出す（照明が多いと線で埋まって操作できなかった。2026-11-17） */}
                {active && <line x1={px} y1={py} x2={tx} y2={ty}
                  stroke={active ? T.labelActive : planStyle === 'light' ? colorToHex(fixture.color) : T.aim}
                  strokeOpacity={active ? 1 : planStyle === 'light' ? .45 : 1} strokeWidth={active ? 3 : 1.2}
                  strokeDasharray={active || planStyle === 'light' ? undefined : '4 4'} pointerEvents="none" />}
                {active && <circle cx={tx} cy={ty} r={10}
                  fill="none" stroke={T.labelActive} strokeWidth={3} pointerEvents="none" />}
                <g role="button" tabIndex={0} aria-label={fixture.name + 'の吊る位置を動かす（全シーン共通。向きはそのまま）'} data-menu-kind="fixture" data-menu-id={fixture.id}
                  style={{ cursor: 'grab', touchAction: 'none' }}
                  onPointerDown={event => beginDrag(event, 'fixture', fixture.id, [fixture.position[0], fixture.position[2]])}
                  onKeyDown={event => {
                    const delta = arrowDelta(event.key)
                    if (event.key === 'Enter' || event.key === ' ') {
                      event.preventDefault()
                      selectFixture(fixture.id)
                      return
                    }
                    if (!delta) return
                    event.preventDefault()
                    selectFixture(fixture.id)
                    // 位置だけ動かす。狙いも同じだけ動かして向きを保つ（吊る位置は全シーン共通）
                    updateFixture(fixture.id, {
                      position: [
                        clamp(fixture.position[0] + delta[0], mapBounds.left + .5, mapBounds.right - .5), fixture.position[1],
                        clamp(fixture.position[2] + delta[1], mapBounds.rear + .5, THEATRE.maxZ),
                      ],
                      target: [
                        clamp(fixture.target[0] + delta[0], mapBounds.left + .2, mapBounds.right - .2), fixture.target[1],
                        clamp(fixture.target[2] + delta[1], mapBounds.rear + .2, mapBounds.front - .2),
                      ],
                    })
                    clearChange()
                  }}>
                  <title>{fixture.name}{fixture.position[2] > 2 ? `・舞台前から ${(fixture.position[2] - 2).toFixed(1)}m` : ''}</title>
                  <circle cx={px} cy={py} r={at.touch} fill="transparent" />
                  {/* ずらして見せている照明は、本当の吊る位置に点と線を残す */}
                  {(px !== trueX || py !== trueY) && <g pointerEvents="none">
                    <line x1={trueX} y1={trueY} x2={px} y2={py} stroke={T.edge} strokeWidth={1.2 * unitsPerPx} strokeOpacity={.6} />
                    <circle cx={trueX} cy={trueY} r={3 * unitsPerPx} fill={T.edge} />
                  </g>}
                  {/* 照明は、仕込み図と同じく上から見た器具の形。狙いの方を向け、レンズにゲルの色。番号は胴に書く。
                      大きさは画面の上での大きさで決める（平面図を小さく出しても潰れない） */}
                  {(() => {
                    const kind = FIXTURE_PROFILES[fixture.presetKey]?.kind
                    const size = markerSize * at.scale
                    const angle = Math.atan2(ty - py, tx - px) * 180 / Math.PI
                    const body = active ? T.labelActive : T.fixtureBody
                    const edge = dragging === 'fixture' ? '#2f6f8f' : planStyle === 'light' ? colorToHex(fixture.color) : T.edge
                    const edgeWidth = (dragging === 'fixture' ? 3 : 1.6) * size / 26
                    const strip = kind === 'Border' || kind === 'Footlight' || kind === 'Cyc' || kind === 'LED_Bar'
                    return <>
                      {kind === 'MovingHead' ? <g>
                        <circle cx={px} cy={py} r={size * .55} fill={body} stroke={edge} strokeWidth={edgeWidth} />
                        <circle cx={px + Math.cos(angle * Math.PI / 180) * size * .28} cy={py + Math.sin(angle * Math.PI / 180) * size * .28}
                          r={size * .2} fill={colorToHex(fixture.color)} stroke={edge} strokeWidth={edgeWidth * .7} />
                      </g> : strip ? <g transform={`rotate(${angle + 90} ${px} ${py})`}>
                        {/* ボーダー・フット・ホリゾントは横に長い器具。光の出る側にゲルの色 */}
                        <rect x={px - size * .9} y={py - size * .28} width={size * 1.8} height={size * .56} rx={size * .08} fill={body} stroke={edge} strokeWidth={edgeWidth} />
                        <rect x={px - size * .82} y={py + size * .1} width={size * 1.64} height={size * .14} fill={colorToHex(fixture.color)} />
                      </g> : <g transform={`rotate(${angle} ${px} ${py})`}>
                        <rect x={px - size * .62} y={py - size * .36} width={size * 1.05} height={size * .72} rx={size * .12} fill={body} stroke={edge} strokeWidth={edgeWidth} />
                        <path d={`M ${px + size * .43} ${py - size * .42} L ${px + size * .7} ${py - size * .5} L ${px + size * .7} ${py + size * .5} L ${px + size * .43} ${py + size * .42} Z`}
                          fill={colorToHex(fixture.color)} stroke={edge} strokeWidth={edgeWidth} />
                      </g>}
                      <text x={px - (strip || kind === 'MovingHead' ? 0 : Math.cos(angle * Math.PI / 180) * size * .1)}
                        y={py - (strip || kind === 'MovingHead' ? 0 : Math.sin(angle * Math.PI / 180) * size * .1) + size * .17}
                        textAnchor="middle" fill={active ? '#fffdf8' : T.fixtureText} fontSize={size * .46} fontWeight="700" pointerEvents="none">{(typeof fixture.number === 'string' && fixture.number.trim()) || index + 1}</text>
                    </>
                  })()}
                  {dragging === 'fixture' && <text x={clamp(px, 130 * unitsPerPx, MAP.svgWidth - 130 * unitsPerPx)}
                    y={py - at.touch - 6 * unitsPerPx} textAnchor="middle" fill="#2f6f8f"
                    fontSize={Math.max(15, 13 * unitsPerPx)} fontWeight="700" paintOrder="stroke" stroke="#fffdf8"
                    strokeWidth={Math.max(4, 4 * unitsPerPx)} pointerEvents="none">位置を移動中（向きはそのまま）</text>}
                </g>
              </g>
            })}
            {showPerformers && performers.map((performer, index) => {
              if (performer.onStage === false) return null
              const point: StagePoint = [performer.position[0], performer.position[2]]
              const active = performer.id === selectedPerformer?.id
              const x = mapX(point[0])
              // 向き（シーンごと）。円の外に小さな三角で顔の向きを出す。z が大きいほど図の下（客席側）
              const facing = Number.isFinite(performer.facingDeg) ? (performer.facingDeg as number) * Math.PI / 180 : 0
              const fx = Math.sin(facing), fy = Math.cos(facing)
              const cy0 = mapY(point[1]), r0 = markerSize * .62
              const tip: [number, number] = [x + fx * r0 * 1.55, cy0 + fy * r0 * 1.55]
              const side = (sign: number): [number, number] => [x + fx * r0 * .95 - fy * sign * r0 * .5, cy0 + fy * r0 * .95 + fx * sign * r0 * .5]
              return <g key={performer.id}>
                <polygon points={[tip, side(1), side(-1)].map(p => p.join(',')).join(' ')}
                  fill={active ? T.labelActive : T.actorStroke} pointerEvents="none" />
                <circle cx={x} cy={mapY(point[1])} r={markerSize * .62}
                  fill={planStyle === 'plot' ? '#ffffff' : actorColors[index % actorColors.length]} stroke={active ? T.labelActive : T.actorStroke}
                  strokeWidth={active ? 6 : 4} style={{ cursor: 'grab', touchAction: 'none' }}
                  role="button" tabIndex={0} aria-label={performer.name + 'の立ち位置を移動'} data-menu-kind="performer" data-menu-id={performer.id}
                  onPointerDown={event => beginDrag(event, 'performer', performer.id, point)}
                  onKeyDown={event => {
                    const delta = event.key === 'ArrowLeft' ? [-.5, 0] : event.key === 'ArrowRight' ? [.5, 0]
                      : event.key === 'ArrowUp' ? [0, -.5] : event.key === 'ArrowDown' ? [0, .5] : null
                    if (!delta) return
                    event.preventDefault()
                    selectActor(performer.id)
                    setLastMove({ kind: 'performer', id: performer.id, sceneId: scene.id, from: point })
                    updatePerformer(performer.id, { position: [
                      Math.round(clamp(point[0] + delta[0], -9.2, 9.2) * 10) / 10,
                      performer.position[1],
                      Math.round(clamp(point[1] + delta[1], mapBounds.rear + .2, mapBounds.front - .2) * 10) / 10,
                    ] })
                  }} />
                <text x={x} y={mapY(point[1]) + markerSize * .22} textAnchor="middle"
                  fill={T.actorText} fontSize={markerSize * .6} fontWeight="700" pointerEvents="none">{performer.name.trim().slice(0, 1) || index + 1}</text>
              </g>
            })}
            {/* 名前。重なる所には出さない（選んでいる物の名前だけは必ず出す）。「名前」の切り替えで隠せる */}
            {(() => {
              type Box = { key: string; x0: number; y0: number; x1: number; y1: number }
              const hit = (a: Box, b: Box) => a.key !== b.key && a.x0 < b.x1 && a.x1 > b.x0 && a.y0 < b.y1 && a.y1 > b.y0
              const obstacles: Box[] = []
              const items: Array<{ key: string; x: number; y: number; r: number; text: string; active: boolean; rank: number; own?: boolean }> = []
              const short = (text: string, max: number) => text.length > max ? text.slice(0, max - 1) + '…' : text
              if (showPerformers) performers.forEach(performer => {
                if (performer.onStage === false) return
                const x = mapX(performer.position[0]), y = mapY(performer.position[2])
                const r = markerSize * .64
                obstacles.push({ key: 'p' + performer.id, x0: x - r, y0: y - r, x1: x + r, y1: y + r })
                items.push({ key: 'p' + performer.id, x, y, r, text: short(performer.name, 10), active: performer.id === selectedPerformer?.id, rank: 1 })
              })
              if (showSetPieces) setPieces.forEach((piece, index) => {
                const x = mapX(piece.position[0]), y = mapY(piece.position[2])
                const w = Math.max(28, (piece.size?.[0] ?? 1) * Math.abs(piece.scale) * MAP.width / (mapBounds.right - mapBounds.left))
                const d = Math.max(24, (piece.size?.[2] ?? 1) * Math.abs(piece.scale) * MAP.height / (mapBounds.front - mapBounds.rear))
                const same = setPieces.filter(item => item.name === piece.name)
                const order = setPieces.slice(0, index + 1).filter(item => item.name === piece.name).length
                const name = (piece.name.trim() || '名称未設定') + (same.length > 1 ? ` ${order}` : '')
                items.push({ key: 's' + piece.id, x, y, r: Math.max(w, d) / 2, text: short(name, 12), active: piece.id === selectedSetPiece?.id, rank: 2 })
              })
              if (showFixtures) fixtures.filter(fixtureShown).forEach(fixture => {
                const { x, y, scale } = fixtureAt(fixture)
                const r = markerSize * .75 * scale
                obstacles.push({ key: 'f' + fixture.id, x0: x - r, y0: y - r, x1: x + r, y1: y + r })
                // 器具表に名前を出すときは、図には選んでいる照明の名前だけを書く
                if (!fixtureNamesOnPlan && fixture.id !== selectedFixture?.id) return
                items.push({ key: 'f' + fixture.id, x, y, r, text: short(fixture.name, 10), active: fixture.id === selectedFixture?.id, rank: 3, own: fixtureNamesOnPlan })
              })
              const font = labelFont
              const placed: Box[] = []
              return items.filter(item => showLabels || item.active || item.own).sort((a, b) => Number(b.active) - Number(a.active) || a.rank - b.rank).map(item => {
                const w = item.text.length * font * .98 + 10, h = font * 1.35
                const spots: Array<[number, number]> = [
                  [item.x, item.y + item.r + 4 + h / 2], [item.x, item.y - item.r - 4 - h / 2],
                  [item.x + item.r + 6 + w / 2, item.y], [item.x - item.r - 6 - w / 2, item.y],
                ]
                const boxAt = ([cx, cy]: [number, number]): Box => ({ key: item.key, x0: cx - w / 2, y0: cy - h / 2, x1: cx + w / 2, y1: cy + h / 2 })
                const inside = (box: Box) => box.x0 >= 4 && box.x1 <= MAP.svgWidth - 4 && box.y0 >= 70 && box.y1 <= MAP.svgHeight - 4
                let spot = spots.find(candidate => { const box = boxAt(candidate); return inside(box) && !placed.some(other => hit(box, other)) && !obstacles.some(other => hit(box, other)) })
                if (!spot && item.active) spot = spots.find(candidate => inside(boxAt(candidate))) ?? spots[0]
                if (!spot) return null
                placed.push({ ...boxAt(spot), key: item.key + ':label' })
                return <text key={'label-' + item.key} x={spot[0]} y={spot[1] + font * .36} textAnchor="middle"
                  fill={item.active ? T.labelActive : T.label} fontSize={font} fontWeight={planStyle === 'plot' ? 500 : 700} paintOrder="stroke"
                  stroke={T.halo} strokeWidth={planStyle === 'plot' ? 3 : 4} pointerEvents="none">{item.text}</text>
              })
            })()}
            {/* 回す取っ手。選んだ舞台セット・客席の上に出し、ドラッグで中心のまわりに回す（5° ごと） */}
            {(() => {
              const handle = (key: string, cx: number, topY: number, label: string, locked: boolean, onDown: (event: PointerEvent<SVGElement>) => void) => {
                const hy = topY - 30 * unitsPerPx
                const r = 11 * unitsPerPx
                return <g key={key} role="button" tabIndex={-1} aria-label={label} style={{ cursor: 'grab', touchAction: 'none' }}
                  onPointerDown={event => { if (locked) { event.stopPropagation(); nudgeLock(); return } onDown(event) }}>
                  <line x1={cx} y1={topY} x2={cx} y2={hy + r} stroke={T.setActive} strokeWidth={1.5 * unitsPerPx} pointerEvents="none" />
                  <circle cx={cx} cy={hy} r={22 * unitsPerPx} fill="transparent" />
                  <circle cx={cx} cy={hy} r={r} fill="#fffdf8" stroke={T.setActive} strokeWidth={2 * unitsPerPx} />
                  <text x={cx} y={hy + 5 * unitsPerPx} textAnchor="middle" fontSize={15 * unitsPerPx} fontWeight="700" fill={T.setActive} pointerEvents="none">↻</text>
                </g>
              }
              const out: JSX.Element[] = []
              if (showSetPieces && selectedSetPiece) {
                const piece = selectedSetPiece
                const cx = mapX(piece.position[0]), cy = mapY(piece.position[2])
                const w = Math.max(28, (piece.size?.[0] ?? 1) * Math.abs(piece.scale) * MAP.width / (mapBounds.right - mapBounds.left))
                const d = Math.max(24, (piece.size?.[2] ?? 1) * Math.abs(piece.scale) * MAP.height / (mapBounds.front - mapBounds.rear))
                out.push(handle('rot-set', cx, cy - Math.hypot(w, d) / 2, `${piece.name || '舞台セット'}を回す`, lockedNow('setpiece', piece.id), event => {
                  const from = piece.rotation
                  dragRotate(event, [piece.position[0], piece.position[2]], piece.name || '舞台セット',
                    deg => updateSetPiece(piece.id, { rotation: [from[0], from[1] - deg * Math.PI / 180, from[2]] }))
                }))
              }
              // 役者も、選ぶと上に回す取っ手を出す（2026-11-19 オーナー「役者が回転できない」）。向き（facingDeg）はシーンごと
              if (showPerformers && selectedPerformer && selectedPerformer.onStage !== false) {
                const performer = selectedPerformer
                const cx = mapX(performer.position[0]), cy = mapY(performer.position[2])
                out.push(handle('rot-actor', cx, cy - markerSize * .62 * 1.6, `${performer.name || '役者'}の向きを変える`, lockedNow('performer', performer.id), event => {
                  const from = Number.isFinite(performer.facingDeg) ? performer.facingDeg as number : 0
                  // 図で時計回りに回すと、facingDeg は減る（向きの三角は (sin, cos) で描いている）
                  dragRotate(event, [performer.position[0], performer.position[2]], performer.name || '役者',
                    deg => updatePerformer(performer.id, { facingDeg: ((from - deg + 540) % 360) - 180 }))
                }))
              }
              const block = showShared && selection.kind === 'audience' ? audienceBlocks.find(item => item.id === selection.id) : undefined
              if (block) {
                const seats = audienceSeatPositions(block)
                const top = seats.length ? Math.min(...seats.map(([, z]) => mapY(z))) - 8 * unitsPerPx : mapY(block.position[1])
                out.push(handle('rot-aud', mapX(block.position[0]), top, `${block.name || '客席'}を回す`, lockedNow('audience', block.id), event => {
                  const fromDeg = block.rotationDeg
                  dragRotate(event, block.position, block.name || '客席', deg => useStore.getState().updateAudienceBlock(block.id, { rotationDeg: fromDeg - deg }))
                }))
              }
              return out
            })()}
            {/* 選んだ照明の「向き」のつまみ。役者やほかの器具の下に隠れないよう最後に描く */}
            {showFixtures && selectedFixture && (() => {
              const fixture = selectedFixture
              const tx = mapX(fixture.target[0]), ty = mapY(fixture.target[2])
              const touchRadius = TOUCH_RADIUS_PX * unitsPerPx
              const dragging = activeDrag?.id === fixture.id ? activeDrag.kind : null
              const arrowDelta = (key: string): [number, number] | null => key === 'ArrowLeft' ? [-.5, 0] : key === 'ArrowRight' ? [.5, 0]
                : key === 'ArrowUp' ? [0, -.5] : key === 'ArrowDown' ? [0, .5] : null
              const moveTarget = (delta: [number, number]) => {
                setLastMove({ kind: 'target', id: fixture.id, sceneId: scene.id, from: [fixture.target[0], fixture.target[2]] })
                updateFixture(fixture.id, { target: [
                  clamp(fixture.target[0] + delta[0], mapBounds.left + .2, mapBounds.right - .2), fixture.target[1],
                  clamp(fixture.target[2] + delta[1], mapBounds.rear + .2, mapBounds.front - .2),
                ] })
              }
              return <g opacity={fixture.enabled ? 1 : .6}>
                <g className="plan-aim-handle" role="button" tabIndex={0} data-menu-kind="fixture" data-menu-id={fixture.id}
                  aria-label={fixture.name + 'の向きを変える（位置はそのまま）'}
                  style={{ cursor: 'grab', touchAction: 'none' }}
                  onPointerDown={event => beginDrag(event, 'target', fixture.id, [fixture.target[0], fixture.target[2]])}
                  onKeyDown={event => {
                    const delta = arrowDelta(event.key)
                    if (!delta) return
                    event.preventDefault()
                    moveTarget(delta)
                  }}>
                  {/* 指で押さえやすい大きさの、見えない当たり判定 */}
                  <circle cx={tx} cy={ty} r={Math.max(30, touchRadius)} fill="transparent" />
                  <circle cx={tx} cy={ty} r={Math.max(23, (dragging === 'target' ? 17 : 14) * unitsPerPx)} fill="#fffdf8" fillOpacity=".35"
                    stroke="#2f6f8f" strokeWidth={Math.max(4, (dragging === 'target' ? 4 : 3) * unitsPerPx)}
                    strokeDasharray={dragging === 'target' ? undefined : `${6 * unitsPerPx} ${4 * unitsPerPx}`} />
                  <text x={clamp(tx, 130 * unitsPerPx, MAP.svgWidth - 130 * unitsPerPx)} y={ty - Math.max(30, touchRadius) - 6 * unitsPerPx}
                    textAnchor="middle" fill="#2f6f8f" fontSize={Math.max(15, 13 * unitsPerPx)} fontWeight="700"
                    paintOrder="stroke" stroke="#fffdf8" strokeWidth={Math.max(4, 4 * unitsPerPx)} pointerEvents="none">
                    {dragging === 'target' ? '向きを変更中（位置はそのまま）' : '向き'}</text>
                </g>
              </g>
            })()}
            </g>
            {/* 器具表。図には番号だけを描き、名前はここに並べる（画像で保存にも入る）。押すとその照明を選ぶ */}
            {keyFixtures.length > 0 && MAP.keyX !== undefined && MAP.keyY !== undefined && (() => {
              const columns = MAP.keyColumns ?? 1
              const k = MAP.keyScale ?? 1
              const columnWidth = columns === 1 ? KEY_WIDTH - 20 : MAP.width / columns
              const rows = Math.ceil(keyFixtures.length / columns)
              return <g className="plan-fixture-key">
                <rect x={MAP.keyX - 12} y={MAP.keyY - 40 * k} width={columns === 1 ? KEY_WIDTH - 8 : MAP.width + 24} height={(rows * KEY_ROW + 52) * k}
                  rx="6" fill={T.paper} fillOpacity=".94" stroke={T.title} strokeOpacity=".18" />
                <text x={MAP.keyX} y={MAP.keyY - 14 * k} fill={T.title} fontSize={16 * k} fontWeight="700" fontFamily="sans-serif">器具表</text>
                {keyFixtures.map(({ fixture, number }, order) => {
                  const column = Math.floor(order / rows), row = order % rows
                  const x = MAP.keyX! + column * columnWidth, y = MAP.keyY! + row * KEY_ROW * k
                  const active = selectedFixture?.id === fixture.id
                  return <g key={fixture.id} role="button" tabIndex={0} aria-label={`${number} ${fixture.name}を選ぶ`} style={{ cursor: 'pointer' }}
                    opacity={fixture.enabled ? 1 : .45}
                    onClick={() => select('fixture', fixture.id, 'position')}
                    onKeyDown={event => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); select('fixture', fixture.id, 'position') } }}>
                    <rect x={x} y={y} width={36 * k} height={24 * k} rx={4 * k} fill={active ? '#b8432f' : '#4b443e'} stroke={T.title} strokeOpacity=".35" />
                    <text x={x + 18 * k} y={y + 17 * k} textAnchor="middle" fill="#fffdf8" fontSize={14 * k} fontWeight="700" fontFamily="sans-serif">{number}</text>
                    <text x={x + 46 * k} y={y + 17 * k} fill={T.title} fontSize={15 * k} fontWeight={active ? 700 : 500} fontFamily="sans-serif">
                      {fixture.name.length > (k > 1 ? 9 : 14) ? fixture.name.slice(0, k > 1 ? 8 : 13) + '…' : fixture.name}{fixture.enabled ? '' : '（消灯）'}</text>
                  </g>
                })}
              </g>
            })()}
          </svg>
        </div>
        </>
        {/* 図の印の見方と、どれが全シーン共通か（2026-11-17 オーナー指摘で、いまの作りに合わせた） */}
        <div className="plan-scope-legend" aria-label="図の見方">
          <span><svg viewBox="0 0 30 20" aria-hidden="true" className="legend-fixture"><rect x="2" y="4" width="17" height="12" rx="2" fill="#4b443e" stroke="#d8cfc3" /><path d="M19 3 L27 1 L27 19 L19 17 Z" fill="#e6c27a" stroke="#d8cfc3" /><text x="10.5" y="13.5" textAnchor="middle" fontSize="8" fontWeight="700" fill="#fffdf8">1</text></svg>照明</span>
          <span><i className="actor" aria-hidden="true">司</i>役者</span>
          <span><Glyph name="box" />舞台セット</span>
          <span><Glyph name="batten" />壁・バトン</span>
          <span className="plan-scope-note">全シーン共通：舞台・壁・バトン・客席・照明の吊る位置</span>
          <span className="plan-scope-note">ほかはシーンごと（ほかのシーンにコピーできます）</span>
        </div>
        {/* 役者の「舞台から外す」の札はやめた（設定の欄の「このシーンで舞台上にいる」と、一覧から選べる。2026-11-17 オーナー指摘） */}
      </div>
      {!persistent && <div className="plan-fields">
        {(selectedPerformer || selectedFixture || selectedSetPiece) && <div className="plan-selected-object">
          <span>選択中：{selectedName || '名称未設定'}</span>
          {selectedPath && <small>{placeName(selectedPath.from)} → {placeName(selectedPath.to)}</small>}
          {selectedPerformer && <label className="plan-actor-presence">
            <input type="checkbox" checked={selectedPerformer.onStage !== false}
              onChange={event => updatePerformer(selectedPerformer.id, { onStage: event.target.checked })} />
            このシーンで舞台上
          </label>}
          {selectedFixture && <div className="plan-light-controls">
            <label className="plan-light-toggle">
              <input type="checkbox" checked={selectedFixture.enabled}
                onChange={event => updateFixture(selectedFixture.id, { enabled: event.target.checked })} />
              このシーンで点灯
            </label>
            <label>明るさ <output>{Math.round(selectedFixture.intensity / 1.5 * 100)}%</output>
              <input type="range" min="0" max="1.5" step="0.01" value={selectedFixture.intensity}
                onChange={event => updateFixture(selectedFixture.id, { intensity: Number(event.target.value) })} />
            </label>
            <label>狙いの左右 <output>{selectedFixture.target[0] < 0 ? '下手' : selectedFixture.target[0] > 0 ? '上手' : '中央'} {Math.abs(selectedFixture.target[0]).toFixed(1)}m</output>
              <input type="range" min="-7.8" max="7.8" step="0.1" value={selectedFixture.target[0]}
                onChange={event => updateFixture(selectedFixture.id, {
                  target: [Number(event.target.value), selectedFixture.target[1], selectedFixture.target[2]],
                })} />
            </label>
            <label className="plan-light-color">光の色
              <input type="color" value={colorToHex(selectedFixture.color)}
                onChange={event => updateFixture(selectedFixture.id, { color: hexToRgb(event.target.value), gelEnabled: true })} />
            </label>
          </div>}
          {selectedSetPiece?.kind === 'gltf' && <small>3D モデルの平面上の大きさは目安です</small>}
          {selectedSetPiece && <label className="plan-object-name">装置の名前
            <input value={selectedSetPiece.name} maxLength={60} placeholder="例：中央の扉"
              onChange={event => updateSetPiece(selectedSetPiece.id, { name: event.target.value })} />
          </label>}
          <button onClick={() => {
            onClose()
            updateSettings({ panelOpen: true })
          }}>詳細を編集</button>
        </div>}
        <label>シーン名<input value={scene.title} maxLength={60} placeholder="例：A 登場後"
          onChange={event => updateScene(scene.id, { title: event.target.value })} /></label>
        <small className="plan-field-hint">次のシーンには、今の役者・照明・装置をコピーします。</small>
        <label>切り替えのきっかけ<input value={scene.trigger} maxLength={160} placeholder="例：台詞『行こう』で登場"
          onChange={event => updateScene(scene.id, { trigger: event.target.value })} /></label>
        <details><summary>メモを追加</summary>
          <textarea value={scene.note} maxLength={1000} rows={3} placeholder="演出や明かりの意図、確認事項"
            onChange={event => updateScene(scene.id, { note: event.target.value })} />
        </details>
        <div className="plan-field-actions">
          <button className="plan-add-actor" onClick={() => addPerformer()}
            disabled={performers.length >= LIMITS.performers}>＋ 役者を追加</button>
          <button onClick={undoMove} disabled={!lastMove}>移動を戻す</button>
          {plan.scenes.length > 1 && <button onClick={async () => {
            if (await askConfirm('このシーンを削除しますか？')) {
              removeScene(scene.id)
              setLastMove(null)
            }
          }}>シーンを削除</button>}
        </div>
      </div>}
    </div>
    </div>
  </section>
}

const MAP_HEIGHT_KEY = 'tomoshibi.planMapHeight'
/** PC の 3D と平面図の境目。ドラッグで平面図の高さを変え、ダブルクリックで大きく／元に戻す。高さは覚えておく */
function PlanResizeHandle() {
  const shell = () => document.querySelector<HTMLElement>('.unified-shell')
  const wide = () => window.matchMedia('(min-width: 961px)').matches
  const apply = (height: number | null) => {
    const target = shell()
    if (!target) return
    if (height === null || !wide()) { target.style.removeProperty('--map-height'); return }
    const max = window.innerHeight - 180
    target.style.setProperty('--map-height', `${Math.round(Math.min(max, Math.max(220, height)))}px`)
  }
  const stored = () => { try { const value = Number(localStorage.getItem(MAP_HEIGHT_KEY)); return value > 0 ? value : null } catch { return null } }
  const store = (height: number | null) => { try { if (height === null) localStorage.removeItem(MAP_HEIGHT_KEY); else localStorage.setItem(MAP_HEIGHT_KEY, String(Math.round(height))) } catch { /* 保存できなくても使える */ } }
  useEffect(() => {
    apply(stored())
    const onResize = () => apply(stored())
    window.addEventListener('resize', onResize)
    return () => { window.removeEventListener('resize', onResize); shell()?.style.removeProperty('--map-height') }
  }, [])
  const begin = (event: PointerEvent<HTMLDivElement>) => {
    event.preventDefault()
    const move = (next: globalThis.PointerEvent) => { const height = window.innerHeight - next.clientY; apply(height); store(height) }
    const up = () => { window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', up) }
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', up)
  }
  const toggle = () => {
    const large = window.innerHeight * .72
    const current = stored()
    const next = current && current > window.innerHeight * .6 ? null : large
    store(next); apply(next)
  }
  return <div className="plan-resize-handle" role="separator" aria-orientation="horizontal" aria-label="平面図の高さ。ドラッグで変える。ダブルクリックで大きく・元に戻す"
    title="ドラッグで平面図の高さを変えます。ダブルクリックで大きく・元に戻す" onPointerDown={begin} onDoubleClick={toggle} />
}
