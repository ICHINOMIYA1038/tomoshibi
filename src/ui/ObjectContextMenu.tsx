import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react'
import { useStore } from '../store'
import { useObjectMenu, type MenuTarget } from '../objectMenu'
import { TOOLS, toolsFor } from '../tools'
import { DEFAULT_VENUE_LAYOUT } from '../venueLayout'
import { PART_LABELS, resolveStageParts, type StagePartKind } from '../stageParts'
import { canBeParent, hierarchyContext, parentOf, STAGE_ID, type ChildKind } from '../hierarchy'
import { addSetPiece, addStagePart, canDelete, deleteSelection, duplicateSelection, SET_PIECE_TYPES } from '../objectActions'
import { redoMockWorkspace, undoMockWorkspace } from '../io/mockWorkspace'
import { partName } from './HierarchyPanel'

// 右クリックのメニュー。3D の画面・ヒエラルキー・平面図で同じものを出す（開く場所は objectMenu.ts）。
// 物を指していればその物の操作を、何も無い所（床を含む）なら「ここに足す」と視点などを出す。

const KIND_NAMES: Record<MenuTarget['kind'], string> = {
  fixture: '照明', performer: '役者', setpiece: '舞台セット', stagepart: '舞台の部品', stage: '舞台の床', audience: '客席',
}
const STAGE_PART_KINDS: StagePartKind[] = ['floor', 'wall', 'cyc', 'batten', 'wing']
const VIEWS = [['audience', '客席から', '1'], ['aerial', '上から', '2'], ['sidewing', '袖から', '3'], ['free', '自由', '4']] as const
const CHILD_KINDS = new Set<MenuTarget['kind']>(['fixture', 'performer', 'setpiece'])

export function ObjectContextMenu() {
  const menu = useObjectMenu(s => s.menu)
  const close = useObjectMenu(s => s.close)
  const ref = useRef<HTMLDivElement>(null)
  const [at, setAt] = useState<{ left: number; top: number } | null>(null)
  const [sub, setSub] = useState<string | null>(null)

  // 開くたびに、指した物を選ぶ（Unity と同じ。メニューの操作は選んでいる物に効く）
  useEffect(() => {
    setSub(null)
    if (menu?.target) useStore.getState().select(menu.target.kind, menu.target.id)
  }, [menu])
  // 画面からはみ出さないように置き直す
  useLayoutEffect(() => {
    if (!menu || !ref.current) return
    const rect = ref.current.getBoundingClientRect()
    setAt({
      left: Math.max(8, Math.min(menu.x, window.innerWidth - rect.width - 8)),
      top: Math.max(8, Math.min(menu.y, window.innerHeight - rect.height - 8)),
    })
  }, [menu, sub])
  useEffect(() => {
    if (!menu) return
    const onKey = (event: KeyboardEvent) => { if (event.key === 'Escape') { event.stopPropagation(); close() } }
    // メニューの外を押したら閉じる。覆いを置かないので、別の物を右クリックすればそこで開き直せる
    const onDown = (event: PointerEvent) => { if (!ref.current?.contains(event.target as Node)) close() }
    window.addEventListener('keydown', onKey, true)
    window.addEventListener('pointerdown', onDown, true)
    return () => {
      window.removeEventListener('keydown', onKey, true)
      window.removeEventListener('pointerdown', onDown, true)
    }
  }, [menu, close])

  if (!menu) return null
  const run = (action: () => void) => () => { close(); action() }
  return <>
    <div ref={ref} className="object-menu" role="menu" aria-label="右クリックのメニュー"
      style={at ? { left: at.left, top: at.top } : { left: menu.x, top: menu.y, visibility: 'hidden' }}
      onContextMenu={event => event.preventDefault()}>
      {menu.target && menu.target.kind !== 'stage'
        ? <TargetItems target={menu.target} run={run} sub={sub} setSub={setSub} />
        : <SpaceItems point={menu.point} onStage={menu.target?.kind === 'stage'} run={run} sub={sub} setSub={setSub} />}
    </div>
  </>
}

type ItemsProps = { run: (action: () => void) => () => void; sub: string | null; setSub: (value: string | null) => void }

function Item({ label, hint, onClick, disabled, danger, active }: { label: string; hint?: string; onClick: () => void; disabled?: boolean; danger?: boolean; active?: boolean }) {
  return <button type="button" role="menuitem" className={(danger ? 'danger' : '') + (active ? ' active' : '')} disabled={disabled} onClick={onClick}>
    <span>{label}</span>{hint && <kbd>{hint}</kbd>}
  </button>
}

