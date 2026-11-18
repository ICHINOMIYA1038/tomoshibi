import { useState, type DragEvent } from 'react'
import { focusSelection, markListPick } from '../scene/focusBus'
import { useObjectMenu } from '../objectMenu'
import { useStore, type SelectionKind } from '../store'
import { DEFAULT_VENUE_LAYOUT } from '../venueLayout'
import { PART_LABELS, resolveStageParts, type StagePart, type StagePartKind } from '../stageParts'
import { canBeParent, hierarchyContext, parentOf, STAGE_ID, type ChildKind } from '../hierarchy'
import { FIXTURE_PROFILES, KIND_LABELS } from '../lighting/fixtureTypes'
import { AddPalette } from './AddPalette'

// 右パネルの上: 舞台にある物をすべて 1 つの一覧（Unity のヒエラルキー）で見せる。
// 親子は字下げで見せ、行をドラッグして別の行に落とすと親を変えられる。

type Node = {
  kind: Exclude<SelectionKind, null>
  id: string
  label: string
  detail?: string
  swatch?: string
  enabled?: boolean
  /** 舞台の部品の種類（印を選ぶため） */
  part?: StagePartKind
  children: Node[]
}

/** 行の頭に付ける印。種類ごとに形を変え、色のある物（照明・役者・セット）はその色で描く */
function KindIcon({ node }: { node: Node }) {
  const color = node.swatch ?? 'currentColor'
  const shape = (() => {
    switch (node.kind) {
      case 'stage': return <path d="M2 11 5 4h6l3 7Z" fill="none" stroke={color} strokeWidth="1.4" strokeLinejoin="round" />
      case 'stagepart':
        if (node.part === 'batten') return <path d="M2 5h12M4 5v6m4-6v6m4-6v6" stroke={color} strokeWidth="1.4" strokeLinecap="round" />
        if (node.part === 'wall' || node.part === 'wing') return <rect x="5.5" y="2" width="5" height="12" rx="1" fill="none" stroke={color} strokeWidth="1.4" />
        if (node.part === 'cyc') return <path d="M2 12C2 6 5 3 8 3s6 3 6 9" fill="none" stroke={color} strokeWidth="1.4" strokeLinecap="round" />
        return <rect x="2.5" y="4.5" width="11" height="7" rx="1" fill="none" stroke={color} strokeWidth="1.4" />
      case 'setpiece': return <path d="m8 2 6 3v6l-6 3-6-3V5Zm0 6 6-3M8 8 2 5m6 3v6" fill="none" stroke={color} strokeWidth="1.3" strokeLinejoin="round" />
      case 'performer': return <><circle cx="8" cy="4.5" r="2.3" fill={color} /><path d="M3.5 14c.4-3.4 2.1-5 4.5-5s4.1 1.6 4.5 5Z" fill={color} /></>
      case 'fixture': return <><circle cx="8" cy="8" r="3.2" fill={color} /><path d="M8 1.5v1.8m0 9.4v1.8M1.5 8h1.8m9.4 0h1.8M3.4 3.4l1.3 1.3m6.6 6.6 1.3 1.3m0-9.2-1.3 1.3m-6.6 6.6-1.3 1.3" stroke={color} strokeWidth="1.2" strokeLinecap="round" /></>
      case 'audience': return <path d="M2.5 4h3v3h-3Zm4 0h3v3h-3Zm4 0h3v3h-3ZM2.5 9h3v3h-3Zm4 0h3v3h-3Zm4 0h3v3h-3Z" fill={color} />
      default: return null
    }
  })()
  return <svg className="hierarchy-icon" viewBox="0 0 16 16" width="14" height="14" aria-hidden="true">{shape}</svg>
}

export function partName(parts: StagePart[], part: StagePart) {
  return `${PART_LABELS[part.kind]} ${parts.filter(other => other.kind === part.kind).indexOf(part) + 1}`
}

function rgbHex(rgb: [number, number, number]) {
  return '#' + rgb.map(v => Math.round(Math.max(0, Math.min(1, v)) * 255).toString(16).padStart(2, '0')).join('')
}

