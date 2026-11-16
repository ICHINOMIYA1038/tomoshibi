import { useRef, useState, type PointerEvent } from 'react'
import { useObjectMenu } from '../objectMenu'
import { audienceSeatPositions, clampAudiencePosition } from '../audienceLayout'
import { useStore, type AudienceBlock } from '../store'
import { DEFAULT_VENUE_LAYOUT, pointInStage, STAGE_SIZE, stageFootprint, THEATRE } from '../venueLayout'
import { StagePartsLayer } from './StagePartsEditor'
import { useMapZoom } from './useMapZoom'

// 平面図（PlanBoard.tsx）と同じ大きさ。「シーン／会場」を切り替えても、図の大きさが変わらないように
const SVG_WIDTH = 960
const SVG_HEIGHT = 630
const VIEWS = {
  near: { scale: 24, centerZ: 2.5 },
  surround: { scale: 16, centerZ: -2 },
  wide: { scale: 10, centerZ: 8 },
}
const clamp = (value: number, low: number, high: number) => Math.min(high, Math.max(low, value))

function worldPoint(event: { clientX: number; clientY: number }, svg: SVGSVGElement, scale: number, centerZ: number, centerX = 0): [number, number] {
  const bounds = svg.getBoundingClientRect()
  const x = ((event.clientX - bounds.left) * SVG_WIDTH / bounds.width - SVG_WIDTH / 2) / scale + centerX
  const z = ((event.clientY - bounds.top) * SVG_HEIGHT / bounds.height - SVG_HEIGHT / 2) / scale + centerZ
  return [x, z]
}

/** 客席ブロックの名前札。長い名前は 8 文字で切る */
const blockLabel = (name: string) => { const chars = Array.from(name); return chars.length > 8 ? `${chars.slice(0, 7).join('')}…` : name }
/** 名前札の幅。全角は 13px、半角は 7.5px として、左右に 12px ずつ余白をとる */
const labelWidth = (text: string) => Array.from(text).reduce((sum, char) => sum + (/[\x20-\x7e]/.test(char) ? 7.5 : 13), 24)

