import { useEffect, useRef, useState, type PointerEvent } from 'react'
import { audienceSeatPositions, clampAudiencePosition } from '../audienceLayout'
import { useStore, type AudienceBlock } from '../store'
import { DEFAULT_VENUE_LAYOUT, pointInStage, stageFootprint } from '../venueLayout'
import { StagePartsLayer } from './StagePartsEditor'
import { Inspector } from './Inspector'
import { ToolButtons } from './ToolButtons'

const SVG_WIDTH = 860
const SVG_HEIGHT = 660
const VIEWS = {
  near: { scale: 24, centerZ: 2.5 },
  surround: { scale: 16, centerZ: -2 },
  wide: { scale: 10, centerZ: 8 },
}
const clamp = (value: number, low: number, high: number) => Math.min(high, Math.max(low, value))

function worldPoint(event: { clientX: number; clientY: number }, svg: SVGSVGElement, scale: number, centerZ: number): [number, number] {
  const bounds = svg.getBoundingClientRect()
  const x = ((event.clientX - bounds.left) * SVG_WIDTH / bounds.width - SVG_WIDTH / 2) / scale
  const z = ((event.clientY - bounds.top) * SVG_HEIGHT / bounds.height - SVG_HEIGHT / 2) / scale + centerZ
  return [x, z]
}

/** 客席ブロックの名前札。長い名前は 8 文字で切る */
const blockLabel = (name: string) => { const chars = Array.from(name); return chars.length > 8 ? `${chars.slice(0, 7).join('')}…` : name }
/** 名前札の幅。全角は 13px、半角は 7.5px として、左右に 12px ずつ余白をとる */
const labelWidth = (text: string) => Array.from(text).reduce((sum, char) => sum + (/[\x20-\x7e]/.test(char) ? 7.5 : 13), 24)

