import { useRef, type PointerEvent, type KeyboardEvent } from 'react'
import { multiTouch } from './touchCount'
import { lockedNow, nudgeLock } from '../locks'
import { useStore, type StagePoint } from '../store'
import { DEFAULT_VENUE_LAYOUT } from '../venueLayout'
import {
  clampPart, isHungOn, isFlat, PART_LABELS, partCorners, resolveStageParts, snapValue, type StagePart, type StagePartKind,
} from '../stageParts'
/** 仕込み図の見た目で、台（段床）を床と同じ白にすると、上に並べた客席の白い四角が埋もれる。薄い灰色にして段を見分ける（2026-11-19） */
const PLOT_PLATFORM_FILL = '#e2ded5'
export const PART_COLORS: Record<StagePartKind, string> = {
  floor: '#6d625a', platform: '#9b7650', wall: '#1d1a1d', cyc: '#d9dbe4', wing: '#3a2f37', batten: '#7f8fa3',
}

export function useStageParts() {
  const layout = useStore(state => state.productionPlan.venueLayout ?? DEFAULT_VENUE_LAYOUT)
  const updateParts = useStore(state => state.updateStageParts)
  const parts = resolveStageParts(layout)
  const offset: StagePoint = layout.stageOffset ?? [0, 0]
  /** 部品の並びを保存する。保存すると、それ以降はこの並びが正になる（触っていない部品は引き続き舞台に合わせる） */
  const commit = (next: StagePart[], moved?: { before: StagePart; after: StagePart; fixtureIds: string[] }) => updateParts(next, moved)
  /** バトンに吊ってある照明の id。ドラッグでは動かし始めたときの分を使い続ける */
  const hungIds = (batten: StagePart) => useStore.getState().fixtures.filter(fixture => isHungOn(fixture, batten)).map(fixture => fixture.id)
  const change = (id: string, patch: Partial<StagePart>, fixtureIds?: string[]) => {
    const current = resolveStageParts(useStore.getState().productionPlan.venueLayout ?? DEFAULT_VENUE_LAYOUT)
    const before = current.find(item => item.id === id)
    if (!before) return
    const after = clampPart({ ...before, ...patch, edited: true }, offset)
    // バトンを動かしたときは、吊った照明も一緒に動く（store の updateStageParts）
    commit(current.map(item => item.id === id ? after : item), { before, after, fixtureIds: fixtureIds ?? hungIds(before) })
  }
  return { layout, parts, offset, commit, change, hungIds }
}

type Drag = { id: string; handle: 'body' | 'end-a' | 'end-b' | 'left' | 'right' | 'rear' | 'front'; pointerId: number; at: StagePoint; from: StagePart; moved: boolean; fixtureIds: string[] }

