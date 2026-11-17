import { useRef, useState, type PointerEvent } from 'react'
import { useStore, type StagePoint } from '../store'
import { DEFAULT_VENUE_LAYOUT, stageFootprint } from '../venueLayout'

// 自由形状の舞台の形を、設定の欄の中で変える小さな図（2026-11-18 オーナー「設定画面から編集までスムーズに。平面図でできる必要もない」）。
// 上から見た舞台の輪郭に金色の角の点を出し、点を引っぱると形が変わる。下が客席側。1 m ごとに薄い線を引く。
// 引いているあいだは図の縮尺を止める（動かすたびに縮尺が変わると、指の下から点が逃げる）

const W = 300, H = 210, PAD = 22
const round1 = (value: number) => Math.round(value * 10) / 10

type Frame = { minX: number; minZ: number; scale: number }
function frameOf(points: StagePoint[]): Frame {
  const xs = points.map(([x]) => x), zs = points.map(([, z]) => z)
  const minX = Math.min(...xs) - 1, maxX = Math.max(...xs) + 1
  const minZ = Math.min(...zs) - 1, maxZ = Math.max(...zs) + 1
  const scale = Math.min((W - PAD * 2) / (maxX - minX), (H - PAD * 2) / (maxZ - minZ))
  return { minX: minX - ((W - PAD * 2) / scale - (maxX - minX)) / 2, minZ: minZ - ((H - PAD * 2) / scale - (maxZ - minZ)) / 2, scale }
}

export function StageShapeEditor() {
  const layout = useStore(s => s.productionPlan.venueLayout ?? DEFAULT_VENUE_LAYOUT)
  const outline = stageFootprint(layout)
  const [frozen, setFrozen] = useState<Frame | null>(null)
  const [active, setActive] = useState<number | null>(null)
  const svgRef = useRef<SVGSVGElement>(null)
  const frame = frozen ?? frameOf(outline)
  const sx = (x: number) => PAD + (x - frame.minX) * frame.scale
  const sy = (z: number) => PAD + (z - frame.minZ) * frame.scale

  const toWorld = (event: PointerEvent<SVGElement>, f: Frame): StagePoint => {
    const svg = svgRef.current!
    const rect = svg.getBoundingClientRect()
    const px = (event.clientX - rect.left) * W / rect.width
    const py = (event.clientY - rect.top) * H / rect.height
    return [round1(f.minX + (px - PAD) / f.scale), round1(f.minZ + (py - PAD) / f.scale)]
  }
  const begin = (event: PointerEvent<SVGCircleElement>, index: number) => {
    event.preventDefault()
    event.stopPropagation()
    ;(event.currentTarget as Element).setPointerCapture(event.pointerId)
    setFrozen(frame)
    setActive(index)
  }
  const move = (event: PointerEvent<SVGCircleElement>, index: number) => {
    if (active !== index || !frozen) return
    const s = useStore.getState()
    const current = s.productionPlan.venueLayout ?? DEFAULT_VENUE_LAYOUT
    const offset = current.stageOffset ?? [0, 0]
    const point = toWorld(event, frozen)
    const vertices = stageFootprint(current).map((p, at) => at === index ? point : p)
    s.updateVenueLayout({ stageVertices: vertices.map(([x, z]) => [round1(x - offset[0]), round1(z - offset[1])] as StagePoint) })
  }
  const end = () => { setActive(null); setFrozen(null) }

  const grid: number[] = []
  for (let x = Math.ceil(frame.minX); x <= frame.minX + (W - PAD) / frame.scale; x++) grid.push(x)
  const gridZ: number[] = []
  for (let z = Math.ceil(frame.minZ); z <= frame.minZ + (H - PAD) / frame.scale; z++) gridZ.push(z)
  const point = active !== null ? outline[active] : null

  return <div className="stage-shape-editor">
    <svg ref={svgRef} viewBox={`0 0 ${W} ${H}`} role="img" aria-label="舞台の形（上から見た図。下が客席側）">
      <rect x="0" y="0" width={W} height={H} fill="#141114" />
      {grid.map(x => <line key={'gx' + x} x1={sx(x)} x2={sx(x)} y1="0" y2={H} stroke="rgba(255,255,255,.07)" />)}
      {gridZ.map(z => <line key={'gz' + z} y1={sy(z)} y2={sy(z)} x1="0" x2={W} stroke="rgba(255,255,255,.07)" />)}
      <polygon points={outline.map(([x, z]) => `${sx(x)},${sy(z)}`).join(' ')} fill="rgba(224,180,92,.16)" stroke="#e0b45c" strokeWidth="2" />
      <text x={W / 2} y={H - 5} textAnchor="middle" fontSize="10" fill="rgba(255,255,255,.45)">客席側</text>
      {outline.map(([x, z], index) => <circle key={index} cx={sx(x)} cy={sy(z)} r={active === index ? 11 : 9}
        fill="#e0b45c" stroke="#14110d" strokeWidth="2" style={{ cursor: 'move', touchAction: 'none' }}
        role="button" aria-label={`角 ${index + 1}。引っぱると形が変わります`}
        onPointerDown={event => begin(event, index)} onPointerMove={event => move(event, index)}
        onPointerUp={end} onPointerCancel={end} />)}
    </svg>
    <p className="inspector-note">{point ? `角 ${(active ?? 0) + 1}：X ${point[0]}m・Z ${point[1]}m` : '金色の点を引っぱると、舞台の形が変わります（下が客席側、線は 1 m ごと）。'}</p>
  </div>
}
