import { useState, type DragEvent } from 'react'
import { useStore, type SelectionKind } from '../store'
import { DEFAULT_VENUE_LAYOUT } from '../venueLayout'
import { PART_LABELS, resolveStageParts, type StagePart, type StagePartKind } from '../stageParts'
import { canBeParent, hierarchyContext, parentOf, STAGE_ID, type ChildKind } from '../hierarchy'
import { FIXTURE_PRESETS_BY_KIND, FIXTURE_PROFILES, KIND_LABELS, type FixtureKind } from '../lighting/fixtureTypes'
import { addSetPiece, addStagePart, SET_PIECE_TYPES } from '../objectActions'

// 右パネルの上: 舞台にある物をすべて 1 つの一覧（Unity のヒエラルキー）で見せる。
// 親子は字下げで見せ、行をドラッグして別の行に落とすと親を変えられる。

type Node = {
  kind: Exclude<SelectionKind, null>
  id: string
  label: string
  detail?: string
  swatch?: string
  enabled?: boolean
  children: Node[]
}

const STAGE_PART_KINDS: StagePartKind[] = ['floor', 'wall', 'cyc', 'batten', 'wing']

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
          kind: 'stagepart' as const, id: part.id, label: partName(parts, part),
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
        style={{ paddingLeft: 6 + depth * 14 }}
        draggable={CHILD_KINDS.has(node.kind)}
        onDragStart={event => {
          event.dataTransfer.setData(DRAG_TYPE, JSON.stringify({ kind: node.kind, id: node.id }))
          event.dataTransfer.effectAllowed = 'move'
        }}
        onDragOver={event => { if (canDrop && accepts(event, node.id)) { event.preventDefault(); setDropTarget(key) } }}
        onDragLeave={() => setDropTarget(value => value === key ? null : value)}
        onDrop={event => { if (canDrop) drop(event, node.id) }}>
        {node.children.length ? <button type="button" className="hierarchy-toggle" aria-label={open ? 'たたむ' : '開く'}
          onClick={() => setCollapsed(prev => { const next = new Set(prev); if (open) next.add(key); else next.delete(key); return next })}>
          {open ? '▾' : '▸'}</button> : <span className="hierarchy-toggle" aria-hidden="true" />}
        <button type="button" className="hierarchy-name" onClick={() => select(node.kind, node.id, node.kind === 'fixture' ? 'position' : undefined)}>
          {node.swatch && <span className="hierarchy-swatch" style={{ background: node.swatch }} aria-hidden="true" />}
          <strong>{node.label}</strong>
          {node.detail && <small>{node.detail}</small>}
        </button>
        {node.kind === 'fixture' && <button type="button" className={'hierarchy-lamp' + (node.enabled ? ' on' : '')}
          aria-pressed={node.enabled} aria-label={`${node.label}を${node.enabled ? '消灯' : '点灯'}`} title={node.enabled ? '点灯中' : '消灯中'}
          onClick={() => updateFixture(node.id, { enabled: !node.enabled })}>●</button>}
      </div>
      {node.children.length > 0 && open && <ul role="group">{node.children.map(child => row(child, depth + 1))}</ul>}
    </li>
  }

  return <section className="hierarchy-panel" aria-label="舞台にある物">
    <div className="hierarchy-head">
      <h2>ヒエラルキー</h2>
      <button type="button" className={'hierarchy-add-button' + (adding ? ' active' : '')} aria-expanded={adding}
        onClick={() => setAdding(value => !value)}>＋ 追加</button>
    </div>
    {adding && <AddMenu onDone={() => setAdding(false)} />}
    <ul className="hierarchy-tree" role="tree">{tree.map(node => row(node, 0))}</ul>
    <div className={'hierarchy-root-drop' + (dropTarget === 'root' ? ' drop-target' : '')}
      onDragOver={event => { if (accepts(event, null)) { event.preventDefault(); setDropTarget('root') } }}
      onDragLeave={() => setDropTarget(value => value === 'root' ? null : value)}
      onDrop={event => drop(event, null)}>
      行をドラッグして別の行に重ねると、その子になります（親が動くと一緒に動きます）。ここに落とすと親なし。
    </div>
  </section>
}

function AddMenu({ onDone }: { onDone: () => void }) {
  const addFixture = useStore(s => s.addFixture)
  const addPerformer = useStore(s => s.addPerformer)
  const addAudienceBlock = useStore(s => s.addAudienceBlock)
  const select = useStore(s => s.select)
  const [preset, setPreset] = useState('Fresnel8')
  const done = () => onDone()
  return <div className="hierarchy-add-menu">
    <div><strong>照明</strong>
      <select value={preset} onChange={event => setPreset(event.target.value)} aria-label="照明の種類">
        {(Object.keys(KIND_LABELS) as FixtureKind[]).map(kind => <optgroup key={kind} label={KIND_LABELS[kind]}>
          {FIXTURE_PRESETS_BY_KIND[kind].map(key => {
            const profile = FIXTURE_PROFILES[key]
            return <option key={key} value={key}>{profile.brand ? `${profile.brand} — ${profile.model || key}` : (profile.model || key)}</option>
          })}
        </optgroup>)}
      </select>
      <button type="button" onClick={() => { addFixture(preset); done() }}>＋ 照明</button>
    </div>
    <div><strong>役者</strong><button type="button" onClick={() => { addPerformer(); done() }}>＋ 役者</button></div>
    <div><strong>舞台セット</strong>
      {SET_PIECE_TYPES.map(item => <button key={item.id} type="button" onClick={() => { addSetPiece(item.id); done() }}>{item.label}</button>)}
    </div>
    <div><strong>舞台</strong>
      {STAGE_PART_KINDS.map(kind => <button key={kind} type="button" onClick={() => { addStagePart(kind); done() }}>{PART_LABELS[kind]}</button>)}
    </div>
    <div><strong>客席</strong><button type="button" onClick={() => {
      const id = addAudienceBlock()
      if (id) select('audience', id)
      done()
    }}>＋ 客席</button></div>
  </div>
}
