import { useRef, type PointerEvent, type KeyboardEvent } from 'react'
import * as THREE from 'three'
import { useStore, type StagePoint } from '../store'
import { DEFAULT_VENUE_LAYOUT } from '../venueLayout'
import {
  clampPart, DEFAULT_CYC_COLOR, distanceToBatten, isHungOn, DEFAULT_WALL_COLOR, FLOOR_FINISHES, isFlat, newPart, PART_LABELS, partCorners,
  resolveStageParts, snapValue, stageTemplateOf, TEMPLATE_LABELS, type StagePart, type StagePartKind, type StageTemplate,
} from '../stageParts'
import { askConfirm } from './askConfirm'

/** 舞台の座標で、舞台の中心の前後位置。数字の欄は、ここからの距離で見せる */
const STAGE_CENTER_Z = -3
const KINDS: StagePartKind[] = ['floor', 'wall', 'cyc', 'batten', 'wing', 'platform']
const PART_COLORS: Record<StagePartKind, string> = {
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
export function StagePartsLayer({ selectedId, onSelect, toWorld, mapX, mapY, unitsPerPx }: {
  selectedId: string | null
  onSelect: (id: string | null) => void
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
  const begin = (event: PointerEvent<SVGElement>, item: StagePart, handle: Drag['handle']) => {
    event.preventDefault()
    event.stopPropagation()
    onSelect(item.id)
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
    if (!delta) return
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
  const ordered = [...parts].sort((a, b) => Number(!isFlat(a.kind)) - Number(!isFlat(b.kind)))
  return <g className="stage-parts-layer">
    {ordered.map(item => {
      const corners = partCorners(item)
      const selected = item.id === selectedId
      const common = {
        role: 'button', tabIndex: 0, 'aria-label': `${PART_LABELS[item.kind]}を選んで移動`, 'aria-pressed': selected,
        style: { cursor: 'grab', touchAction: 'none' as const },
        onPointerDown: (event: PointerEvent<SVGElement>) => begin(event, item, 'body'),
        onKeyDown: (event: KeyboardEvent<SVGElement>) => nudge(event, item),
      }
      return <g key={item.id}>
        {isFlat(item.kind)
          ? <polygon {...common} points={corners.map(([x, z]) => `${px(x)},${py(z)}`).join(' ')}
            fill={PART_COLORS[item.kind]} fillOpacity={item.kind === 'floor' ? .55 : .85}
            stroke={selected ? '#f2c27b' : '#c9b9a3'} strokeWidth={selected ? 4 : 1.5} strokeDasharray={item.kind === 'floor' ? '6 4' : undefined} />
          : <g {...common}>
            <line x1={px(corners[0][0])} y1={py(corners[0][1])} x2={px(corners[1][0])} y2={py(corners[1][1])}
              stroke="transparent" strokeWidth={hitRadius * 1.4} strokeLinecap="round" />
            <line x1={px(corners[0][0])} y1={py(corners[0][1])} x2={px(corners[1][0])} y2={py(corners[1][1])}
              stroke={selected ? '#f2c27b' : PART_COLORS[item.kind]} strokeWidth={item.kind === 'batten' ? 4 : 7}
              strokeDasharray={item.kind === 'batten' ? '10 5' : undefined} strokeLinecap="round" />
          </g>}
      </g>
    })}
    {selectedPart && handlesOf(selectedPart).map(handle => <g key={handle.handle} role="button"
      aria-label={`${PART_LABELS[selectedPart.kind]}の${handle.label}をドラッグして大きさを変える`}
      style={{ cursor: 'ew-resize', touchAction: 'none' }}
      onPointerDown={event => begin(event, selectedPart, handle.handle)}>
      <circle cx={px(handle.at[0])} cy={py(handle.at[1])} r={hitRadius} fill="transparent" />
      <circle cx={px(handle.at[0])} cy={py(handle.at[1])} r={Math.max(8, hitRadius * .45)} fill="#f2c27b" stroke="#3d2a17" strokeWidth="3" />
    </g>)}
  </g>
}

function colorHex(value: string | undefined, fallback: [number, number, number]) {
  return value ?? `#${new THREE.Color(...fallback).getHexString()}`
}

function NumberField({ label, value, min, max, step = .1, unit = 'm', onChange }: {
  label: string; value: number; min: number; max: number; step?: number; unit?: string; onChange: (value: number) => void
}) {
  return <label>{label}
    <input type="number" inputMode="decimal" min={min} max={max} step={step} value={Math.round(value * 100) / 100}
      onChange={event => { const next = Number(event.target.value); if (event.target.value !== '' && Number.isFinite(next)) onChange(next) }} />
    <span>{unit}</span>
  </label>
}

/** 会場の配置の右側に出す、舞台の部品の欄 */
export function StagePartsInspector({ selectedId, onSelect, hint }: { selectedId: string | null; onSelect: (id: string | null) => void; hint?: string }) {
  const { layout, parts, offset, commit, change, hungIds } = useStageParts()
  const updateVenue = useStore(state => state.updateVenueLayout)
  const template = stageTemplateOf(layout)
  const fixtures = useStore(state => state.fixtures)
  const setFixtureBatten = useStore(state => state.setFixtureBatten)
  const selected = parts.find(item => item.id === selectedId) ?? null
  // 一度でも部品を変えると stageParts が保存される
  const touched = Boolean(layout.stageParts)
  const numberOf = (item: StagePart) => parts.filter(other => other.kind === item.kind).indexOf(item) + 1
  const nameOf = (item: StagePart) => `${PART_LABELS[item.kind]} ${numberOf(item)}`
  const add = (kind: StagePartKind) => {
    const id = `part-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`
    commit([...parts, clampPart(newPart(kind, layout, id), offset)])
    onSelect(id)
  }
  const remove = (item: StagePart) => {
    commit(parts.filter(other => other.id !== item.id))
    onSelect(null)
  }
  const resetOne = (item: StagePart) => {
    const next = parts.map(other => other.id === item.id ? { ...other, edited: undefined } : other)
    const after = resolveStageParts({ ...layout, stageParts: next }).find(other => other.id === item.id)
    commit(next, after ? { before: item, after, fixtureIds: hungIds(item) } : undefined)
  }
  const chooseTemplate = async (next: StageTemplate) => {
    if (touched && !await askConfirm('いまの部品の配置を、選んだひな形の配置に置き換えますか？動かした部品や足した部品は元に戻ります。', '置き換える')) return
    updateVenue({ stageTemplate: next, stageParts: undefined })
    onSelect(null)
  }
  const resetAll = async () => {
    if (!await askConfirm('すべての部品を初期配置に戻しますか？足した部品は消えます。', '戻す')) return
    updateVenue({ stageParts: undefined })
    onSelect(null)
  }
  return <>
    <h2>舞台の部品</h2>
    <p>{hint ?? '図の部品を選ぶと取っ手が出ます。本体をドラッグで移動、取っ手で大きさを変えます。0.5m ごとに吸い付き、Shift を押しながらだと 0.1m ごとに動きます。'}</p>
    <div className="stage-parts-add" role="group" aria-label="部品を足す">
      {KINDS.map(kind => <button key={kind} type="button" onClick={() => add(kind)} disabled={parts.length >= 80}>＋ {PART_LABELS[kind]}</button>)}
    </div>
    <div className="audience-editor-block-list stage-parts-list">{parts.map(item => <button key={item.id} type="button"
      className={item.id === selectedId ? 'active' : ''} onClick={() => onSelect(item.id)}>
      <strong>{nameOf(item)}</strong><span>{item.auto && !item.edited ? '初期配置' : item.auto ? '動かした' : '足した'}</span>
    </button>)}
      {!parts.length && <p>部品はありません。「＋」で足すか、下のひな形を選んでください。</p>}
    </div>
    {selected && <div className="stage-part-fields">
      <strong>{nameOf(selected)}</strong>
      <NumberField label="左右（中心から）" value={selected.x} min={-30} max={30} onChange={value => change(selected.id, { x: value })} />
      <NumberField label="前後（中心から・客席側が＋）" value={selected.z - STAGE_CENTER_Z} min={-30} max={40}
        onChange={value => change(selected.id, { z: value + STAGE_CENTER_Z })} />
      <NumberField label={isFlat(selected.kind) ? '幅' : '長さ'} value={selected.width} min={.5} max={48} onChange={value => change(selected.id, { width: value })} />
      {isFlat(selected.kind) && <NumberField label="奥行" value={selected.depth} min={.5} max={56} onChange={value => change(selected.id, { depth: value })} />}
      {selected.kind !== 'floor' && selected.kind !== 'batten' && <NumberField label="高さ" value={selected.height} min={.1} max={20} onChange={value => change(selected.id, { height: value })} />}
      {selected.kind === 'batten' && <NumberField label="吊る高さ" value={selected.elevation} min={1} max={20} onChange={value => change(selected.id, { elevation: value })} />}
      {(selected.kind === 'wall' || selected.kind === 'cyc' || selected.kind === 'wing') &&
        <NumberField label="下端の高さ" value={selected.elevation} min={0} max={10} onChange={value => change(selected.id, { elevation: value })} />}
      <NumberField label="向き" value={selected.rotationDeg} min={-180} max={180} step={5} unit="°" onChange={value => change(selected.id, { rotationDeg: value })} />
      {selected.kind === 'batten' && <div className="stage-batten-fixtures">
        <strong>吊っている照明</strong>
        <p>チェックした照明は、このバトンを動かす・高さを変えると一緒に動きます（全シーン）。向きはそのままです。近い順に並んでいます。</p>
        {fixtures.length ? [...fixtures].sort((a, b) => distanceToBatten(a.position, selected, offset) - distanceToBatten(b.position, selected, offset)).map(fixture => <label key={fixture.id}>
          <input type="checkbox" checked={isHungOn(fixture, selected)}
            onChange={event => setFixtureBatten(fixture.id, event.target.checked ? selected.id : '')} />
          <span>{fixture.name}</span>
          <small>バトンから {distanceToBatten(fixture.position, selected, offset).toFixed(1)}m・高さ {fixture.position[1].toFixed(1)}m</small>
        </label>) : <p>照明がありません。</p>}
      </div>}
      <div className="stage-part-actions">
        <button type="button" onClick={() => change(selected.id, { rotationDeg: selected.rotationDeg + 90 })}>90° 回す</button>
        {selected.auto && selected.edited && <button type="button" onClick={() => resetOne(selected)}>初期配置に戻す</button>}
        <button type="button" className="audience-editor-delete" onClick={() => remove(selected)}>この部品を削除</button>
      </div>
    </div>}
    <h2>ひな形</h2>
    <p>選ぶと、いまの舞台の大きさに合わせて部品を並べ直します。</p>
    <div className="stage-template-options">{TEMPLATE_LABELS.map(item => <button key={item.id} type="button"
      className={template === item.id ? 'active' : ''} aria-pressed={template === item.id} onClick={() => chooseTemplate(item.id)}>
      <strong>{item.label}</strong><span>{item.detail}</span>
    </button>)}</div>
    <button type="button" className="stage-parts-reset" onClick={resetAll} disabled={!touched}>すべて初期配置に戻す</button>
    <h2>床・壁の色</h2>
    <div className="venue-shape-options stage-floor-finishes" role="group" aria-label="床の仕上げ">
      {FLOOR_FINISHES.map(item => <button key={item.id} type="button"
        className={(layout.floorFinish ?? 'black') === item.id ? 'active' : ''} aria-pressed={(layout.floorFinish ?? 'black') === item.id}
        onClick={() => updateVenue({ floorFinish: item.id, floorColor: undefined })}>{item.label}</button>)}
    </div>
    <div className="stage-colors">
      {([
        ['floorColor', '床の色', FLOOR_FINISHES.find(item => item.id === (layout.floorFinish ?? 'black'))!.color],
        ['wallColor', '壁の色', DEFAULT_WALL_COLOR],
        ['cycColor', 'ホリゾントの色', DEFAULT_CYC_COLOR],
      ] as const).map(([key, label, fallback]) => <label key={key}>{label}
        <input type="color" value={colorHex(layout[key], fallback)} onChange={event => updateVenue({ [key]: event.target.value })} />
        <button type="button" onClick={() => updateVenue({ [key]: undefined })} disabled={!layout[key]}>元の色</button>
      </label>)}
    </div>
  </>
}