/** 押すとその下に開く入れ子のメニュー（右に飛び出す形だと、画面の端で切れるため） */
function Sub({ id, label, sub, setSub, children }: { id: string; label: string; sub: string | null; setSub: (value: string | null) => void; children: ReactNode }) {
  const open = sub === id
  return <div className={'object-menu-sub' + (open ? ' open' : '')}>
    <button type="button" role="menuitem" aria-haspopup="menu" aria-expanded={open} onClick={() => setSub(open ? null : id)}>
      <span>{label}</span><span aria-hidden="true">›</span>
    </button>
    {open && <div className="object-menu-children" role="menu">{children}</div>}
  </div>
}

function ToolItems({ kind, handle, run }: { kind: MenuTarget['kind'] | null; handle?: 'position' | 'target'; run: ItemsProps['run'] }) {
  const tool = useStore(s => s.settings.transformMode)
  const usable = kind ? toolsFor(kind, handle) : TOOLS.map(item => item.id)
  return <div className="object-menu-tools" role="group" aria-label="道具">
    {TOOLS.map(item => <button key={item.id} type="button" role="menuitemradio" aria-checked={tool === item.id}
      className={tool === item.id ? 'active' : ''} disabled={!usable.includes(item.id)} title={`${item.label}（${item.key}）`}
      onClick={run(() => useStore.getState().updateSettings({ transformMode: item.id }))}>{item.label}</button>)}
  </div>
}

function focusName() {
  useStore.getState().updateSettings({ panelOpen: true })
  window.dispatchEvent(new Event('tomoshibi-inspector-show'))
  window.setTimeout(() => {
    const input = document.querySelector<HTMLInputElement>('.inspector .inspector-text input[type="text"]')
    input?.scrollIntoView({ block: 'center' })
    input?.focus()
    input?.select()
  }, 60)
}

function TargetItems({ target, run, sub, setSub }: { target: MenuTarget } & ItemsProps) {
  const s = useStore()
  const layout = s.productionPlan.venueLayout ?? DEFAULT_VENUE_LAYOUT
  const parts = resolveStageParts(layout)
  const fixture = target.kind === 'fixture' ? s.fixtures.find(item => item.id === target.id) : undefined
  const performer = target.kind === 'performer' ? s.performers.find(item => item.id === target.id) : undefined
  const setPiece = target.kind === 'setpiece' ? s.setPieces.find(item => item.id === target.id) : undefined
  const part = target.kind === 'stagepart' ? parts.find(item => item.id === target.id) : undefined
  const block = target.kind === 'audience' ? s.productionPlan.audienceBlocks?.find(item => item.id === target.id) : undefined
  const name = fixture?.name ?? performer?.name ?? setPiece?.name ?? block?.name ?? (part ? partName(parts, part) : '')
  const handle = s.selection.fixtureHandle ?? 'position'

  // 親の候補: 舞台・舞台の部品・舞台セット（自分と自分の子孫は除く）
  const ctx = hierarchyContext(layout, s.setPieces)
  const child = fixture ?? performer ?? setPiece
  const currentParent = child && CHILD_KINDS.has(target.kind) ? parentOf(target.kind as ChildKind, child, ctx) : undefined
  const parents = CHILD_KINDS.has(target.kind) ? [
    { id: STAGE_ID, label: '舞台' },
    ...parts.map(item => ({ id: item.id, label: partName(parts, item) })),
    ...s.setPieces.filter(item => item.id !== target.id).map(item => ({ id: item.id, label: item.name || '舞台セット' })),
  ].filter(item => canBeParent(target.kind as ChildKind, target.id, item.id, ctx)) : []

  return <>
    <div className="object-menu-head"><small>{KIND_NAMES[target.kind]}</small><strong>{name || '名称未設定'}</strong></div>
    <ToolItems kind={target.kind} handle={fixture ? handle : undefined} run={run} />
    {fixture && <>
      <Item label={fixture.enabled ? '消灯する' : '点灯する'} onClick={run(() => s.updateFixture(fixture.id, { enabled: !fixture.enabled }))} />
      <Item label={handle === 'target' ? '照明の本体をつかむ' : '狙いをつかむ'}
        onClick={run(() => s.select('fixture', fixture.id, handle === 'target' ? 'position' : 'target'))} />
      <Item label="ほかの照明を消して、これだけ点ける" onClick={run(() => s.fixtures.forEach(item => s.updateFixture(item.id, { enabled: item.id === fixture.id })))} />
    </>}
    {performer && <Item label={performer.onStage === false ? '舞台に出す' : '舞台から外す'}
      onClick={run(() => s.updatePerformer(performer.id, { onStage: performer.onStage === false }))} />}
    {(fixture || performer || setPiece || block) && <Item label="名前を変える" onClick={run(focusName)} />}
    {parents.length > 0 && <Sub id="parent" label="親を変える" sub={sub} setSub={setSub}>
      {parents.map(item => <Item key={item.id} label={item.label} active={item.id === currentParent}
        onClick={run(() => s.setParent(target.kind as ChildKind, target.id, item.id))} />)}
      <Item label="親なし" active={currentParent === null} onClick={run(() => s.setParent(target.kind as ChildKind, target.id, null))} />
    </Sub>}
    <hr />
    <Item label="複製" hint="⌘D" onClick={run(duplicateSelection)} />
    <Item label="削除" hint="Delete" danger disabled={!canDelete(target.kind)} onClick={run(deleteSelection)} />
  </>
}

