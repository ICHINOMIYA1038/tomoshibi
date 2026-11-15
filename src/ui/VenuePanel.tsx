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
    <p className="venue-panel-intro">3D の画面で床・壁・バトン・客席をクリックすると選べます。矢印をドラッグして動かします（0.5m ごと）。</p>

    <section className="venue-panel-section">
      <h2>舞台の床</h2>
      <button type="button" className={'props-item' + (stageSelected ? ' selected' : '')} aria-pressed={stageSelected}
        onClick={() => select(stageSelected ? null : 'stage', stageSelected ? null : 'stage')}>
        <strong>舞台</strong><span>{layout.stageWidth}m × {layout.stageDepth}m</span>
      </button>
      {stageSelected && <div className="venue-stage-position">
        <p>舞台の位置は、客席に対する位置です。動かすと、全シーンの役者・セットと舞台の上の照明も一緒に動きます。3D の視点は動きません。舞台に向け直すときは、画面上のいまの視点のボタン（「客席」など）をもう一度押してください。広さと形は、平面図の「舞台・客席を編集」で変えられます。</p>
        <div><label>左右 <input type="number" min="-24" max="24" step="0.5" value={offset[0]}
          onChange={event => moveStageTo([Number(event.target.value), offset[1]])} />m</label>
          <label>前後 <input type="number" min="-21" max="35" step="0.5" value={offset[1]}
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
        hint="「＋」で足すと、3D の画面で選んだ状態になります。位置は矢印で、大きさ・高さ・向きは下の数字で変えられます。" />
    </section>

  </div>
}
