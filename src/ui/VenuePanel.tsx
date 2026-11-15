import { useEffect, useRef } from 'react'
import { useStore } from '../store'
import { DEFAULT_VENUE_LAYOUT } from '../venueLayout'
import { StagePartsInspector } from './StagePartsEditor'
import { AudienceBlockFields } from './AudienceLayoutEditor'

/** 右パネルの「舞台・客席」。舞台の床・部品・客席を足して選ぶ。位置は 3D の画面の矢印でも動かせる */
export function VenuePanel() {
  const selection = useStore(s => s.selection)
  const select = useStore(s => s.select)
  const layout = useStore(s => s.productionPlan.venueLayout ?? DEFAULT_VENUE_LAYOUT)
  const blocks = useStore(s => s.productionPlan.audienceBlocks ?? [])
  const addBlock = useStore(s => s.addAudienceBlock)
  const moveStageTo = useStore(s => s.moveStageTo)
  const offset = layout.stageOffset ?? [0, 0]
  const stageSelected = selection.kind === 'stage'
  const selectedBlock = selection.kind === 'audience' ? blocks.find(block => block.id === selection.id) : undefined
  const updateVenueLayout = useStore(s => s.updateVenueLayout)
  const resize = (width: number, depth: number) => {
    if (!Number.isFinite(width) || !Number.isFinite(depth)) return
    const w = Math.min(24, Math.max(6, width))
    updateVenueLayout(layout.stageShape === 'round' ? { stageWidth: w, stageDepth: w } : { stageWidth: w, stageDepth: Math.min(20, Math.max(6, depth)) })
  }
  const cameraView = useStore(s => s.settings.cameraView)
  const updateSettings = useStore(s => s.updateSettings)
  // 「客席」の視点はカメラが客席の中にあり、客席が画面の後ろになって選べない。客席を選んだら「客席全体」に切り替える
  useEffect(() => {
    if (selection.kind === 'audience' && cameraView === 'audience') updateSettings({ cameraView: 'house' })
  }, [selection.kind, selection.id])
  const root = useRef<HTMLDivElement>(null)
  // 3D の画面で選んだときは、その欄までスクロールする
  useEffect(() => {
    if (!selection.kind || !['stage', 'stagepart', 'audience'].includes(selection.kind)) return
    requestAnimationFrame(() => root.current?.querySelector('.venue-stage-position, .stage-part-fields, .audience-editor-fields')
      ?.scrollIntoView({ block: 'nearest', behavior: 'smooth' }))
  }, [selection.kind, selection.id])
  const addAudience = () => {
    const id = addBlock()
    if (id) select('audience', id)
  }
  return <div className="panel-body venue-panel" ref={root}>
    {isVenueKind(selection.kind) && <div className="venue-mode-buttons" role="group" aria-label="3D での操作"><VenueModeButtons /></div>}
    <p className="venue-panel-intro">3D の画面で床・壁・バトン・客席をクリックすると選べます。照明や役者と同じく、上の「移動・回転・拡大」を切り替えて、矢印や輪をドラッグします（0.5m ごと）。</p>

    <section className="venue-panel-section">
      <h2>舞台の床</h2>
      <button type="button" className={'props-item' + (stageSelected ? ' selected' : '')} aria-pressed={stageSelected}
        onClick={() => select(stageSelected ? null : 'stage', stageSelected ? null : 'stage')}>
        <strong>舞台</strong><span>{layout.stageWidth}m × {layout.stageDepth}m</span>
      </button>
      {stageSelected && <div className="venue-stage-position">
        <p>舞台を動かすと、全シーンの役者・セットと舞台の上の照明も一緒に動きます。3D の視点は動きません。舞台に向け直すときは、画面上のいまの視点のボタン（「客席」など）をもう一度押してください。形の違う床は、下の「舞台の部品」で「＋ 床」を足して組み合わせます。</p>
        <div><label>幅 <input type="number" min="6" max="24" step="0.5" value={layout.stageWidth}
          onChange={event => resize(Number(event.target.value), layout.stageDepth)} />m</label>
          {layout.stageShape !== 'round' && <label>奥行 <input type="number" min="6" max="20" step="0.5" value={layout.stageDepth}
            onChange={event => resize(layout.stageWidth, Number(event.target.value))} />m</label>}</div>
        <div><label>位置 X <input type="number" min="-24" max="24" step="0.5" value={offset[0]}
          onChange={event => moveStageTo([Number(event.target.value), offset[1]])} />m</label>
          <label>位置 Z <input type="number" min="-21" max="35" step="0.5" value={offset[1]}
            onChange={event => moveStageTo([offset[0], Number(event.target.value)])} />m</label></div>
        <button type="button" onClick={() => moveStageTo([0, 0])} disabled={!offset[0] && !offset[1]}>中央に戻す</button>
      </div>}
    </section>

    <section className="venue-panel-section">
      <h2>客席</h2>
      <button type="button" className="venue-panel-add" onClick={addAudience} disabled={blocks.length >= 16}>＋ 客席を足す</button>
      <div className="audience-editor-block-list">{blocks.map(block => <button key={block.id} type="button"
        className={selectedBlock?.id === block.id ? 'active' : ''} onClick={() => select('audience', block.id)}>
        <strong>{block.name}</strong><span>{block.rows * block.seatsPerRow}席</span>
      </button>)}
        {!blocks.length && <p>客席はありません。「＋ 客席を足す」で足せます。</p>}
      </div>
      {selectedBlock && <AudienceBlockFields block={selectedBlock} />}
    </section>
    <section className="venue-panel-section stage-parts-inspector">
      <StagePartsInspector selectedId={selection.kind === 'stagepart' ? selection.id : null}
        onSelect={id => select(id ? 'stagepart' : null, id)}
        hint="「＋」で足すと、3D の画面で選んだ状態になります。いくつでも足せて、「複製」（Ctrl / ⌘ + D）で同じものを増やせます。" />
    </section>

  </div>
}

export const isVenueKind = (kind: string | null) => kind === 'stagepart' || kind === 'stage' || kind === 'audience'

/** 移動・回転・拡大の切り替え。舞台の床は回転なし、客席は拡大なし（席数・列数で変える） */
export function VenueModeButtons() {
  const kind = useStore(s => s.selection.kind)
  const mode = useStore(s => s.settings.transformMode)
  const update = useStore(s => s.updateSettings)
  const modes = ([
    ['translate', '移動', 'G'],
    ...(kind !== 'stage' ? [['rotate', '回転', 'R']] : []),
    ...(kind !== 'audience' ? [['scale', '拡大', 'S']] : []),
  ] as Array<['translate' | 'rotate' | 'scale', string, string]>)
  const current = modes.some(([id]) => id === mode) ? mode : 'translate'
  return <>{modes.map(([id, label, key]) => <button key={id} type="button" className={current === id ? 'active' : ''}
    aria-pressed={current === id} onClick={() => update({ transformMode: id })} title={`${label} (${key})`}>{label}</button>)}</>
}