function SpaceItems({ point, onStage, run, sub, setSub }: { point?: [number, number, number]; onStage: boolean } & ItemsProps) {
  const s = useStore()
  const view = s.settings.cameraView
  const layout = s.productionPlan.venueLayout ?? DEFAULT_VENUE_LAYOUT
  const here = point ? 'ここに' : ''
  const at = point ? [Math.round(point[0] * 10) / 10, 0, Math.round(point[2] * 10) / 10] as [number, number, number] : undefined
  const addPieceHere = (type: typeof SET_PIECE_TYPES[number]['id']) => {
    const id = addSetPiece(type)
    const piece = id && useStore.getState().setPieces.find(item => item.id === id)
    if (piece && at) useStore.getState().updateSetPiece(piece.id, { position: [at[0], piece.position[1], at[2]] })
    if (id) useStore.getState().select('setpiece', id)
  }
  return <>
    {onStage && <div className="object-menu-head"><small>舞台の床</small><strong>舞台 {layout.stageWidth}m × {layout.stageDepth}m</strong></div>}
    {onStage && <ToolItems kind="stage" run={run} />}
    {onStage && <Item label="舞台の設定を開く" onClick={run(() => { s.select('stage', 'stage'); s.updateSettings({ panelOpen: true }); window.dispatchEvent(new Event('tomoshibi-inspector-show')) })} />}
    {onStage && <hr />}
    <Item label={`${here}役者を足す`} onClick={run(() => { const id = s.addPerformer(at); if (id) useStore.getState().select('performer', id) })} />
    <Item label={`${here}照明を足す（狙いをこの点に）`} disabled={!at} onClick={run(() => {
      if (!at) return
      const id = s.addFixture('Fresnel8', [at[0], 6, at[2] + 4])
      if (id) { useStore.getState().updateFixture(id, { target: [at[0], 1.5, at[2]] }); useStore.getState().select('fixture', id) }
    })} />
    <Sub id="setpiece" label={`${here}舞台セットを足す`} sub={sub} setSub={setSub}>
      {SET_PIECE_TYPES.map(item => <Item key={item.id} label={item.label} onClick={run(() => addPieceHere(item.id))} />)}
    </Sub>
    <Sub id="part" label="舞台の部品を足す" sub={sub} setSub={setSub}>
      {STAGE_PART_KINDS.map(kind => <Item key={kind} label={PART_LABELS[kind]} onClick={run(() => addStagePart(kind))} />)}
    </Sub>
    <Item label="客席を足す" onClick={run(() => { const id = s.addAudienceBlock(); if (id) useStore.getState().select('audience', id) })} />
    <hr />
    <Sub id="view" label="視点" sub={sub} setSub={setSub}>
      {VIEWS.map(([id, label, key]) => <Item key={id} label={label} hint={key} active={view === id}
        onClick={run(() => {
          if (view === id) window.dispatchEvent(new Event('tomoshibi-reaim-camera'))
          else s.updateSettings({ cameraView: id })
        })} />)}
    </Sub>
    <Item label={s.settings.showHouseLights ? '客電を消す' : '客電を点ける'} onClick={run(() => s.updateSettings({ showHouseLights: !s.settings.showHouseLights }))} />
    <Item label="照明を全部点ける" onClick={run(() => s.fixtures.forEach(item => s.updateFixture(item.id, { enabled: true })))} />
    <Item label="照明を全部消す" onClick={run(() => s.fixtures.forEach(item => s.updateFixture(item.id, { enabled: false })))} />
    <hr />
    <Item label="元に戻す" hint="⌘Z" onClick={run(undoMockWorkspace)} />
    <Item label="やり直す" hint="⇧⌘Z" onClick={run(redoMockWorkspace)} />
    {!onStage && <ToolItems kind={null} run={run} />}
  </>
}
