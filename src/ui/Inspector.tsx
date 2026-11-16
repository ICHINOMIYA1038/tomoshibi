import { useEffect } from 'react'
import { useStore, type AudienceBlock, type Fixture, type Performer, type StageShape } from '../store'
import type { SetPiece, SetPieceAppearance } from '../types'
import { DEFAULT_VENUE_LAYOUT, STAGE_SIZE, stageFootprint, THEATRE } from '../venueLayout'
import { AUDIENCE_MAX_ELEVATION, clampAudienceElevation, clampAudiencePosition } from '../audienceLayout'
import {
  DEFAULT_CYC_COLOR, DEFAULT_WALL_COLOR, FLOOR_FINISHES, isFlat, PART_LABELS, type StagePart,
} from '../stageParts'
import { canBeParent, hierarchyContext, parentOf, STAGE_ID, type ChildKind } from '../hierarchy'
import { PERFORMER_POSES } from '../performerPoses'
import { canDelete, deleteSelection, duplicateSelection } from '../objectActions'
import { useStageParts } from './StagePartsEditor'
import { InspectorSection, NumberField } from './fields'
import { partName } from './HierarchyPanel'
import { FixtureEditor } from './ControlPanel'
import * as THREE from 'three'

// 右パネルの下: 選んだ物の設定（Unity のインスペクター）。
// どの物も「名前と親」「位置・回転・大きさ」を同じ並びで出し、その下に種類ごとの設定を出す。
// 位置はすべて劇場の座標（X: 左右、Y: 高さ、Z: 前後で客席側が＋）。

const KIND_LABELS = { fixture: '照明', performer: '役者', setpiece: '舞台セット', stagepart: '舞台の部品', stage: '舞台の床', audience: '客席' } as const
const deg = (rad: number) => Math.round(rad * 180 / Math.PI)
const rad = (degrees: number) => degrees * Math.PI / 180

export function Inspector() {
  const selection = useStore(s => s.selection)
  const fixture = useStore(s => selection.kind === 'fixture' ? s.fixtures.find(item => item.id === selection.id) : undefined)
  const performer = useStore(s => selection.kind === 'performer' ? s.performers.find(item => item.id === selection.id) : undefined)
  const setPiece = useStore(s => selection.kind === 'setpiece' ? s.setPieces.find(item => item.id === selection.id) : undefined)
  const block = useStore(s => selection.kind === 'audience' ? (s.productionPlan.audienceBlocks ?? []).find(item => item.id === selection.id) : undefined)
  const stageParts = useStageParts()
  const part = selection.kind === 'stagepart' ? stageParts.parts.find(item => item.id === selection.id) : undefined

  if (!selection.kind) return <div className="inspector inspector-empty">
    <p>上の一覧か、3D の画面・平面図で物を選ぶと、ここに設定が出ます。</p>
    <p>選んだ物は、画面上の道具（移動・回転・拡大。キーは W・E・R）で動かせます。動かさずに選ぶだけにしたいときは「選択」（Q）にします。</p>
  </div>

  const title = fixture?.name ?? performer?.name ?? setPiece?.name ?? block?.name
    ?? (part ? partName(stageParts.parts, part) : selection.kind === 'stage' ? '舞台' : '')
  return <div className="inspector" key={`${selection.kind}:${selection.id}`}>
    <header className="inspector-head">
      <div><small>{KIND_LABELS[selection.kind]}</small><strong>{title || '名称未設定'}</strong></div>
      <div className="inspector-actions">
        {canDelete(selection.kind) && <button type="button" onClick={duplicateSelection} title="複製（⌘D / Ctrl+D）">複製</button>}
        {canDelete(selection.kind) && <button type="button" className="danger" onClick={deleteSelection} title="削除（Delete）。⌘Z で戻せます">削除</button>}
      </div>
    </header>
    {fixture && <FixtureInspector fixture={fixture} />}
    {performer && <PerformerInspector performer={performer} />}
    {setPiece && <SetPieceInspector piece={setPiece} />}
    {part && <PartInspector part={part} />}
    {selection.kind === 'stage' && <StageInspector />}
    {block && <AudienceInspector block={block} />}
  </div>
}

function NameField({ value, onChange }: { value: string; onChange: (value: string) => void }) {
  return <label className="inspector-text"><span>名前</span><input type="text" maxLength={60} value={value} onChange={event => onChange(event.target.value)} /></label>
}