export function AudienceLayoutEditor({ open, onClose }: { open: boolean; onClose: () => void }) {
  const blocks = useStore(state => state.productionPlan.audienceBlocks ?? [])
  const fixtures = useStore(state => state.fixtures)
  const setPieces = useStore(state => state.setPieces)
  const addBlock = useStore(state => state.addAudienceBlock)
  const updateBlock = useStore(state => state.updateAudienceBlock)
  const venue = useStore(state => state.productionPlan.venueLayout ?? DEFAULT_VENUE_LAYOUT)
  const updateVenue = useStore(state => state.updateVenueLayout)
  const moveStageTo = useStore(state => state.moveStageTo)
  const updateSettings = useStore(state => state.updateSettings)
  const [wideView, setWideView] = useState(false)
  // 選んでいる物と道具は、3D の画面・右パネルと共通（Unity と同じく、移動の道具でだけドラッグで動かす）
  const selection = useStore(state => state.selection)
  const select = useStore(state => state.select)
  const tool = useStore(state => state.settings.transformMode)
  const selectedId = selection.kind === 'audience' ? selection.id : null
  const partId = selection.kind === 'stagepart' ? selection.id : null
  const setSelectedId = (id: string | null) => select(id ? 'audience' : null, id)
  const setPartId = (id: string | null) => select(id ? 'stagepart' : null, id)
  const moving = tool === 'translate'
  const resizing = tool === 'scale'
  const svgRef = useRef<SVGSVGElement>(null)
  const dragging = useRef<{
    kind: 'block' | 'vertex' | 'stage'; id: string; pointerId: number; at: [number, number]; from: [number, number]
  } | null>(null)
  const stageOffset = venue.stageOffset ?? [0, 0]
  const hasRearSeating = blocks.some(block => block.position[1] < -11)
  // 舞台と客席が図に収まる、いちばん近い縮尺を選ぶ（舞台を遠くへ動かしたときに、図の外へ消えないように）
  const fits = (view: { scale: number; centerZ: number }) => {
    const halfX = SVG_WIDTH / 2 / view.scale - 1
    const halfZ = SVG_HEIGHT / 2 / view.scale - 1
    const points: Array<[number, number]> = [...stageFootprint(venue), ...blocks.flatMap(block => {
      const r = Math.hypot((block.seatsPerRow * block.seatSpacing) / 2, (block.rows * block.rowSpacing) / 2)
      return [[block.position[0] - r, block.position[1] - r], [block.position[0] + r, block.position[1] + r]] as Array<[number, number]>
    })]
    return points.every(([x, z]) => Math.abs(x) <= halfX && Math.abs(z - view.centerZ) <= halfZ)
  }
  const autoView = !hasRearSeating && fits(VIEWS.near) ? VIEWS.near : fits(VIEWS.surround) ? VIEWS.surround : VIEWS.wide
  const { scale, centerZ } = wideView ? VIEWS.wide : autoView
  const mapX = (x: number) => SVG_WIDTH / 2 + x * scale
  const mapY = (z: number) => SVG_HEIGHT / 2 + (z - centerZ) * scale
  const outline = stageFootprint(venue)
  const stagePoints = outline.map(([x, z]) => `${mapX(x)},${mapY(z)}`).join(' ')
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
    if (!open) return
    const onKeyDown = (event: KeyboardEvent) => { if (event.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [open, onClose])
  if (!open) return null

  const beginDrag = (event: PointerEvent<SVGGElement>, block: AudienceBlock) => {
    event.preventDefault()
    event.stopPropagation()
    setSelectedId(block.id)
    if (!moving || !svgRef.current) return
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
    select('stage', 'stage')
    if (!moving || !svgRef.current) return
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

  return <div className="audience-editor-backdrop" onPointerDown={event => {
    if (event.target === event.currentTarget) onClose()
  }}>
    <section className="audience-editor" role="dialog" aria-modal="true" aria-label="会場の配置">
      <header className="audience-editor-header">
        <div><strong>会場の配置</strong><span>配置済み {seatCount} 席{venue.targetCapacity > 0 ? ` ／ 目標 ${venue.targetCapacity} 席` : ''}・全シーン共通</span></div>
        <div className="audience-editor-header-actions">
          <ToolButtons compact />
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
            <polygon points={stagePoints} fill="#423d3a" strokeWidth="4"
              role="button" tabIndex={0} aria-label="舞台をドラッグして移動。矢印キーでも移動できます"
              style={{ cursor: moving ? 'grab' : 'pointer', touchAction: 'none' }}
              stroke={selection.kind === 'stage' ? '#f2c27b' : '#a57545'}
              onPointerDown={beginStageDrag}
              onKeyDown={event => {
                if (!moving) return
                const delta = event.key === 'ArrowLeft' ? [-.5, 0] : event.key === 'ArrowRight' ? [.5, 0]
                  : event.key === 'ArrowUp' ? [0, -.5] : event.key === 'ArrowDown' ? [0, .5] : null
                if (!delta) return
                event.preventDefault()
                moveStageTo([stageOffset[0] + delta[0], stageOffset[1] + delta[1]])
              }} />
            <text x={mapX(stageOffset[0])} y={mapY(-3 + stageOffset[1]) + 6} textAnchor="middle" fill="#f6f1e8" fontSize="21" fontWeight="700" pointerEvents="none">舞台</text>
            {blocks.map(block => <g key={block.id} role="button" tabIndex={0}
              aria-label={`${block.name} ${block.rows}列 ${block.seatsPerRow}席を移動`}
              style={{ cursor: moving ? 'grab' : 'pointer', touchAction: 'none' }}
              onPointerDown={event => beginDrag(event, block)}
              onKeyDown={event => {
                if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); setSelectedId(block.id); return }
                if (!moving) return
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
              {(() => {
                const name = blockLabel(block.name)
                const width = labelWidth(name)
                return <>
                  <rect x={mapX(block.position[0]) - width / 2} y={mapY(block.position[1]) - 13} width={width} height="26" rx="13"
                    fill={selectedId === block.id ? '#9a432a' : '#42383c'} stroke="#fff4e5" strokeWidth="2" />
                  <text x={mapX(block.position[0])} y={mapY(block.position[1]) + 5}
                    textAnchor="middle" fill="white" fontSize="13" fontWeight="700" pointerEvents="none">{name}</text>
                </>
              })()}
            </g>)}
            {fixtures.filter(fixture => fixture.position[2] > 2).map(fixture => <g key={fixture.id} pointerEvents="none">
              <circle cx={mapX(fixture.position[0])} cy={mapY(fixture.position[2])} r="9" fill="#d59a45" stroke="#4c3321" strokeWidth="2" />
              <title>{fixture.name}</title>
            </g>)}
            {<StagePartsLayer selectedId={partId} onSelect={setPartId} tool={tool}
              toWorld={event => worldPoint(event, svgRef.current!, scale, centerZ)} mapX={mapX} mapY={mapY}
              unitsPerPx={SVG_WIDTH / (svgRef.current?.clientWidth || SVG_WIDTH)} />}
            {resizing && selection.kind === 'stage' && venue.stageShape === 'custom' && outline.map(([x, z], index) => <circle key={index}
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
          <div className="audience-editor-legend">
            <span>■ 客席</span><span>━ 壁</span><span>╍ バトン</span><span>● 客席側の照明</span>
            <span>{tool === 'select' ? '選ぶだけの道具です。動かすときは上の「移動」、大きさは「拡大」'
              : tool === 'translate' ? '舞台・客席・部品をドラッグして移動'
                : tool === 'scale' ? '部品を選ぶと出る金色の点で大きさを変える（自由形状の舞台は、舞台を選ぶと角が出ます）'
                  : '回転は 3D の画面か、右の数字で変えます'}</span>
            {!blocks.length && <span>客席はまだありません（なくても使えます）</span>}
          </div>
        </div>
        <aside className="audience-editor-inspector">
          <Inspector />
          {stageOverlap > 0 && <p className="venue-capacity-warning">{stageOverlap} 席が舞台と重なっています。客席の位置を調整してください。</p>}
          {protrudingSetPieces > 0 && <p className="venue-capacity-warning">現在のシーンで {protrudingSetPieces} 個の舞台セットが舞台の輪郭からはみ出しています。</p>}
        </aside>
      </div>
    </section>
  </div>
}
