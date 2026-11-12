import { useEffect, useRef, useState, type PointerEvent } from 'react'
import { audienceSeatPositions, clampAudiencePosition } from '../audienceLayout'
import { useStore, type AudienceBlock, type StageShape } from '../store'
import { DEFAULT_VENUE_LAYOUT, pointInStage, stageFootprint } from '../venueLayout'

const SVG_WIDTH = 860
const SVG_HEIGHT = 660
const VIEWS = {
  near: { scale: 24, centerZ: 2.5 },
  surround: { scale: 16, centerZ: -2 },
  wide: { scale: 10, centerZ: 8 },
}
const clamp = (value: number, low: number, high: number) => Math.min(high, Math.max(low, value))

function worldPoint(event: PointerEvent<SVGElement>, svg: SVGSVGElement, scale: number, centerZ: number): [number, number] {
  const bounds = svg.getBoundingClientRect()
  const x = ((event.clientX - bounds.left) * SVG_WIDTH / bounds.width - SVG_WIDTH / 2) / scale
  const z = ((event.clientY - bounds.top) * SVG_HEIGHT / bounds.height - SVG_HEIGHT / 2) / scale + centerZ
  return [x, z]
}

export function AudienceLayoutEditor({ open, onClose }: { open: boolean; onClose: () => void }) {
  const blocks = useStore(state => state.productionPlan.audienceBlocks ?? [])
  const fixtures = useStore(state => state.fixtures)
  const setPieces = useStore(state => state.setPieces)
  const addBlock = useStore(state => state.addAudienceBlock)
  const updateBlock = useStore(state => state.updateAudienceBlock)
  const removeBlock = useStore(state => state.removeAudienceBlock)
  const venue = useStore(state => state.productionPlan.venueLayout ?? DEFAULT_VENUE_LAYOUT)
  const updateVenue = useStore(state => state.updateVenueLayout)
  const moveStageTo = useStore(state => state.moveStageTo)
  const updateSettings = useStore(state => state.updateSettings)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [wideView, setWideView] = useState(false)
  const svgRef = useRef<SVGSVGElement>(null)
  const dragging = useRef<{
    kind: 'block' | 'vertex' | 'stage'; id: string; pointerId: number; at: [number, number]; from: [number, number]
  } | null>(null)
  const stageOffset = venue.stageOffset ?? [0, 0]
  const hasRearSeating = blocks.some(block => block.position[1] < -11)
  const { scale, centerZ } = wideView ? VIEWS.wide : hasRearSeating ? VIEWS.surround : VIEWS.near
  const mapX = (x: number) => SVG_WIDTH / 2 + x * scale
  const mapY = (z: number) => SVG_HEIGHT / 2 + (z - centerZ) * scale
  const outline = stageFootprint(venue)
  const stagePoints = outline.map(([x, z]) => `${mapX(x)},${mapY(z)}`).join(' ')
  const selected = blocks.find(block => block.id === selectedId) ?? null
  const seatCount = blocks.reduce((sum, block) => sum + block.rows * block.seatsPerRow, 0)
  const stageOverlap = blocks.reduce((sum, block) => sum + audienceSeatPositions(block)
    .filter(([x, z]) => pointInStage(x, z, outline)).length, 0)
  const protrudingSetPieces = venue.stageShape === 'proscenium' ? 0 : setPieces.filter(piece => {
    const halfWidth = (piece.size?.[0] ?? 1) * Math.abs(piece.scale) / 2
    const halfDepth = (piece.size?.[2] ?? 1) * Math.abs(piece.scale) / 2
    return [[-halfWidth, -halfDepth], [halfWidth, -halfDepth], [halfWidth, halfDepth], [-halfWidth, halfDepth]]
      .some(([dx, dz]) => !pointInStage(piece.position[0] + dx, piece.position[2] + dz, outline))
  }).length

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
    if (!svgRef.current) return
    const at = worldPoint(event, svgRef.current, scale, centerZ)
    dragging.current = { kind: 'block', id: block.id, pointerId: event.pointerId, at, from: [...block.position] }
    svgRef.current?.setPointerCapture(event.pointerId)
  }
  const beginVertexDrag = (event: PointerEvent<SVGCircleElement>, index: number) => {
    event.preventDefault()
    event.stopPropagation()
    if (!svgRef.current) return
    dragging.current = { kind: 'vertex', id: String(index), pointerId: event.pointerId,
      at: worldPoint(event, svgRef.current, scale, centerZ), from: [...outline[index]] }
    svgRef.current.setPointerCapture(event.pointerId)
  }
  const beginStageDrag = (event: PointerEvent<SVGPolygonElement>) => {
    event.preventDefault()
    event.stopPropagation()
    if (!svgRef.current) return
    dragging.current = { kind: 'stage', id: '', pointerId: event.pointerId,
      at: worldPoint(event, svgRef.current, scale, centerZ), from: [...stageOffset] }
    svgRef.current.setPointerCapture(event.pointerId)
  }
  const moveDrag = (event: PointerEvent<SVGSVGElement>) => {
    const drag = dragging.current
    if (!drag || drag.pointerId !== event.pointerId) return
    const [x, z] = worldPoint(event, event.currentTarget, scale, centerZ)
    if (drag.kind === 'stage') {
      moveStageTo([
        Math.round((drag.from[0] + x - drag.at[0]) * 10) / 10,
        Math.round((drag.from[1] + z - drag.at[1]) * 10) / 10,
      ])
      return
    }
    if (drag.kind === 'vertex') {
      const current = useStore.getState().productionPlan.venueLayout
      const vertices = [...(current?.stageVertices ?? outline.map(([px, pz]) => [px - stageOffset[0], pz - stageOffset[1]] as [number, number]))]
      vertices[Number(drag.id)] = [
        Math.round(clamp(drag.from[0] + x - drag.at[0], -24, 24) * 10) / 10 - stageOffset[0],
        Math.round(clamp(drag.from[1] + z - drag.at[1], -21, 35) * 10) / 10 - stageOffset[1],
      ]
      updateVenue({ stageVertices: vertices })
      return
    }
    const block = useStore.getState().productionPlan.audienceBlocks?.find(item => item.id === drag.id)
    if (!block) return
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
  const chooseShape = (shape: StageShape) => {
    if (shape === 'custom' && venue.stageShape !== 'custom') {
      const vertices = outline.length > 8 ? Array.from({ length: 8 }, (_, index) =>
        outline[Math.floor(index * outline.length / 8)]) : outline
      updateVenue({ stageShape: shape, stageVertices: vertices.map(([x, z]) => [x - stageOffset[0], z - stageOffset[1]]) })
    }
    else if (shape === 'round') updateVenue({ stageShape: shape, stageWidth: 12, stageDepth: 12 })
    else updateVenue({ stageShape: shape })
  }
  const addStageVertex = () => {
    if (outline.length >= 8) return
    let edge = 0
    let longest = 0
    outline.forEach(([x, z], index) => {
      const [nextX, nextZ] = outline[(index + 1) % outline.length]
      const length = Math.hypot(nextX - x, nextZ - z)
      if (length > longest) { longest = length; edge = index }
    })
    const [x, z] = outline[edge]
    const [nextX, nextZ] = outline[(edge + 1) % outline.length]
    const vertices = [...outline]
    vertices.splice(edge + 1, 0, [(x + nextX) / 2, (z + nextZ) / 2])
    updateVenue({ stageVertices: vertices.map(([x, z]) => [x - stageOffset[0], z - stageOffset[1]]) })
  }

  return <div className="audience-editor-backdrop" onPointerDown={event => {
    if (event.target === event.currentTarget) onClose()
  }}>
    <section className="audience-editor" role="dialog" aria-modal="true" aria-label="会場の配置">
      <header className="audience-editor-header">
        <div><strong>会場の配置</strong><span>配置済み {seatCount} 席{venue.targetCapacity > 0 ? ` ／ 目標 ${venue.targetCapacity} 席` : ''}・全シーン共通</span></div>
        <div className="audience-editor-header-actions">
          <button type="button" onClick={() => setWideView(value => !value)}>{wideView ? '舞台付近' : '全体を表示'}</button>
          <button type="button" onClick={createBlock} disabled={blocks.length >= 16}>＋ 客席</button>
          <button type="button" onClick={() => { updateSettings({ cameraView: 'house' }); onClose() }} disabled={!blocks.length}>3Dで見る</button>
          <button type="button" className="audience-editor-close" onClick={onClose} aria-label="会場の配置を閉じる">×</button>
        </div>
      </header>
      <div className="audience-editor-body">
        <div className="audience-editor-map">
          <svg ref={svgRef} viewBox={`0 0 ${SVG_WIDTH} ${SVG_HEIGHT}`}
            aria-label="舞台と客席の平面図。舞台、客席と自由形状の頂点をドラッグして配置できます"
            onPointerMove={moveDrag} onPointerUp={endDrag} onPointerCancel={endDrag}>
            <rect width={SVG_WIDTH} height={SVG_HEIGHT} fill="#ede8df" />
            {[-20, -15, -10, -5, 0, 5, 10, 15, 20, 25, 30, 35].filter(z => mapY(z) > 25 && mapY(z) < 635)
              .map(z => <g key={z}>
                <line x1="42" x2="818" y1={mapY(z)} y2={mapY(z)} stroke="#d2c9bd" strokeDasharray="5 9" />
                <text x="45" y={mapY(z) - 5} fill="#73695e" fontSize="12">z {z}m</text>
              </g>)}
            <polygon points={stagePoints} fill="#423d3a" stroke="#a57545" strokeWidth="4"
              role="button" tabIndex={0} aria-label="舞台をドラッグして移動。矢印キーでも移動できます"
              style={{ cursor: 'grab', touchAction: 'none' }} onPointerDown={beginStageDrag}
              onKeyDown={event => {
                const delta = event.key === 'ArrowLeft' ? [-.5, 0] : event.key === 'ArrowRight' ? [.5, 0]
                  : event.key === 'ArrowUp' ? [0, -.5] : event.key === 'ArrowDown' ? [0, .5] : null
                if (!delta) return
                event.preventDefault()
                moveStageTo([stageOffset[0] + delta[0], stageOffset[1] + delta[1]])
              }} />
            <text x={mapX(stageOffset[0])} y={mapY(-3 + stageOffset[1]) + 6} textAnchor="middle" fill="#f6f1e8" fontSize="21" fontWeight="700" pointerEvents="none">舞台</text>
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
                x={mapX(x) - Math.max(4, scale * .27)} y={mapY(z) - Math.max(3, scale * .24)}
                width={Math.max(8, scale * .54)} height={Math.max(6, scale * .48)} rx="2"
                transform={`rotate(${-block.rotationDeg} ${mapX(x)} ${mapY(z)})`}
                fill={pointInStage(x, z, outline) ? '#df8548' : selectedId === block.id ? '#b26349' : '#71565c'}
                stroke="#f6ede4" strokeWidth=".8" />)}
              <rect x={mapX(block.position[0]) - 28} y={mapY(block.position[1]) - 13} width="56" height="26" rx="13"
                fill={selectedId === block.id ? '#9a432a' : '#42383c'} stroke="#fff4e5" strokeWidth="2" />
              <text x={mapX(block.position[0])} y={mapY(block.position[1]) + 5}
                textAnchor="middle" fill="white" fontSize="13" fontWeight="700" pointerEvents="none">{block.name.slice(0, 6)}</text>
            </g>)}
            {fixtures.filter(fixture => fixture.position[2] > 2).map(fixture => <g key={fixture.id} pointerEvents="none">
              <circle cx={mapX(fixture.position[0])} cy={mapY(fixture.position[2])} r="9" fill="#d59a45" stroke="#4c3321" strokeWidth="2" />
              <title>{fixture.name}</title>
            </g>)}
            {venue.stageShape === 'custom' && outline.map(([x, z], index) => <circle key={index}
              cx={mapX(x)} cy={mapY(z)} r="11" fill="#e1ad6d" stroke="#4e321d" strokeWidth="3"
              role="button" tabIndex={0} aria-label={`舞台の頂点 ${index + 1} を移動`}
              style={{ cursor: 'grab', touchAction: 'none' }}
              onPointerDown={event => beginVertexDrag(event, index)}
              onKeyDown={event => {
                const delta = event.key === 'ArrowLeft' ? [-.5, 0] : event.key === 'ArrowRight' ? [.5, 0]
                  : event.key === 'ArrowUp' ? [0, -.5] : event.key === 'ArrowDown' ? [0, .5] : null
                if (!delta) return
                event.preventDefault()
                const vertices = [...outline]
                vertices[index] = [clamp(x + delta[0], -24, 24), clamp(z + delta[1], -21, 35)]
                updateVenue({ stageVertices: vertices.map(([px, pz]) => [px - stageOffset[0], pz - stageOffset[1]]) })
              }} />)}
          </svg>
          {!blocks.length && <div className="audience-editor-empty">
            <strong>客席を追加して配置します</strong>
            <span>ブロックごとに列数と席数を決め、図の上で移動できます。</span>
            <button type="button" onClick={createBlock}>＋ 最初の客席ブロック</button>
          </div>}
          <div className="audience-editor-legend"><span>■ 客席</span><span>● 客席側の照明</span><span>舞台・客席をドラッグして移動</span></div>
        </div>
        <aside className="audience-editor-inspector">
          <h2>舞台の床・形</h2>
          <p>床を広げるには幅・奥行を変更します。張り出しや変形した床も選べます。</p>
          <div className="venue-shape-options" role="group" aria-label="舞台の形">
            {([['proscenium', '額縁'], ['round', '円形'], ['thrust', '張り出し'], ['custom', '自由形状']] as const)
              .map(([shape, label]) => <button key={shape} type="button"
                className={venue.stageShape === shape ? 'active' : ''} aria-pressed={venue.stageShape === shape}
                onClick={() => chooseShape(shape)}>{label}</button>)}
          </div>
          {venue.stageShape === 'custom'
            ? <div className="venue-custom-controls">
              <p>図の金色の点をドラッグして舞台の輪郭を変えます。</p>
              <button type="button" onClick={addStageVertex} disabled={outline.length >= 8}>＋ 角を追加</button>
              <button type="button" onClick={() => updateVenue({ stageVertices: outline.slice(0, -1)
                .map(([x, z]) => [x - stageOffset[0], z - stageOffset[1]]) })}
                disabled={outline.length <= 3}>最後の角を削除</button>
            </div>
            : <div className="audience-editor-fields venue-stage-fields">
              <label>{venue.stageShape === 'round' ? '直径' : '舞台の幅'}
                <input type="range" min="6" max="24" step="0.5" value={venue.stageWidth}
                  onChange={event => {
                    const width = Number(event.target.value)
                    updateVenue(venue.stageShape === 'round' ? { stageWidth: width, stageDepth: width } : { stageWidth: width })
                  }} /><output>{venue.stageWidth}m</output></label>
              {venue.stageShape !== 'round' && <label>奥行
                <input type="range" min="6" max="20" step="0.5" value={venue.stageDepth}
                  onChange={event => updateVenue({ stageDepth: Number(event.target.value) })} />
                <output>{venue.stageDepth}m</output></label>}
            </div>}
          {venue.stageShape === 'proscenium' && <label className="venue-frame-option">
            <input type="checkbox" checked={venue.showProsceniumFrame === true}
              onChange={event => updateVenue({ showProsceniumFrame: event.target.checked })} />
            赤い舞台枠を表示
          </label>}
          <p>床に段差を付ける場合は「セット」から「床・平台を追加」を選び、幅・奥行・高さを調整できます。</p>
          <div className="venue-stage-position">
            <strong>舞台の位置</strong>
            <p>舞台をドラッグして移動。全シーンの役者・セットと、舞台の範囲内にある照明も一緒に動きます。客席側の照明は狙いが追従します。</p>
            <div><label>左右 <input type="number" min="-24" max="24" step="0.1" value={stageOffset[0]}
              onChange={event => moveStageTo([Number(event.target.value), stageOffset[1]])} />m</label>
              <label>前後 <input type="number" min="-21" max="35" step="0.1" value={stageOffset[1]}
                onChange={event => moveStageTo([stageOffset[0], Number(event.target.value)])} />m</label></div>
            <button type="button" onClick={() => moveStageTo([0, 0])} disabled={!stageOffset[0] && !stageOffset[1]}>中央に戻す</button>
          </div>
          <div className="venue-capacity">
            <label>目標定員 <input type="number" min="0" max="6400" step="1" placeholder="未設定" value={venue.targetCapacity || ''}
              onChange={event => updateVenue({ targetCapacity: clamp(Math.round(Number(event.target.value) || 0), 0, 6400) })} />席</label>
            <p>配置済み {seatCount} 席{venue.targetCapacity > 0 && ` ／ ${seatCount < venue.targetCapacity
              ? `あと ${venue.targetCapacity - seatCount} 席` : seatCount > venue.targetCapacity
                ? `${seatCount - venue.targetCapacity} 席超過` : '目標と一致'}`}</p>
            {stageOverlap > 0 && <p className="venue-capacity-warning">{stageOverlap} 席が舞台と重なっています。客席の位置を調整してください。</p>}
            {protrudingSetPieces > 0 && <p className="venue-capacity-warning">現在のシーンで {protrudingSetPieces} 個の舞台セットが新しい輪郭からはみ出しています。セットの大きさと位置を確認してください。</p>}
          </div>
          <h2>客席ブロック</h2>
          <div className="audience-editor-block-list">{blocks.map(block => <button key={block.id} type="button"
            className={selectedId === block.id ? 'active' : ''} onClick={() => setSelectedId(block.id)}>
            <strong>{block.name}</strong><span>{block.rows * block.seatsPerRow}席</span>
          </button>)}</div>
          {selected ? <div className="audience-editor-fields">
            <label>名前<input type="text" maxLength={60} value={selected.name}
              onChange={event => changeSelected({ name: event.target.value })} /></label>
            <label>列数 <input type="range" min="1" max="20" value={selected.rows}
              onChange={event => changeSelected({ rows: Number(event.target.value) })} /><output>{selected.rows}列</output></label>
            <label>1列の席数 <input type="range" min="1" max="20" value={selected.seatsPerRow}
              onChange={event => changeSelected({ seatsPerRow: Number(event.target.value) })} /><output>{selected.seatsPerRow}席</output></label>
            <label>列の間隔 <input type="range" min="0.6" max="1.4" step="0.05" value={selected.rowSpacing}
              onChange={event => changeSelected({ rowSpacing: Number(event.target.value) })} /><output>{selected.rowSpacing.toFixed(2)}m</output></label>
            <label>席の間隔 <input type="range" min="0.5" max="1.2" step="0.05" value={selected.seatSpacing}
              onChange={event => changeSelected({ seatSpacing: Number(event.target.value) })} /><output>{selected.seatSpacing.toFixed(2)}m</output></label>
            <label>左右位置 <input type="range" min="-24" max="24" step="0.1" value={selected.position[0]}
              onChange={event => changeSelected({ position: [Number(event.target.value), selected.position[1]] })} /><output>{selected.position[0].toFixed(1)}m</output></label>
            <label>前後位置 <input type="range" min="-21" max="35" step="0.1" value={selected.position[1]}
              onChange={event => changeSelected({ position: [selected.position[0], Number(event.target.value)] })} /><output>{selected.position[1].toFixed(1)}m</output></label>
            <label>向き <input type="range" min="-180" max="180" step="1" value={selected.rotationDeg}
              onChange={event => changeSelected({ rotationDeg: Number(event.target.value) })} /><output>{selected.rotationDeg}°</output></label>
            <button className="venue-face-stage" type="button" onClick={() => changeSelected({
              rotationDeg: Math.round(Math.atan2(selected.position[0] - stageOffset[0], selected.position[1] + 3 - stageOffset[1]) * 180 / Math.PI),
            })}>舞台の中心へ向ける</button>
            <button className="audience-editor-delete" type="button" onClick={() => removeBlock(selected.id)}>このブロックを削除</button>
          </div> : <p>客席ブロックを選ぶと、列数や席数を変更できます。</p>}
          <p className="audience-editor-note">客席を舞台の横や後ろにも置けます。通路はブロック間に空けます。会場の配置は全シーン共通で自動保存されます。</p>
        </aside>
      </div>
    </section>
  </div>
}