function useTree(): Node[] {
  const fixtures = useStore(s => s.fixtures)
  const performers = useStore(s => s.performers)
  const setPieces = useStore(s => s.setPieces)
  const layout = useStore(s => s.productionPlan.venueLayout ?? DEFAULT_VENUE_LAYOUT)
  const blocks = useStore(s => s.productionPlan.audienceBlocks ?? [])
  const ctx = hierarchyContext(layout, setPieces)
  const parts = resolveStageParts(layout)
  const childrenOf = (parentId: string | null, depth = 0): Node[] => depth > 32 ? [] : [
    ...setPieces.filter(item => parentOf('setpiece', item, ctx) === parentId).map(item => ({
      kind: 'setpiece' as const, id: item.id, label: item.name || '名称未設定', swatch: item.color ?? '#876040',
      children: childrenOf(item.id, depth + 1),
    })),
    ...performers.filter(item => parentOf('performer', item, ctx) === parentId).map(item => ({
      kind: 'performer' as const, id: item.id, label: item.name, swatch: item.color,
      detail: item.onStage === false ? '舞台外' : undefined, children: [],
    })),
    ...fixtures.filter(item => parentOf('fixture', item, ctx) === parentId).map(item => ({
      kind: 'fixture' as const, id: item.id, label: item.name, swatch: rgbHex(item.color), enabled: item.enabled,
      detail: KIND_LABELS[FIXTURE_PROFILES[item.presetKey]?.kind] ?? '', children: [],
    })),
  ]
  return [
    {
      kind: 'stage', id: STAGE_ID, label: '舞台', detail: `${layout.stageWidth}m × ${layout.stageDepth}m`,
      children: [
        ...parts.map(part => ({
          kind: 'stagepart' as const, id: part.id, label: partName(parts, part), part: part.kind,
          detail: part.kind === 'floor' || part.kind === 'platform' ? `${part.width}m × ${part.depth}m` : `${part.width}m`,
          children: childrenOf(part.id),
        })),
        ...childrenOf(STAGE_ID),
      ],
    },
    ...blocks.map(block => ({ kind: 'audience' as const, id: block.id, label: block.name, detail: `${block.rows * block.seatsPerRow}席`, children: [] })),
    ...childrenOf(null),
  ]
}

const CHILD_KINDS = new Set(['fixture', 'performer', 'setpiece'])
const PARENT_KINDS = new Set(['stage', 'stagepart', 'setpiece'])
const DRAG_TYPE = 'application/x-tomoshibi-object'