/** 平面図の上に部品を描き、選んだ部品には取っ手を出す。座標は世界の座標（舞台の移動を含む） */
export function StagePartsLayer({ selectedId, onSelect, tool = 'translate', toWorld, mapX, mapY, unitsPerPx, onPan, showLabels = true, partNames = true, labelLeft = -Infinity, handlesWhenSelected = false, theme }: {
  showLabels?: boolean
  /** 壁・袖幕・ホリゾントの名前も書くか。false のときは、選んだ物とバトンの番号だけ */
  partNames?: boolean
  /** 図の描ける左端。バトンの番号がこれより左にはみ出すときは、内側に寄せる */
  labelLeft?: number
  /** 選んだ部品に、道具に関係なく大きさの取っ手を出す（平面図。道具の切り替えが無いため） */
  handlesWhenSelected?: boolean
  /** 平面図の見た目。plot は墨の線、light は暗い舞台の上のうすい線。無ければこれまでの色 */
  theme?: 'light' | 'plot'
  selectedId: string | null
  /** 部品を動かさない道具のとき、本体のドラッグで図を動かす（大きな床では、図のほとんどが床になる） */
  onPan?: (event: { pointerId: number; clientX: number; clientY: number }) => void
  onSelect: (id: string | null) => void
  /** 道具（tools.ts）。移動のときだけ本体をドラッグで動かし、拡大のときだけ取っ手を出す */
  tool?: 'select' | 'translate' | 'rotate' | 'scale'
  toWorld: (point: { clientX: number; clientY: number }) => StagePoint
  mapX: (x: number) => number
  mapY: (z: number) => number
  unitsPerPx: number
}) {
  const { parts, offset, change, hungIds } = useStageParts()
  const drag = useRef<Drag | null>(null)
  const toLocal = (event: { clientX: number; clientY: number }): StagePoint => {
    const [x, z] = toWorld(event)
    return [x - offset[0], z - offset[1]]
  }
  const px = (x: number) => mapX(x + offset[0])
  const py = (z: number) => mapY(z + offset[1])
  // 回転の道具では、部品の中心のまわりに回す。図では時計回りが rotationDeg の減る向き。5° ごとに止まる
  const rotate = (event: PointerEvent<SVGElement>, item: StagePart) => {
    const angleOf = (point: { clientX: number; clientY: number }) => { const [x, z] = toLocal(point); return Math.atan2(z - item.z, x - item.x) * 180 / Math.PI }
    const start = angleOf(event)
    const move = (next: globalThis.PointerEvent) => {
      if (next.pointerId !== event.pointerId) return
      if (multiTouch()) { stop(next); return }
      const deg = Math.round((((angleOf(next) - start) + 540) % 360 - 180) / 5) * 5
      change(item.id, { rotationDeg: ((item.rotationDeg - deg) % 360 + 360) % 360 })
    }
    const stop = (up: globalThis.PointerEvent) => {
      if (up.pointerId !== event.pointerId) return
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', stop)
      window.removeEventListener('pointercancel', stop)
    }
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', stop)
    window.addEventListener('pointercancel', stop)
  }
  const begin = (event: PointerEvent<SVGElement>, item: StagePart, handle: Drag['handle']) => {
    if (event.button !== 0) return
    event.preventDefault()
    event.stopPropagation()
    onSelect(item.id)
    // 固定した部品は、ドラッグでは動かさない（図を動かす）。鍵のボタンを光らせて知らせる
    if (lockedNow('stagepart', item.id)) { nudgeLock(); if (handle === 'body' && event.button === 0) onPan?.(event); return }
    if (handle === 'body' && tool === 'rotate') { rotate(event, item); return }
    if (handle === 'body' ? tool !== 'translate' : tool !== 'scale' && !handlesWhenSelected) { if (handle === 'body' && event.button === 0) onPan?.(event); return }
    drag.current = { id: item.id, handle, pointerId: event.pointerId, at: toLocal(event), from: item, moved: false, fixtureIds: hungIds(item) }
    // 動きは window で受ける。押した要素で受けると、選んだときの再描画で要素が入れ替わり、ドラッグが途切れることがある
    // （2026-11-15 の「動かせない」の原因）
    const stop = (up: globalThis.PointerEvent) => {
      if (up.pointerId !== event.pointerId) return
      drag.current = null
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', stop)
      window.removeEventListener('pointercancel', stop)
    }
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', stop)
    window.addEventListener('pointercancel', stop)
  }
  const move = (event: globalThis.PointerEvent) => {
    const current = drag.current
    if (!current || current.pointerId !== event.pointerId) return
    // 2 本目の指が触れたら拡大のつもり。動かすのをやめる
    if (multiTouch()) { drag.current = null; return }
    const fine = event.shiftKey
    const [x, z] = toLocal(event)
    const from = current.from
    // 選ぶために押しただけで「動かした」にならないよう、少し動くまでは変えない
    if (!current.moved && Math.hypot(x - current.at[0], z - current.at[1]) < .15) return
    current.moved = true
    if (current.handle === 'body') {
      change(from.id, { x: snapValue(from.x + x - current.at[0], fine), z: snapValue(from.z + z - current.at[1], fine) }, current.fixtureIds)
      return
    }
    const angle = from.rotationDeg * Math.PI / 180
    // 部品の幅の向き（ローカルの +x）と奥行の向き（ローカルの +z）を、平面図の向きに直したもの
    const ux: StagePoint = [Math.cos(angle), -Math.sin(angle)]
    const uz: StagePoint = [Math.sin(angle), Math.cos(angle)]
    const along = (point: StagePoint, axis: StagePoint) => (point[0] - from.x) * axis[0] + (point[1] - from.z) * axis[1]
    const p: StagePoint = [x, z]
    if (current.handle === 'end-a' || current.handle === 'end-b' || current.handle === 'left' || current.handle === 'right') {
      // 反対側の端を止めたまま、幅（長さ）を変える
      const sign = current.handle === 'end-a' || current.handle === 'left' ? -1 : 1
      const fixed = -sign * from.width / 2
      const width = Math.max(.5, snapValue(Math.abs(along(p, ux) - fixed), fine))
      const centerAlong = fixed + sign * width / 2
      change(from.id, { width, x: from.x + ux[0] * centerAlong, z: from.z + ux[1] * centerAlong })
      return
    }
    const sign = current.handle === 'rear' ? -1 : 1
    const fixed = -sign * from.depth / 2
    const depth = Math.max(.5, snapValue(Math.abs(along(p, uz) - fixed), fine))
    const centerAlong = fixed + sign * depth / 2
    change(from.id, { depth, x: from.x + uz[0] * centerAlong, z: from.z + uz[1] * centerAlong })
  }
  const nudge = (event: KeyboardEvent<SVGElement>, item: StagePart) => {
    const step = event.shiftKey ? .1 : .5
    const delta = event.key === 'ArrowLeft' ? [-step, 0] : event.key === 'ArrowRight' ? [step, 0]
      : event.key === 'ArrowUp' ? [0, -step] : event.key === 'ArrowDown' ? [0, step] : null
    if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); onSelect(item.id); return }
    if (!delta || tool !== 'translate') return
    event.preventDefault()
    onSelect(item.id)
    change(item.id, { x: item.x + delta[0], z: item.z + delta[1] })
  }
  // 指で掴める大きさ（画面で半径 22px 以上）にする
  const hitRadius = 22 * unitsPerPx
  const handlesOf = (item: StagePart): Array<{ handle: Drag['handle']; at: StagePoint; label: string }> => {
    const corners = partCorners(item)
    return isFlat(item.kind) ? (() => {
        const angle = item.rotationDeg * Math.PI / 180
        const ux: StagePoint = [Math.cos(angle), -Math.sin(angle)]
        const uz: StagePoint = [Math.sin(angle), Math.cos(angle)]
        const at = (u: StagePoint, d: number): StagePoint => [item.x + u[0] * d, item.z + u[1] * d]
        return [
          { handle: 'left', at: at(ux, -item.width / 2), label: '幅（左の辺）' },
          { handle: 'right', at: at(ux, item.width / 2), label: '幅（右の辺）' },
          { handle: 'rear', at: at(uz, -item.depth / 2), label: '奥行（奥の辺）' },
          { handle: 'front', at: at(uz, item.depth / 2), label: '奥行（手前の辺）' },
        ]
      })() : [
        { handle: 'end-a', at: corners[0], label: '長さ（片方の端）' },
        { handle: 'end-b', at: corners[1], label: '長さ（もう片方の端）' },
      ]
  }
  // 選んだかどうかで並びを変えない（並びが変わると、押した要素が入れ替わる）。取っ手は最後にまとめて描く
  const selectedPart = parts.find(item => item.id === selectedId) ?? null
  // バトンの番号を書く縦の線。いちばん左の部品（壁など）よりさらに左
  const labelFont = Math.max(11, 11 * unitsPerPx)
  const labelMargin = Math.max(labelLeft + labelFont * 4.4, Math.min(...parts.flatMap(part => partCorners(part).map(([x]) => px(x)))) - 12 * unitsPerPx)
  // バトンの番号の高さ。バトンどうしが近いと文字が重なるので、上から順に、前の文字と近すぎたら下へずらす（2026-11-19）
  const battenLabelY = new Map<string, number>()
  {
    const rows = parts.filter(part => part.kind === 'batten').map(part => { const c = partCorners(part); return { id: part.id, y: (py(c[0][1]) + py(c[1][1])) / 2 } }).sort((a, b) => a.y - b.y)
    let previous = -Infinity
    for (const row of rows) { const y = Math.max(row.y, previous + labelFont * 1.15); battenLabelY.set(row.id, y); previous = y }
  }
  const ordered = [...parts].sort((a, b) => Number(!isFlat(a.kind)) - Number(!isFlat(b.kind)))
  return <g className="stage-parts-layer">
    {ordered.map(item => {
      const corners = partCorners(item)
      const selected = item.id === selectedId
      const common = {
        role: 'button', tabIndex: 0, 'aria-label': `${PART_LABELS[item.kind]}を選んで移動`, 'aria-pressed': selected,
        'data-menu-kind': 'stagepart', 'data-menu-id': item.id,
        style: { cursor: tool === 'translate' ? 'grab' : 'pointer', touchAction: 'none' as const },
        onPointerDown: (event: PointerEvent<SVGElement>) => begin(event, item, 'body'),
        onKeyDown: (event: KeyboardEvent<SVGElement>) => nudge(event, item),
      }
      return <g key={item.id}>
        {isFlat(item.kind)
          ? <polygon {...common} points={corners.map(([x, z]) => `${px(x)},${py(z)}`).join(' ')}
            fill={theme === 'plot' ? (item.kind === 'platform' ? PLOT_PLATFORM_FILL : '#fbfaf6') : item.color ?? PART_COLORS[item.kind]} fillOpacity={theme === 'plot' ? .9 : item.kind === 'floor' ? .55 : .85}
            stroke={selected ? '#f2c27b' : theme === 'plot' ? '#1d1d1f' : '#c9b9a3'} strokeWidth={selected ? 4 : 1.5} strokeDasharray={item.kind === 'floor' ? '6 4' : undefined} />
          : <g {...common}>
            <line x1={px(corners[0][0])} y1={py(corners[0][1])} x2={px(corners[1][0])} y2={py(corners[1][1])}
              stroke="transparent" strokeWidth={hitRadius * 1.4} strokeLinecap="round" />
            <line x1={px(corners[0][0])} y1={py(corners[0][1])} x2={px(corners[1][0])} y2={py(corners[1][1])}
              stroke={selected ? '#f2c27b' : theme === 'plot' ? '#1d1d1f' : theme === 'light' ? (item.kind === 'batten' ? '#7c8791' : '#6d6258') : item.color ?? PART_COLORS[item.kind]}
              strokeWidth={theme === 'plot' ? (item.kind === 'batten' ? 1.6 : 3) : item.kind === 'batten' ? 3 : 6}
              strokeDasharray={item.kind === 'batten' ? '10 5' : undefined} strokeLinecap="round" />
            {/* 名前。バトンは仕込み図のように「1バトン」と、舞台の外の左にそろえて書く。ほかの部品は、partNames か選んだときだけ */}
            {(showLabels || selected) && (item.kind === 'batten' || partNames || selected) && (() => {
              const batten = item.kind === 'batten' && !selected
              const index = parts.filter(other => other.kind === item.kind).indexOf(item) + 1
              const x = batten ? labelMargin : Math.min(px(corners[0][0]), px(corners[1][0])) - 6 * unitsPerPx
              const y = batten ? battenLabelY.get(item.id) ?? (py(corners[0][1]) + py(corners[1][1])) / 2 : (py(corners[0][1]) + py(corners[1][1])) / 2
              return <text x={x} y={y + 4 * unitsPerPx} textAnchor="end" fill={theme === 'light' ? '#a39789' : '#3a332d'}
                fontSize={labelFont} fontWeight="700" paintOrder="stroke" stroke={theme === 'light' ? '#0d0b0e' : '#fffdf8'}
                strokeWidth={3 * unitsPerPx} pointerEvents="none">{item.kind === 'batten' ? `${index}バトン` : `${PART_LABELS[item.kind]} ${index}`}</text>
            })()}
          </g>}
      </g>
    })}
    {selectedPart && (tool === 'scale' || handlesWhenSelected) && handlesOf(selectedPart).map(handle => <g key={handle.handle} role="button"
      aria-label={`${PART_LABELS[selectedPart.kind]}の${handle.label}をドラッグして大きさを変える`}
      style={{ cursor: 'ew-resize', touchAction: 'none' }}
      onPointerDown={event => begin(event, selectedPart, handle.handle)}>
      <circle cx={px(handle.at[0])} cy={py(handle.at[1])} r={hitRadius} fill="transparent" />
      <circle cx={px(handle.at[0])} cy={py(handle.at[1])} r={Math.max(8, hitRadius * .45)} fill="#f2c27b" stroke="#3d2a17" strokeWidth="3" />
    </g>)}
  </g>
}