/** 平面図の「会場」の図。舞台の形・舞台の部品・客席を置く（全シーン共通）。選んだ物の設定は右のパネルで変える */
export function VenueMap() {
  const blocks = useStore(state => state.productionPlan.audienceBlocks ?? [])
  const fixtures = useStore(state => state.fixtures)
  const setPieces = useStore(state => state.setPieces)
  const addBlock = useStore(state => state.addAudienceBlock)
  const updateBlock = useStore(state => state.updateAudienceBlock)
  const venue = useStore(state => state.productionPlan.venueLayout ?? DEFAULT_VENUE_LAYOUT)
  const updateVenue = useStore(state => state.updateVenueLayout)
  const moveStageTo = useStore(state => state.moveStageTo)
  const updateSettings = useStore(state => state.updateSettings)
  const updateFixture = useStore(state => state.updateFixture)
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
    kind: 'block' | 'vertex' | 'stage' | 'size' | 'fixture'; id: string; pointerId: number; at: [number, number]; from: [number, number]; fromTarget?: [number, number]
  } | null>(null)
  const stageOffset = venue.stageOffset ?? [0, 0]
  const hasRearSeating = blocks.some(block => block.position[1] < -11)
  // 舞台と客席が図に収まる、いちばん近い縮尺を選ぶ（舞台を遠くへ動かしたときに、図の外へ消えないように）
  const points: Array<[number, number]> = [...stageFootprint(venue), ...blocks.flatMap(block => {
    const r = Math.hypot((block.seatsPerRow * block.seatSpacing) / 2, (block.rows * block.rowSpacing) / 2)
    return [[block.position[0] - r, block.position[1] - r], [block.position[0] + r, block.position[1] + r]] as Array<[number, number]>
  })]
  const fits = (view: { scale: number; centerZ: number }) => {
    const halfX = SVG_WIDTH / 2 / view.scale - 1
    const halfZ = SVG_HEIGHT / 2 / view.scale - 1
    return points.every(([x, z]) => Math.abs(x) <= halfX && Math.abs(z - view.centerZ) <= halfZ)
  }
  // 決まった 3 つの縮尺に収まらない大きな会場は、全体が収まる縮尺を計算する
  const fitAll = () => {
    const minZ = Math.min(...points.map(point => point[1]))
    const maxZ = Math.max(...points.map(point => point[1]))
    const maxX = Math.max(...points.map(point => Math.abs(point[0])))
    return { scale: Math.min(SVG_WIDTH / 2 / (maxX + 3), SVG_HEIGHT / (maxZ - minZ + 6)), centerZ: (minZ + maxZ) / 2 }
  }
  const autoView = !hasRearSeating && fits(VIEWS.near) ? VIEWS.near : fits(VIEWS.surround) ? VIEWS.surround : fits(VIEWS.wide) ? VIEWS.wide : fitAll()
  // ドラッグの間は縮尺を変えない（大きさを変えるたびに縮尺が変わると、取っ手が指から逃げる）
  const [frozenView, setFrozenView] = useState<{ scale: number; centerZ: number } | null>(null)
  const computedView = wideView ? (fits(VIEWS.wide) ? VIEWS.wide : fitAll()) : autoView
  const baseView = frozenView ?? computedView
  // 拡大・縮小と、図を動かした分（大きな床で、客席や舞台が 1 か所に固まって操作できないため。オーナー指摘、2026-11-16）
  const venueZoom = useMapZoom(svgRef, () => ({
    center: [centerX, centerZ],
    toWorld: (clientX, clientY) => worldPoint({ clientX, clientY }, svgRef.current!, scale, centerZ, centerX),
  }))
  const scale = baseView.scale * venueZoom.zoom
  const centerX = venueZoom.pan[0]
  const centerZ = baseView.centerZ + venueZoom.pan[1]
  /** 目盛りの間隔（m）。縮めて表示するほど広くする */
  const gridStep = scale >= 10 ? 5 : scale >= 4 ? 10 : scale >= 2 ? 25 : 50
  const mapX = (x: number) => SVG_WIDTH / 2 + (x - centerX) * scale
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

  const beginDrag = (event: PointerEvent<SVGGElement>, block: AudienceBlock) => {
    event.preventDefault()
    event.stopPropagation()
    setSelectedId(block.id)
    if (!moving || !svgRef.current) return
    const at = worldPoint(event, svgRef.current, scale, centerZ, centerX)
    setFrozenView(baseView)
    dragging.current = { kind: 'block', id: block.id, pointerId: event.pointerId, at, from: [...block.position] }
    svgRef.current?.setPointerCapture(event.pointerId)
  }
  const beginVertexDrag = (event: PointerEvent<SVGCircleElement>, index: number) => {
    event.preventDefault()
    event.stopPropagation()
    if (!svgRef.current) return
    setFrozenView(baseView)
    dragging.current = { kind: 'vertex', id: String(index), pointerId: event.pointerId,
      at: worldPoint(event, svgRef.current, scale, centerZ, centerX), from: [...outline[index]] }
    svgRef.current.setPointerCapture(event.pointerId)
  }
  const beginStageDrag = (event: PointerEvent<SVGPolygonElement>) => {
    event.preventDefault()
    event.stopPropagation()
    select('stage', 'stage')
    // 移動の道具でなければ、舞台の上のドラッグは図を動かす（大きな床では、図のほとんどが舞台になる）
    if (!moving || !svgRef.current) { if (event.button === 0) venueZoom.beginPan(event); return }
    setFrozenView(baseView)
    dragging.current = { kind: 'stage', id: '', pointerId: event.pointerId,
      at: worldPoint(event, svgRef.current, scale, centerZ, centerX), from: [...stageOffset] }
    svgRef.current.setPointerCapture(event.pointerId)
  }
  /** 舞台の中心（舞台の座標で z = -3）。大きさの取っ手は、この中心から左右・前後に同じだけ広げる */
  const stageCenter: [number, number] = [stageOffset[0], stageOffset[1] - 3]
  const beginSizeDrag = (event: PointerEvent<SVGGElement>, axis: 'width' | 'depth') => {
    event.preventDefault()
    event.stopPropagation()
    if (!svgRef.current) return
    setFrozenView(baseView)
    dragging.current = { kind: 'size', id: axis, pointerId: event.pointerId,
      at: worldPoint(event, svgRef.current, scale, centerZ, centerX), from: [venue.stageWidth, venue.stageDepth] }
    svgRef.current.setPointerCapture(event.pointerId)
  }
  const resizeStage = (axis: 'width' | 'depth', value: number) => {
    const size = Math.round(clamp(value, STAGE_SIZE.min, axis === 'width' ? STAGE_SIZE.maxWidth : STAGE_SIZE.maxDepth) * 2) / 2
    updateVenue(venue.stageShape === 'round' ? { stageWidth: size, stageDepth: size } : axis === 'width' ? { stageWidth: size } : { stageDepth: size })
  }
  // 照明の吊る位置（全シーン共通）。狙いも同じだけ動かして、向きを保つ
  const beginFixtureDrag = (event: PointerEvent<SVGGElement>, id: string) => {
    event.preventDefault()
    event.stopPropagation()
    select('fixture', id)
    const fixture = useStore.getState().fixtures.find(item => item.id === id)
    if (!moving || !svgRef.current || !fixture) return
    setFrozenView(baseView)
    dragging.current = { kind: 'fixture', id, pointerId: event.pointerId,
      at: worldPoint(event, svgRef.current, scale, centerZ, centerX),
      from: [fixture.position[0], fixture.position[2]], fromTarget: [fixture.target[0], fixture.target[2]] }
    svgRef.current.setPointerCapture(event.pointerId)
  }
  const moveDrag = (event: PointerEvent<SVGSVGElement>) => {
    const drag = dragging.current
    if (!drag || drag.pointerId !== event.pointerId) return
    const [x, z] = worldPoint(event, event.currentTarget, scale, centerZ, centerX)
    if (drag.kind === 'fixture') {
      const fixture = useStore.getState().fixtures.find(item => item.id === drag.id)
      if (!fixture || !drag.fromTarget) return
      const dx = Math.round((x - drag.at[0]) * 10) / 10, dz = Math.round((z - drag.at[1]) * 10) / 10
      updateFixture(fixture.id, {
        position: [clamp(drag.from[0] + dx, THEATRE.minX, THEATRE.maxX), fixture.position[1], clamp(drag.from[1] + dz, THEATRE.minZ, THEATRE.maxZ)],
        target: [clamp(drag.fromTarget[0] + dx, THEATRE.minX, THEATRE.maxX), fixture.target[1], clamp(drag.fromTarget[1] + dz, THEATRE.minZ, THEATRE.maxZ)],
      })
      return
    }
    if (drag.kind === 'size') {
      // 押した点からの動きの 2 倍だけ広げる（中心を挟んで両側に広がるため）
      if (drag.id === 'width') resizeStage('width', drag.from[0] + 2 * Math.sign(drag.at[0] - stageCenter[0] || 1) * (x - drag.at[0]))
      else resizeStage('depth', drag.from[1] + 2 * Math.sign(drag.at[1] - stageCenter[1] || 1) * (z - drag.at[1]))
      return
    }
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
        Math.round(clamp(drag.from[0] + x - drag.at[0], THEATRE.minX, THEATRE.maxX) * 10) / 10 - stageOffset[0],
        Math.round(clamp(drag.from[1] + z - drag.at[1], THEATRE.minZ, THEATRE.maxZ) * 10) / 10 - stageOffset[1],
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
    if (dragging.current?.pointerId === event.pointerId) { dragging.current = null; setFrozenView(null) }
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId)
  }
  const createBlock = () => {
    const id = addBlock()
    if (id) setSelectedId(id)
  }

  const viewChanged = venueZoom.zoom !== 1 || venueZoom.pan[0] !== 0 || venueZoom.pan[1] !== 0
  return <>
    <div className="plan-map-layerbar venue-map-bar" role="group" aria-label="会場の図の操作">
      <span>配置済み {seatCount} 席{venue.targetCapacity > 0 ? ` ／ 目標 ${venue.targetCapacity} 席` : ''}・全シーン共通</span>
      <button type="button" className="venue-map-action" onClick={createBlock} disabled={blocks.length >= 16}>＋ 客席</button>
      <button type="button" className="venue-map-action" onClick={() => updateSettings({ cameraView: 'house' })} disabled={!blocks.length}>3Dで客席を見る</button>
      <div className="plan-map-zoom" role="group" aria-label="会場の図の縮尺">
        <button type="button" aria-label="縮小" title="縮小（ホイールでも変えられます）" onClick={() => venueZoom.zoomBy(1 / 1.5)}>−</button>
        <button type="button" aria-label="拡大" title="拡大（ホイールでも変えられます）" onClick={() => venueZoom.zoomBy(1.5)}>＋</button>
        <button type="button" className={!viewChanged && !wideView ? 'active' : ''} aria-pressed={!viewChanged && !wideView}
          title="舞台と客席が収まるように、縮尺を自動で合わせます。何も無い所をドラッグすると、図を動かせます"
          onClick={() => { venueZoom.reset(); setWideView(false) }}>自動</button>
        <button type="button" className={!viewChanged && wideView ? 'active' : ''} aria-pressed={!viewChanged && wideView}
          onClick={() => { venueZoom.reset(); setWideView(true) }}>劇場全体</button>
      </div>
    </div>
    <div className="plan-map-scroll venue-map-scroll">
          <svg ref={svgRef} xmlns="http://www.w3.org/2000/svg" viewBox={`0 0 ${SVG_WIDTH} ${SVG_HEIGHT}`}
            aria-label="舞台と客席の平面図。舞台、客席と自由形状の頂点をドラッグして配置できます"
            style={{ touchAction: 'none' }}
            onPointerDownCapture={event => {
              // ホイールを押してのドラッグは、どこでも図を動かす
              if (event.button !== 1) return
              event.preventDefault()
              event.stopPropagation()
              venueZoom.beginPan(event)
            }}
            onPointerDown={event => {
              // 何も無い所のドラッグは図を動かす。舞台や客席の上は、それぞれの側で止めている
              if (event.button !== 0) return
              venueZoom.beginPan(event)
            }}
            onPointerMove={moveDrag} onPointerUp={endDrag} onPointerCancel={endDrag}
            onContextMenu={event => {
              // 右クリック: 舞台・客席・部品の上ならその物の、何も無い所なら「ここに足す」のメニュー（ObjectContextMenu.tsx）
              event.preventDefault()
              const item = (event.target as Element).closest<SVGElement>('[data-menu-kind]')
              const kind = item?.dataset.menuKind as 'audience' | 'stage' | 'stagepart' | undefined
              const [x, z] = worldPoint(event, event.currentTarget, scale, centerZ, centerX)
              useObjectMenu.getState().open({ x: event.clientX, y: event.clientY,
                target: kind && item?.dataset.menuId ? { kind, id: item.dataset.menuId } : null,
                point: !kind || kind === 'stage' ? [Math.round(x * 10) / 10, 0, Math.round(z * 10) / 10] : undefined })
            }}>
            <rect width={SVG_WIDTH} height={SVG_HEIGHT} fill="#ede8df" />
            {Array.from({ length: 80 }, (_, index) => (Math.ceil((centerZ - SVG_HEIGHT / 2 / scale) / gridStep) + index) * gridStep).filter(z => mapY(z) > 25 && mapY(z) < SVG_HEIGHT - 25)
              .map(z => <g key={z}>
                <line x1="42" x2={SVG_WIDTH - 42} y1={mapY(z)} y2={mapY(z)} stroke="#d2c9bd" strokeDasharray="5 9" />
                <text x="45" y={mapY(z) - 5} fill="#73695e" fontSize="12">z {z}m</text>
              </g>)}
            <polygon points={stagePoints} fill="#423d3a" strokeWidth="4" data-menu-kind="stage" data-menu-id="stage"
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
            {blocks.map(block => <g key={block.id} role="button" tabIndex={0} data-menu-kind="audience" data-menu-id={block.id}
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
            {fixtures.map((fixture, index) => {
              const active = selection.kind === 'fixture' && selection.id === fixture.id
              return <g key={fixture.id} role="button" tabIndex={0} data-menu-kind="fixture" data-menu-id={fixture.id}
                aria-label={`${fixture.name}の吊る位置を動かす（全シーン共通）`}
                style={{ cursor: moving ? 'grab' : 'pointer', touchAction: 'none' }}
                onPointerDown={event => beginFixtureDrag(event, fixture.id)}>
                <title>{fixture.name}</title>
                <circle cx={mapX(fixture.position[0])} cy={mapY(fixture.position[2])} r="18" fill="transparent" />
                <circle cx={mapX(fixture.position[0])} cy={mapY(fixture.position[2])} r="11"
                  fill={active ? '#c8482d' : '#d59a45'} stroke={active ? '#fff4e5' : '#4c3321'} strokeWidth="2" />
                <text x={mapX(fixture.position[0])} y={mapY(fixture.position[2]) + 4} textAnchor="middle" fill="#1f160e"
                  fontSize="11" fontWeight="700" pointerEvents="none">{index + 1}</text>
              </g>
            })}
            {<StagePartsLayer selectedId={partId} onSelect={setPartId} tool={tool} onPan={venueZoom.beginPan}
              toWorld={event => worldPoint(event, svgRef.current!, scale, centerZ, centerX)} mapX={mapX} mapY={mapY}
              unitsPerPx={SVG_WIDTH / (svgRef.current?.clientWidth || SVG_WIDTH)} />}
            {resizing && selection.kind === 'stage' && venue.stageShape !== 'custom' && ([
              { axis: 'width' as const, at: [stageCenter[0] + venue.stageWidth / 2, stageCenter[1]] as [number, number], label: venue.stageShape === 'round' ? '直径' : '幅', cursor: 'ew-resize' },
              ...(venue.stageShape === 'round' ? [] : [{ axis: 'depth' as const, at: [stageCenter[0], stageCenter[1] + venue.stageDepth / 2] as [number, number], label: '奥行', cursor: 'ns-resize' }]),
            ]).map(handle => <g key={handle.axis} role="button" tabIndex={0}
              aria-label={`舞台の${handle.label}をドラッグして変える。矢印キーでも変えられます`}
              style={{ cursor: handle.cursor, touchAction: 'none' }}
              onPointerDown={event => beginSizeDrag(event, handle.axis)}
              onKeyDown={event => {
                const step = event.key === 'ArrowRight' || event.key === 'ArrowDown' ? 1 : event.key === 'ArrowLeft' || event.key === 'ArrowUp' ? -1 : 0
                if (!step) return
                event.preventDefault()
                resizeStage(handle.axis, (handle.axis === 'width' ? venue.stageWidth : venue.stageDepth) + step)
              }}>
              <circle cx={mapX(handle.at[0])} cy={mapY(handle.at[1])} r="22" fill="transparent" />
              <circle cx={mapX(handle.at[0])} cy={mapY(handle.at[1])} r="10" fill="#f2c27b" stroke="#3d2a17" strokeWidth="3" />
            </g>)}
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
                vertices[index] = [clamp(x + delta[0], THEATRE.minX, THEATRE.maxX), clamp(z + delta[1], THEATRE.minZ, THEATRE.maxZ)]
                updateVenue({ stageVertices: vertices.map(([px, pz]) => [px - stageOffset[0], pz - stageOffset[1]]) })
              }} />)}
          </svg>
    </div>
    <div className="audience-editor-legend venue-map-legend">
      <span>■ 客席</span><span>━ 壁</span><span>╍ バトン</span><span>● 照明の吊る位置</span>
      <span>{tool === 'select' ? '選ぶだけの道具です。動かすときは上の「移動」、大きさは「拡大」'
        : tool === 'translate' ? '舞台・客席・部品・照明をドラッグして移動。どれも全シーンで変わります'
          : tool === 'scale' ? '選んだ舞台・部品に出る金色の点をドラッグして大きさを変える（自由形状の舞台は角が出ます）'
            : '回転は 3D の画面か、右の数字で変えます'}</span>
      <span>ホイールで拡大・縮小。何も無い所のドラッグで図を動かす（「選択」の道具なら舞台の上でも）</span>
      {!blocks.length && <span>客席はまだありません（なくても使えます）</span>}
      {stageOverlap > 0 && <span className="venue-capacity-warning">{stageOverlap} 席が舞台と重なっています。客席の位置を調整してください。</span>}
      {protrudingSetPieces > 0 && <span className="venue-capacity-warning">いまのシーンで {protrudingSetPieces} 個の舞台セットが舞台の輪郭からはみ出しています。</span>}
    </div>
  </>
}