/** 親を選ぶ欄。舞台の床・舞台の部品・舞台セットから選ぶ（自分と自分の子孫は選べない） */
function ParentField({ kind, id, item }: { kind: ChildKind; id: string; item: { parentId?: string | null; battenId?: string; position?: [number, number, number] } }) {
  const setPieces = useStore(s => s.setPieces)
  const layout = useStore(s => s.productionPlan.venueLayout ?? DEFAULT_VENUE_LAYOUT)
  const setParent = useStore(s => s.setParent)
  const ctx = hierarchyContext(layout, setPieces)
  const current = parentOf(kind, item, ctx)
  const options: Array<[string, string]> = [
    [STAGE_ID, '舞台'],
    ...ctx.parts.map(part => [part.id, partName(ctx.parts, part)] as [string, string]),
    ...setPieces.filter(piece => canBeParent(kind, id, piece.id, ctx)).map(piece => [piece.id, piece.name || '名称未設定'] as [string, string]),
  ]
  return <label className="inspector-text"><span>親</span>
    <select value={current ?? ''} onChange={event => setParent(kind, id, event.target.value || null)}>
      <option value="">なし</option>
      {options.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
    </select>
  </label>
}

function FixtureInspector({ fixture }: { fixture: Fixture }) {
  const update = (patch: Partial<Fixture>) => useStore.getState().updateFixture(fixture.id, patch)
  const select = useStore(s => s.select)
  const handle = useStore(s => s.selection.fixtureHandle ?? 'position')
  // 位置を変えても向きは保つ（狙う先も同じだけ動かす）。3D の移動と同じ
  const move = (axis: 0 | 1 | 2, value: number) => {
    const position = [...fixture.position] as Fixture['position']
    const delta = value - position[axis]
    position[axis] = value
    const target = [...fixture.target] as Fixture['target']
    target[axis] += delta
    update({ position, target })
  }
  const aim = (axis: 0 | 1 | 2, value: number) => {
    const target = [...fixture.target] as Fixture['target']
    target[axis] = value
    update({ target })
  }
  return <>
    <InspectorSection title="名前と親">
      <NameField value={fixture.name} onChange={name => update({ name })} />
      <ParentField kind="fixture" id={fixture.id} item={fixture} />
    </InspectorSection>
    <InspectorSection title="位置">
      <NumberField label="X" value={fixture.position[0]} onChange={value => move(0, value)} />
      <NumberField label="Y" value={fixture.position[1]} min={0.3} max={20} onChange={value => move(1, value)} />
      <NumberField label="Z" value={fixture.position[2]} onChange={value => move(2, value)} />
    </InspectorSection>
    <InspectorSection title="狙い">
      <NumberField label="X" value={fixture.target[0]} onChange={value => aim(0, value)} />
      <NumberField label="Y" value={fixture.target[1]} min={0} max={20} onChange={value => aim(1, value)} />
      <NumberField label="Z" value={fixture.target[2]} onChange={value => aim(2, value)} />
      <div className="inspector-choice" role="group" aria-label="3D でつかむ点">
        <span>3D でつかむ点</span>
        <button type="button" className={handle === 'position' ? 'active' : ''} aria-pressed={handle === 'position'}
          onClick={() => select('fixture', fixture.id, 'position')}>照明</button>
        <button type="button" className={handle === 'target' ? 'active' : ''} aria-pressed={handle === 'target'}
          onClick={() => select('fixture', fixture.id, 'target')}>狙い</button>
      </div>
    </InspectorSection>
    <InspectorSection title="照明"><FixtureEditor fixture={fixture} /></InspectorSection>
  </>
}

function PerformerInspector({ performer }: { performer: Performer }) {
  const update = (patch: Partial<Performer>) => useStore.getState().updatePerformer(performer.id, patch)
  const move = (axis: 0 | 1 | 2, value: number) => {
    const position = [...performer.position] as Performer['position']
    position[axis] = value
    update({ position })
  }
  return <>
    <InspectorSection title="名前と親">
      <NameField value={performer.name} onChange={name => update({ name })} />
      <ParentField kind="performer" id={performer.id} item={performer} />
    </InspectorSection>
    <InspectorSection title="位置">
      <NumberField label="X" value={performer.position[0]} onChange={value => move(0, value)} />
      <NumberField label="Y" value={performer.position[1]} min={0} max={10} onChange={value => move(1, value)} />
      <NumberField label="Z" value={performer.position[2]} onChange={value => move(2, value)} />
    </InspectorSection>
    <InspectorSection title="役者">
      <label className="inspector-check"><input type="checkbox" checked={performer.onStage !== false}
        onChange={event => update({ onStage: event.target.checked })} />このシーンで舞台上にいる</label>
      <div className="inspector-choice wrap" role="group" aria-label="ポーズ">
        <span>ポーズ</span>
        {PERFORMER_POSES.map(pose => <button key={pose.value} type="button"
          className={(performer.pose ?? 'standing') === pose.value ? 'active' : ''} aria-pressed={(performer.pose ?? 'standing') === pose.value}
          onClick={() => update({ pose: pose.value })}>{pose.label}</button>)}
      </div>
      <label className="inspector-text"><span>服の色</span><input type="color" value={performer.color} onChange={event => update({ color: event.target.value })} /></label>
      <NumberField label="身長" value={Math.round(performer.scale * 170)} min={100} max={220} step={1} unit="cm"
        onChange={value => update({ scale: value / 170 })} />
    </InspectorSection>
  </>
}

const APPEARANCE_LABELS: Array<[SetPieceAppearance, string]> = [
  ['basic', '基本形'], ['bench', 'ベンチ'], ['door', '扉'], ['suitcase', '鞄'], ['table', '机'], ['bookshelf', '書架'], ['window', '窓'],
]

function SetPieceInspector({ piece }: { piece: SetPiece }) {
  const update = (patch: Partial<SetPiece>) => useStore.getState().updateSetPiece(piece.id, patch)
  const move = (axis: 0 | 1 | 2, value: number) => {
    const position = [...piece.position] as SetPiece['position']
    position[axis] = value
    update({ position })
  }
  const resize = (axis: 0 | 1 | 2, value: number) => {
    if (!piece.size) return
    const size = [...piece.size] as [number, number, number]
    size[axis] = value
    // 床に置いてある物は、高さを変えても床に置いたままにする
    const grounded = Math.abs(piece.position[1] - piece.size[1] / 2) < .01
    update(axis === 1 && grounded ? { size, position: [piece.position[0], value / 2, piece.position[2]] } : { size })
  }
  return <>
    <InspectorSection title="名前と親">
      <NameField value={piece.name} onChange={name => update({ name })} />
      <ParentField kind="setpiece" id={piece.id} item={piece} />
    </InspectorSection>
    <InspectorSection title="位置・回転・大きさ">
      <NumberField label="X" value={piece.position[0]} onChange={value => move(0, value)} />
      <NumberField label="Y" value={piece.position[1]} min={0} max={20} onChange={value => move(1, value)} />
      <NumberField label="Z" value={piece.position[2]} onChange={value => move(2, value)} />
      <NumberField label="回転" value={deg(piece.rotation[1])} step={5} unit="°"
        onChange={value => update({ rotation: [piece.rotation[0], rad(value), piece.rotation[2]] })} />
      {piece.size ? <>
        <NumberField label="幅" value={piece.size[0]} min={.05} max={30} step={.05} onChange={value => resize(0, value)} />
        <NumberField label="高さ" value={piece.size[1]} min={.05} max={20} step={.05} onChange={value => resize(1, value)} />
        <NumberField label="奥行" value={piece.size[2]} min={.05} max={30} step={.05} onChange={value => resize(2, value)} />
      </> : <NumberField label="大きさ" value={piece.scale} min={.05} max={20} step={.05} unit="倍" onChange={value => update({ scale: value })} />}
    </InspectorSection>
    {piece.kind !== 'gltf' && <InspectorSection title="見た目">
      <label className="inspector-text"><span>形</span>
        <select value={piece.appearance ?? 'basic'} onChange={event => update({ appearance: event.target.value as SetPieceAppearance })}>
          {APPEARANCE_LABELS.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
        </select>
      </label>
      <label className="inspector-text"><span>色</span><input type="color" value={piece.color ?? '#876040'} onChange={event => update({ color: event.target.value })} /></label>
    </InspectorSection>}
  </>
}

const HANGING = new Set(['batten', 'wall', 'cyc', 'wing'])

function PartInspector({ part }: { part: StagePart }) {
  const { offset, change } = useStageParts()
  return <>
    <InspectorSection title="親">
      <p className="inspector-note">舞台の部品は、いつも「舞台」の子です。舞台を動かすと一緒に動きます。</p>
    </InspectorSection>
    <InspectorSection title="位置・回転・大きさ">
      <NumberField label="X" value={part.x + offset[0]} min={THEATRE.minX} max={THEATRE.maxX} onChange={value => change(part.id, { x: value - offset[0] })} />
      {HANGING.has(part.kind) && <NumberField label={part.kind === 'batten' ? 'Y（吊る高さ）' : 'Y（下端）'} value={part.elevation}
        min={part.kind === 'batten' ? 1 : 0} max={20} onChange={value => change(part.id, { elevation: value })} />}
      <NumberField label="Z" value={part.z + offset[1]} min={THEATRE.minZ} max={THEATRE.maxZ} onChange={value => change(part.id, { z: value - offset[1] })} />
      <NumberField label="回転" value={part.rotationDeg} step={5} unit="°" onChange={value => change(part.id, { rotationDeg: value })} />
      <NumberField label={isFlat(part.kind) ? '幅' : '長さ'} value={part.width} min={.5} max={48} onChange={value => change(part.id, { width: value })} />
      {part.kind !== 'floor' && part.kind !== 'batten' && <NumberField label="高さ" value={part.height} min={.1} max={20} onChange={value => change(part.id, { height: value })} />}
      {isFlat(part.kind) && <NumberField label="奥行" value={part.depth} min={.5} max={56} onChange={value => change(part.id, { depth: value })} />}
    </InspectorSection>
    {part.kind !== 'batten' && <PartColorField part={part} />}
    {part.kind === 'batten' && <InspectorSection title="バトン">
      <p className="inspector-note">照明を吊るときは、上の一覧で照明の行をこのバトンの行に重ねてください（照明の「親」でも選べます）。吊った照明は、バトンを動かす・回すと一緒に動きます。</p>
    </InspectorSection>}
  </>
}

/** 部品 1 つだけの色。付けていなければ舞台全体の色（床・壁・ホリゾント）を見せる */
function PartColorField({ part }: { part: StagePart }) {
  const { layout, parts, commit } = useStageParts()
  const finish = FLOOR_FINISHES.find(item => item.id === (layout.floorFinish ?? 'black')) ?? FLOOR_FINISHES[0]
  const inherited = part.kind === 'floor' ? layout.floorColor ?? linearHex(finish.color)
    : part.kind === 'wall' ? layout.wallColor ?? linearHex(DEFAULT_WALL_COLOR)
    : part.kind === 'cyc' ? layout.cycColor ?? linearHex(DEFAULT_CYC_COLOR)
    : part.kind === 'wing' ? linearHex([0.02, 0.019, 0.021]) : linearHex([0.4, 0.3, 0.2])
  // 色だけを変えるときは「動かした」にしない（ひな形の部品が、舞台の大きさに合わせて置き直され続けるように）
  const setColor = (color: string | undefined) => commit(parts.map(item => item.id === part.id ? { ...item, color } : item))
  return <InspectorSection title="色">
    <label className="inspector-text"><span>{PART_LABELS[part.kind]}</span>
      <input type="color" value={part.color ?? inherited} onChange={event => setColor(event.target.value)} />
      <button type="button" onClick={() => setColor(undefined)} disabled={!part.color}>舞台の色に戻す</button>
    </label>
    <p className="inspector-note">{part.color ? 'この部品だけの色です。' : '舞台全体の色に従っています。ここで変えると、この部品だけの色になります。'}</p>
  </InspectorSection>
}

/** three.js の線形の色を、色の入力欄の #rrggbb（sRGB）にする */
function linearHex(rgb: [number, number, number]) {
  return `#${new THREE.Color(...rgb).getHexString()}`
}

const SHAPES: Array<[StageShape, string]> = [['proscenium', '額縁'], ['round', '円形'], ['thrust', '張り出し'], ['custom', '自由形状']]

function StageInspector() {
  const layout = useStore(s => s.productionPlan.venueLayout ?? DEFAULT_VENUE_LAYOUT)
  const blocks = useStore(s => s.productionPlan.audienceBlocks ?? [])
  const updateVenue = useStore(s => s.updateVenueLayout)
  const moveStageTo = useStore(s => s.moveStageTo)
  const offset = layout.stageOffset ?? [0, 0]
  const round = layout.stageShape === 'round'
  const seatCount = blocks.reduce((sum, block) => sum + block.rows * block.seatsPerRow, 0)
  const chooseShape = (shape: StageShape) => {
    if (shape === 'custom' && layout.stageShape !== 'custom') {
      const outline = stageFootprint(layout)
      const vertices = outline.length > 8 ? Array.from({ length: 8 }, (_, index) => outline[Math.floor(index * outline.length / 8)]) : outline
      updateVenue({ stageShape: shape, stageVertices: vertices.map(([x, z]) => [x - offset[0], z - offset[1]]) })
    } else if (shape === 'round') updateVenue({ stageShape: shape, stageWidth: 12, stageDepth: 12 })
    else updateVenue({ stageShape: shape })
  }
  // いちばん長い辺の真ん中に角を足す
  const addVertex = () => {
    const outline = stageFootprint(layout)
    if (outline.length >= 8) return
    let edge = 0
    let longest = 0
    outline.forEach(([x, z], index) => {
      const [nx, nz] = outline[(index + 1) % outline.length]
      const length = Math.hypot(nx - x, nz - z)
      if (length > longest) { longest = length; edge = index }
    })
    const [x, z] = outline[edge]
    const [nx, nz] = outline[(edge + 1) % outline.length]
    const vertices = [...outline]
    vertices.splice(edge + 1, 0, [(x + nx) / 2, (z + nz) / 2])
    updateVenue({ stageVertices: vertices.map(([px, pz]) => [px - offset[0], pz - offset[1]]) })
  }
  const colorHex = (value: string | undefined, fallback: [number, number, number]) => value ?? `#${new THREE.Color(...fallback).getHexString()}`
  return <>
    <InspectorSection title="位置・大きさ">
      <p className="inspector-note">舞台を動かすと、舞台の子（一覧で「舞台」の下にある物）が一緒に動きます。</p>
      <NumberField label="X" value={offset[0]} min={THEATRE.minX} max={THEATRE.maxX} step={.5} onChange={value => moveStageTo([value, offset[1]])} />
      <NumberField label="Z" value={offset[1]} min={THEATRE.minZ} max={THEATRE.maxZ} step={.5} onChange={value => moveStageTo([offset[0], value])} />
      {layout.stageShape !== 'custom' && <>
        <NumberField label={round ? '直径' : '幅'} value={layout.stageWidth} min={STAGE_SIZE.min} max={STAGE_SIZE.maxWidth} step={.5}
          onChange={value => updateVenue(round ? { stageWidth: value, stageDepth: value } : { stageWidth: value })} />
        {!round && <NumberField label="奥行" value={layout.stageDepth} min={STAGE_SIZE.min} max={STAGE_SIZE.maxDepth} step={.5} onChange={value => updateVenue({ stageDepth: value })} />}
      </>}
    </InspectorSection>
    <InspectorSection title="形">
      <div className="inspector-choice wrap" role="group" aria-label="舞台の形">
        {SHAPES.map(([shape, label]) => <button key={shape} type="button" className={layout.stageShape === shape ? 'active' : ''}
          aria-pressed={layout.stageShape === shape} onClick={() => chooseShape(shape)}>{label}</button>)}
      </div>
      {layout.stageShape === 'custom' && <>
        <p className="inspector-note">平面図を「会場」に切り替え、道具を「拡大」にして金色の点をドラッグすると、輪郭を変えられます。</p>
        <div className="inspector-choice">
          <button type="button" onClick={addVertex} disabled={stageFootprint(layout).length >= 8}>＋ 角を足す</button>
          <button type="button" disabled={stageFootprint(layout).length <= 3} onClick={() => updateVenue({
            stageVertices: stageFootprint(layout).slice(0, -1).map(([x, z]) => [x - offset[0], z - offset[1]]) })}>最後の角を消す</button>
        </div>
      </>}
      {layout.stageShape === 'proscenium' && <label className="inspector-check"><input type="checkbox" checked={layout.showProsceniumFrame === true}
        onChange={event => updateVenue({ showProsceniumFrame: event.target.checked })} />赤い舞台枠を表示</label>}
      <p className="inspector-note">形の違う床は、「＋ 追加」の「舞台」から床を足して組み合わせます。</p>
    </InspectorSection>
    <InspectorSection title="床・壁の色（舞台全体）">
      <div className="inspector-choice wrap" role="group" aria-label="床の仕上げ">
        {FLOOR_FINISHES.map(item => <button key={item.id} type="button"
          className={(layout.floorFinish ?? 'black') === item.id ? 'active' : ''} aria-pressed={(layout.floorFinish ?? 'black') === item.id}
          onClick={() => updateVenue({ floorFinish: item.id, floorColor: undefined })}>{item.label}</button>)}
      </div>
      {([
        ['floorColor', '床', FLOOR_FINISHES.find(item => item.id === (layout.floorFinish ?? 'black'))!.color],
        ['wallColor', '壁', DEFAULT_WALL_COLOR],
        ['cycColor', 'ホリゾント', DEFAULT_CYC_COLOR],
      ] as const).map(([key, label, fallback]) => <label key={key} className="inspector-text"><span>{label}</span>
        <input type="color" value={colorHex(layout[key], fallback)} onChange={event => updateVenue({ [key]: event.target.value })} />
        <button type="button" onClick={() => updateVenue({ [key]: undefined })} disabled={!layout[key]}>元の色</button>
      </label>)}
      <p className="inspector-note">ここで変えた色は、色を付けていない部品すべてに効きます。壁 1 枚だけの色は、その壁を選んで変えます。</p>
    </InspectorSection>
    <InspectorSection title="会場">
      <NumberField label="目標定員" value={layout.targetCapacity || 0} min={0} max={6400} step={1} unit="席"
        onChange={value => updateVenue({ targetCapacity: Math.round(value) })} />
      <p className="inspector-note">置いた客席は {seatCount} 席です。</p>
    </InspectorSection>
  </>
}

function AudienceInspector({ block }: { block: AudienceBlock }) {
  const updateBlock = useStore(s => s.updateAudienceBlock)
  const cameraView = useStore(s => s.settings.cameraView)
  const updateSettings = useStore(s => s.updateSettings)
  // 「客席」の視点はカメラが客席の中にあり、客席が画面の後ろになって選べない。客席を選んだら「客席全体」にする
  useEffect(() => { if (cameraView === 'audience') updateSettings({ cameraView: 'house' }) }, [block.id])
  const layout = useStore(s => s.productionPlan.venueLayout ?? DEFAULT_VENUE_LAYOUT)
  const offset = layout.stageOffset ?? [0, 0]
  const change = (patch: Partial<AudienceBlock>) => {
    const next = { ...block, ...patch }
    updateBlock(block.id, { ...patch, position: clampAudiencePosition(next, next.position[0], next.position[1]) })
  }
  return <>
    <InspectorSection title="名前">
      <NameField value={block.name} onChange={name => change({ name })} />
    </InspectorSection>
    <InspectorSection title="位置・回転">
      <NumberField label="X" value={block.position[0]} min={THEATRE.minX} max={THEATRE.maxX} onChange={value => change({ position: [value, block.position[1]] })} />
      <NumberField label="Z" value={block.position[1]} min={THEATRE.minZ} max={THEATRE.maxZ} onChange={value => change({ position: [block.position[0], value] })} />
      <NumberField label="高さ" value={block.elevation ?? 0} min={0} max={AUDIENCE_MAX_ELEVATION} step={.1} onChange={value => change({ elevation: clampAudienceElevation(value) })} />
      <NumberField label="回転" value={block.rotationDeg} min={-180} max={180} step={5} unit="°" onChange={value => change({ rotationDeg: value })} />
      <button type="button" className="inspector-wide-button" onClick={() => change({
        rotationDeg: Math.round(Math.atan2(block.position[0] - offset[0], block.position[1] + 3 - offset[1]) * 180 / Math.PI),
      })}>舞台の中心へ向ける</button>
    </InspectorSection>
    <InspectorSection title="客席">
      <NumberField label="列数" value={block.rows} min={1} max={20} step={1} unit="列" onChange={value => change({ rows: Math.round(value) })} />
      <NumberField label="1 列の席数" value={block.seatsPerRow} min={1} max={20} step={1} unit="席" onChange={value => change({ seatsPerRow: Math.round(value) })} />
      <NumberField label="列の間隔" value={block.rowSpacing} min={.6} max={1.4} step={.05} onChange={value => change({ rowSpacing: value })} />
      <NumberField label="席の間隔" value={block.seatSpacing} min={.5} max={1.2} step={.05} onChange={value => change({ seatSpacing: value })} />
    </InspectorSection>
  </>
}
