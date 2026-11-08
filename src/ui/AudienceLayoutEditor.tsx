import { useEffect, useRef, useState, type PointerEvent } from 'react'
import { audienceSeatPositions, clampAudiencePosition } from '../audienceLayout'
import { useStore, type AudienceBlock } from '../store'

const SVG_WIDTH = 860
const SVG_HEIGHT = 660
const mapX = (x: number) => 110 + (x + 10) * 32
const mapY = (z: number) => 165 + (z - 2) * 20
const clamp = (value: number, low: number, high: number) => Math.min(high, Math.max(low, value))

function worldPoint(event: PointerEvent<SVGSVGElement>): [number, number] {
  const bounds = event.currentTarget.getBoundingClientRect()
  const x = ((event.clientX - bounds.left) * SVG_WIDTH / bounds.width - 110) / 32 - 10
  const z = ((event.clientY - bounds.top) * SVG_HEIGHT / bounds.height - 165) / 20 + 2
  return [x, z]
}

export function AudienceLayoutEditor({ open, onClose }: { open: boolean; onClose: () => void }) {
  const blocks = useStore(state => state.productionPlan.audienceBlocks ?? [])
  const fixtures = useStore(state => state.fixtures)
  const addBlock = useStore(state => state.addAudienceBlock)
  const updateBlock = useStore(state => state.updateAudienceBlock)
  const removeBlock = useStore(state => state.removeAudienceBlock)
  const updateSettings = useStore(state => state.updateSettings)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const svgRef = useRef<SVGSVGElement>(null)
  const dragging = useRef<{ id: string; pointerId: number; at: [number, number]; from: [number, number] } | null>(null)
  const selected = blocks.find(block => block.id === selectedId) ?? null
  const seatCount = blocks.reduce((sum, block) => sum + block.rows * block.seatsPerRow, 0)

  useEffect(() => {
    if (open && !blocks.some(block => block.id === selectedId)) setSelectedId(blocks[0]?.id ?? null)
  }, [open, blocks, selectedId])
  useEffect(() => {
    if (!open) return
    const onKeyDown = (event: KeyboardEvent) => { if (event.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [open, onClose])
  if (!open) return null

  const changeSelected = (patch: Partial<AudienceBlock>) => {
    if (!selected) return
    const next = { ...selected, ...patch }
    next.position = clampAudiencePosition(next, next.position[0], next.position[1])
    updateBlock(selected.id, { ...patch, position: next.position })
  }
  const beginDrag = (event: PointerEvent<SVGGElement>, block: AudienceBlock) => {
    event.preventDefault()
    event.stopPropagation()
    setSelectedId(block.id)
    const bounds = svgRef.current?.getBoundingClientRect()
    if (!bounds) return
    const at: [number, number] = [
      ((event.clientX - bounds.left) * SVG_WIDTH / bounds.width - 110) / 32 - 10,
      ((event.clientY - bounds.top) * SVG_HEIGHT / bounds.height - 165) / 20 + 2,
    ]
    dragging.current = { id: block.id, pointerId: event.pointerId, at, from: [...block.position] }
    svgRef.current?.setPointerCapture(event.pointerId)
  }
  const moveDrag = (event: PointerEvent<SVGSVGElement>) => {
    const drag = dragging.current
    if (!drag || drag.pointerId !== event.pointerId) return
    const block = useStore.getState().productionPlan.audienceBlocks?.find(item => item.id === drag.id)
    if (!block) return
    const [x, z] = worldPoint(event)
    const position = clampAudiencePosition(block,
      Math.round((drag.from[0] + x - drag.at[0]) * 10) / 10,
      Math.round((drag.from[1] + z - drag.at[1]) * 10) / 10)
    updateBlock(block.id, { position })
  }
  const endDrag = (event: PointerEvent<SVGSVGElement>) => {
    if (dragging.current?.pointerId === event.pointerId) dragging.current = null
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId)
  }
  const createBlock = () => {
    const id = addBlock()
    if (id) setSelectedId(id)
  }

  return <div className="audience-editor-backdrop" onPointerDown={event => {
    if (event.target === event.currentTarget) onClose()
  }}>
    <section className="audience-editor" role="dialog" aria-modal="true" aria-label="客席の配置">
      <header className="audience-editor-header">
        <div><strong>客席の配置</strong><span>{blocks.length} ブロック・{seatCount} 席／全シーン共通</span></div>
        <div className="audience-editor-header-actions">
          <button type="button" onClick={createBlock} disabled={blocks.length >= 8}>＋ 客席ブロック</button>
          <button type="button" onClick={() => { updateSettings({ cameraView: 'house' }); onClose() }} disabled={!blocks.length}>3Dで見る</button>
          <button type="button" className="audience-editor-close" onClick={onClose} aria-label="客席の配置を閉じる">×</button>
        </div>
      </header>
      <div className="audience-editor-body">
        <div className="audience-editor-map">
          <svg ref={svgRef} viewBox={`0 0 ${SVG_WIDTH} ${SVG_HEIGHT}`}
            aria-label="舞台と客席の平面図。客席ブロックをドラッグして配置できます"
            onPointerMove={moveDrag} onPointerUp={endDrag} onPointerCancel={endDrag}>
            <rect width={SVG_WIDTH} height={SVG_HEIGHT} fill="#ede8df" />
            <rect x="174" y="42" width="512" height="116" fill="#3e3a38" />
            <text x="430" y="103" textAnchor="middle" fill="#f6f1e8" fontSize="24" fontWeight="700">舞台</text>
            <line x1="174" x2="686" y1="160" y2="160" stroke="#a57545" strokeWidth="5" />
            <rect x="110" y="165" width="640" height="440" fill="#ddd6cc" stroke="#9d948b" strokeWidth="2" />
            {[6, 10, 14, 18, 22].map(z => <g key={z}>
              <line x1="110" x2="750" y1={mapY(z)} y2={mapY(z)} stroke="#c8c0b5" strokeDasharray="6 8" />
              <text x="98" y={mapY(z) + 5} textAnchor="end" fill="#6b6259" fontSize="15">{z - 2}m</text>
            </g>)}
            <text x="430" y="637" textAnchor="middle" fill="#6b6259" fontSize="16">客席後方　・　舞台前からの距離</text>
            {blocks.map(block => <g key={block.id} role="button" tabIndex={0}
              aria-label={`${block.name} ${block.rows}列 ${block.seatsPerRow}席を移動`}
              style={{ cursor: 'grab', touchAction: 'none' }}
              onPointerDown={event => beginDrag(event, block)}
              onKeyDown={event => {
                if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); setSelectedId(block.id); return }
                const delta = event.key === 'ArrowLeft' ? [-.5, 0] : event.key === 'ArrowRight' ? [.5, 0]
                  : event.key === 'ArrowUp' ? [0, -.5] : event.key === 'ArrowDown' ? [0, .5] : null
                if (!delta) return
                event.preventDefault()
                setSelectedId(block.id)
                updateBlock(block.id, { position: clampAudiencePosition(block, block.position[0] + delta[0], block.position[1] + delta[1]) })
              }}>
              {audienceSeatPositions(block).map(([x, z], index) => <rect key={index}
                x={mapX(x) - 9} y={mapY(z) - 5} width="18" height="10" rx="3"
                fill={selectedId === block.id ? '#b26349' : '#71565c'} stroke="#f6ede4" strokeWidth="1" />)}
              <rect x={mapX(block.position[0]) - 28} y={mapY(block.position[1]) - 13} width="56" height="26" rx="13"
                fill={selectedId === block.id ? '#9a432a' : '#42383c'} stroke="#fff4e5" strokeWidth="2" />
              <text x={mapX(block.position[0])} y={mapY(block.position[1]) + 5}
                textAnchor="middle" fill="white" fontSize="13" fontWeight="700" pointerEvents="none">{block.name.slice(0, 6)}</text>
            </g>)}
            {fixtures.filter(fixture => fixture.position[2] > 2).map(fixture => <g key={fixture.id} pointerEvents="none">
              <circle cx={mapX(fixture.position[0])} cy={mapY(fixture.position[2])} r="9" fill="#d59a45" stroke="#4c3321" strokeWidth="2" />
              <title>{fixture.name}</title>
            </g>)}
          </svg>
          {!blocks.length && <div className="audience-editor-empty">
            <strong>客席を追加して配置します</strong>
            <span>ブロックごとに列数と席数を決め、図の上で移動できます。</span>
            <button type="button" onClick={createBlock}>＋ 最初の客席ブロック</button>
          </div>}
          <div className="audience-editor-legend"><span>■ 客席</span><span>● 客席側の照明</span><span>ブロックをドラッグして移動</span></div>
        </div>
        <aside className="audience-editor-inspector">
          <h2>客席ブロック</h2>
          <div className="audience-editor-block-list">{blocks.map(block => <button key={block.id} type="button"
            className={selectedId === block.id ? 'active' : ''} onClick={() => setSelectedId(block.id)}>
            <strong>{block.name}</strong><span>{block.rows * block.seatsPerRow}席</span>
          </button>)}</div>
          {selected ? <div className="audience-editor-fields">
            <label>名前<input type="text" maxLength={60} value={selected.name}
              onChange={event => changeSelected({ name: event.target.value })} /></label>
            <label>列数 <input type="range" min="1" max="10" value={selected.rows}
              onChange={event => changeSelected({ rows: Number(event.target.value) })} /><output>{selected.rows}列</output></label>
            <label>1列の席数 <input type="range" min="1" max="12" value={selected.seatsPerRow}
              onChange={event => changeSelected({ seatsPerRow: Number(event.target.value) })} /><output>{selected.seatsPerRow}席</output></label>
            <label>列の間隔 <input type="range" min="0.6" max="1.4" step="0.05" value={selected.rowSpacing}
              onChange={event => changeSelected({ rowSpacing: Number(event.target.value) })} /><output>{selected.rowSpacing.toFixed(2)}m</output></label>
            <label>席の間隔 <input type="range" min="0.5" max="1.2" step="0.05" value={selected.seatSpacing}
              onChange={event => changeSelected({ seatSpacing: Number(event.target.value) })} /><output>{selected.seatSpacing.toFixed(2)}m</output></label>
            <label>左右位置 <input type="range" min="-8" max="8" step="0.1" value={selected.position[0]}
              onChange={event => changeSelected({ position: [Number(event.target.value), selected.position[1]] })} /><output>{selected.position[0].toFixed(1)}m</output></label>
            <label>舞台から <input type="range" min="4" max="22" step="0.1" value={selected.position[1]}
              onChange={event => changeSelected({ position: [selected.position[0], Number(event.target.value)] })} /><output>{(selected.position[1] - 2).toFixed(1)}m</output></label>
            <label>向き <input type="range" min="-45" max="45" step="1" value={selected.rotationDeg}
              onChange={event => changeSelected({ rotationDeg: Number(event.target.value) })} /><output>{selected.rotationDeg}°</output></label>
            <button className="audience-editor-delete" type="button" onClick={() => removeBlock(selected.id)}>このブロックを削除</button>
          </div> : <p>客席ブロックを選ぶと、列数や席数を変更できます。</p>}
          <p className="audience-editor-note">通路はブロックの間を空けて作ります。配置はすべてのシーンに共通で、自動保存されます。</p>
        </aside>
      </div>
    </section>
  </div>
}