export function HierarchyPanel() {
  const tree = useTree()
  const selection = useStore(s => s.selection)
  const select = useStore(s => s.select)
  const setParent = useStore(s => s.setParent)
  const updateFixture = useStore(s => s.updateFixture)
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set())
  const [dropTarget, setDropTarget] = useState<string | null>(null)
  const [adding, setAdding] = useState(false)
  // 種類で絞る（2026-11-18 オーナー「照明や舞台が混ざっているので、照明だけ・役者だけで切り替えたい」）。
  // 絞ったときは親子をたどらず、その種類だけを平らに並べる
  const [filter, setFilter] = useState<Filter>('all')
  /** 行をドラッグしている間だけ「親なしにする」置き場を出す */
  const [dragging, setDragging] = useState(false)

  const dragged = (event: DragEvent): { kind: ChildKind; id: string } | null => {
    try { return JSON.parse(event.dataTransfer.getData(DRAG_TYPE)) } catch { return null }
  }
  const accepts = (event: DragEvent, parentId: string | null) => {
    if (!event.dataTransfer.types.includes(DRAG_TYPE)) return false
    if (parentId === null) return true
    // dragover では中身を読めないので、落としたときに canBeParent で確かめる
    return true
  }
  const drop = (event: DragEvent, parentId: string | null) => {
    event.preventDefault()
    setDropTarget(null)
    setDragging(false)
    const item = dragged(event)
    if (!item || item.id === parentId) return
    const s = useStore.getState()
    const ctx = hierarchyContext(s.productionPlan.venueLayout, s.setPieces)
    if (parentId !== null && !canBeParent(item.kind, item.id, parentId, ctx)) return
    setParent(item.kind, item.id, parentId)
  }

  const row = (node: Node, depth: number) => {
    const key = `${node.kind}:${node.id}`
    const selected = selection.kind === node.kind && selection.id === node.id
    const open = !collapsed.has(key)
    const canDrop = PARENT_KINDS.has(node.kind)
    return <li key={key} role="treeitem" aria-selected={selected} aria-expanded={node.children.length ? open : undefined}>
      <div className={'hierarchy-row' + (selected ? ' selected' : '') + (dropTarget === key ? ' drop-target' : '')}
        style={{ paddingLeft: 4 + depth * 16 }}
        draggable={CHILD_KINDS.has(node.kind)}
        onDragStart={event => {
          event.dataTransfer.setData(DRAG_TYPE, JSON.stringify({ kind: node.kind, id: node.id }))
          event.dataTransfer.effectAllowed = 'move'
          setDragging(true)
        }}
        onDragEnd={() => { setDragging(false); setDropTarget(null) }}
        onDragOver={event => { if (canDrop && accepts(event, node.id)) { event.preventDefault(); setDropTarget(key) } }}
        onDragLeave={() => setDropTarget(value => value === key ? null : value)}
        onDrop={event => { if (canDrop) drop(event, node.id) }}
        onContextMenu={event => { event.preventDefault(); useObjectMenu.getState().open({ x: event.clientX, y: event.clientY, target: { kind: node.kind, id: node.id } }) }}>
        {node.children.length ? <button type="button" className="hierarchy-toggle" aria-label={open ? 'たたむ' : '開く'}
          onClick={() => setCollapsed(prev => { const next = new Set(prev); if (open) next.add(key); else next.delete(key); return next })}>
          <svg viewBox="0 0 10 10" width="10" height="10" aria-hidden="true" style={{ transform: open ? 'rotate(90deg)' : undefined, transition: 'transform .12s' }}>
            <path d="M3.5 2 7 5 3.5 8" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" /></svg></button> : <span className="hierarchy-toggle" aria-hidden="true" />}
        <button type="button" className="hierarchy-name" onClick={event => {
          // 一覧で選んだら、右の欄はスクロールせず、3D の視点をその物に寄せる（スマホの一覧は PhoneChrome が寄せる）
          const current = useStore.getState().selection
          if (current.kind !== node.kind || current.id !== node.id) markListPick()
          select(node.kind, node.id, node.kind === 'fixture' ? 'position' : undefined)
          if (!event.currentTarget.closest('.phone-list')) requestAnimationFrame(() => focusSelection())
        }}>
          <KindIcon node={node} />
          <strong>{node.label}</strong>
          {node.detail && <small>{node.detail}</small>}
        </button>
        {node.kind === 'fixture' && <button type="button" className={'hierarchy-lamp' + (node.enabled ? ' on' : '')}
          aria-pressed={node.enabled} aria-label={`${node.label}を${node.enabled ? '消灯' : '点灯'}`} title={node.enabled ? '点灯中' : '消灯中'}
          onClick={() => updateFixture(node.id, { enabled: !node.enabled })}>●</button>}
      </div>
      {node.children.length > 0 && open && <ul role="group" className="hierarchy-children" style={{ ['--guide-x' as string]: `${12 + depth * 16}px` }}>{node.children.map(child => row(child, depth + 1))}</ul>}
    </li>
  }

  return <section className="hierarchy-panel" aria-label="舞台にある物">
    <div className="hierarchy-head">
      <h2>ヒエラルキー</h2>
      <button type="button" className={'hierarchy-add-button' + (adding ? ' active' : '')} aria-expanded={adding}
        onClick={() => setAdding(value => !value)}>＋ 追加</button>
    </div>
    {adding && <AddPalette />}
    <div className="hierarchy-filter" role="group" aria-label="種類で絞る">
      {FILTERS.map(([value, label]) => {
        const count = value === 'all' ? null : flatten(tree).filter(node => FILTER_KINDS[value].has(node.kind)).length
        return <button key={value} type="button" aria-pressed={filter === value} className={filter === value ? 'active' : ''}
          onClick={() => setFilter(value)}>{label}{count !== null && <small>{count}</small>}</button>
      })}
    </div>
    <ul className="hierarchy-tree" role="tree" onContextMenu={event => {
      // 行の外（何も無い所）は、足すためのメニュー
      if (event.defaultPrevented) return
      event.preventDefault()
      useObjectMenu.getState().open({ x: event.clientX, y: event.clientY, target: null })
    }}>{filter === 'all'
      ? tree.map(node => row(node, 0))
      : flatten(tree).filter(node => FILTER_KINDS[filter].has(node.kind)).map(node => row({ ...node, children: [] }, 0))}</ul>
    {dragging ? <div className={'hierarchy-root-drop' + (dropTarget === 'root' ? ' drop-target' : '')}
      onDragOver={event => { if (accepts(event, null)) { event.preventDefault(); setDropTarget('root') } }}
      onDragLeave={() => setDropTarget(value => value === 'root' ? null : value)}
      onDrop={event => drop(event, null)}>
      ここに落とすと親なしにする
    </div> : <p className="hierarchy-hint">行を別の行に重ねると、その子オブジェクトになります（親と一緒に動きます）</p>}
  </section>
}

type Filter = 'all' | 'fixture' | 'performer' | 'setpiece' | 'venue'
const FILTERS: Array<[Filter, string]> = [['all', 'すべて'], ['fixture', '照明'], ['performer', '役者'], ['setpiece', 'セット'], ['venue', '舞台・客席']]
const FILTER_KINDS: Record<Exclude<Filter, 'all'>, Set<string>> = {
  fixture: new Set(['fixture']),
  performer: new Set(['performer']),
  setpiece: new Set(['setpiece']),
  venue: new Set(['stage', 'stagepart', 'audience']),
}
/** 木をたどって、すべての行を並べる（親が先） */
function flatten(nodes: Node[]): Node[] {
  return nodes.flatMap(node => [node, ...flatten(node.children)])
}
