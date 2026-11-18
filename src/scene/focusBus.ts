import { useStore } from '../store'
import { DEFAULT_VENUE_LAYOUT } from '../venueLayout'
import { resolveStageParts } from '../stageParts'

// 3D の視点を、ある物に寄せて映すための知らせ（2026-11-18 オーナー「ダブルタップや一覧で選んだ物に、ちょうどよく寄ってほしい」）。
// 受け手は DoubleTapFocus。center は物の真ん中、radius は物の大きさ（半径、m）

export type FocusRequest = { center: [number, number, number]; radius: number }
let listener: ((request: FocusRequest) => void) | null = null

export function onFocusRequest(fn: (request: FocusRequest) => void) {
  listener = fn
  return () => { if (listener === fn) listener = null }
}

export function focusOn(request: FocusRequest) {
  listener?.(request)
}

/** いま選んでいる物に寄せる。物の位置と大きさは、店（store）のデータから求める */
export function focusSelection() {
  const s = useStore.getState()
  const { kind, id } = s.selection
  if (!kind || !id) return
  if (kind === 'fixture') {
    const fixture = s.fixtures.find(item => item.id === id)
    // 灯体だけに寄ると、目の前に機材の箱があるだけで何を見ているかわからなかった。灯体と狙った所を一緒に収める（2026-11-18）
    if (fixture) {
      const [px, py, pz] = fixture.position
      const [tx, ty, tz] = fixture.target
      const half = Math.hypot(tx - px, ty - py, tz - pz) / 2
      focusOn({ center: [(px + tx) / 2, (py + ty) / 2, (pz + tz) / 2], radius: Math.max(1.5, half) })
    }
  } else if (kind === 'performer') {
    const performer = s.performers.find(item => item.id === id)
    if (performer) focusOn({ center: [performer.position[0], performer.position[1] + .9 * performer.scale, performer.position[2]], radius: .9 * performer.scale })
  } else if (kind === 'setpiece') {
    const piece = s.setPieces.find(item => item.id === id)
    if (piece) focusOn({ center: piece.position, radius: Math.max(.5, (piece.size ? Math.hypot(...piece.size) / 2 : .8) * Math.abs(piece.scale)) })
  } else if (kind === 'audience') {
    const block = (s.productionPlan.audienceBlocks ?? []).find(item => item.id === id)
    if (block) focusOn({ center: [block.position[0], (block.elevation ?? 0) + .5, block.position[1]], radius: Math.max(1.5, block.seatsPerRow * block.seatSpacing / 2) })
  } else if (kind === 'stagepart') {
    const layout = s.productionPlan.venueLayout ?? DEFAULT_VENUE_LAYOUT
    const offset = layout.stageOffset ?? [0, 0]
    const part = resolveStageParts(layout).find(item => item.id === id)
    if (part) focusOn({ center: [part.x + offset[0], part.elevation + Math.min(part.height, 3) / 2, part.z + offset[1]], radius: Math.max(1, Math.min(8, Math.max(part.width, part.depth) / 2)) })
  } else if (kind === 'stage') {
    const layout = s.productionPlan.venueLayout ?? DEFAULT_VENUE_LAYOUT
    const offset = layout.stageOffset ?? [0, 0]
    focusOn({ center: [offset[0], 0, offset[1] - 3], radius: Math.max(layout.stageWidth, layout.stageDepth) / 2 })
  }
}

// 一覧（ヒエラルキー）で選んだときは、右の欄を設定の所までスクロールしない（一覧が見えなくなる。2026-11-18 オーナー）。
// 一覧が選ぶ直前に印を付け、ControlPanel のスクロールが一度だけ読む
let pickedFromList = false
export function markListPick() { pickedFromList = true }
export function takeListPick() { const value = pickedFromList; pickedFromList = false; return value }
