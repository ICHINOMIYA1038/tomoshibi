import type { StagePoint, VenueLayout } from './store'

export const DEFAULT_VENUE_LAYOUT: VenueLayout = {
  stageShape: 'proscenium', stageWidth: 16, stageDepth: 12, targetCapacity: 0,
}

export function stageLocalFootprint(layout: VenueLayout = DEFAULT_VENUE_LAYOUT): StagePoint[] {
  if (layout.stageShape === 'custom' && (layout.stageVertices?.length ?? 0) >= 3) return layout.stageVertices!
  const width = layout.stageWidth
  const depth = layout.stageDepth
  const rear = -3 - depth / 2
  const front = -3 + depth / 2
  if (layout.stageShape === 'round') {
    return Array.from({ length: 64 }, (_, index) => {
      const angle = index * Math.PI * 2 / 64
      return [Math.cos(angle) * width / 2, -3 + Math.sin(angle) * width / 2]
    })
  }
  if (layout.stageShape === 'thrust') {
    const shoulder = rear + depth * .55
    return [[-width * .48, rear], [width * .48, rear], [width * .48, shoulder],
      [width * .25, shoulder], [width * .25, front], [-width * .25, front],
      [-width * .25, shoulder], [-width * .48, shoulder]]
  }
  return [[-width / 2, rear], [width / 2, rear], [width / 2, front], [-width / 2, front]]
}

export function stageFootprint(layout: VenueLayout = DEFAULT_VENUE_LAYOUT): StagePoint[] {
  const [dx, dz] = layout.stageOffset ?? [0, 0]
  return stageLocalFootprint(layout).map(([x, z]) => [x + dx, z + dz])
}

export function pointInStage(x: number, z: number, outline: StagePoint[]): boolean {
  let inside = false
  for (let index = 0, previous = outline.length - 1; index < outline.length; previous = index++) {
    const [ax, az] = outline[index]
    const [bx, bz] = outline[previous]
    if ((az > z) !== (bz > z) && x < (bx - ax) * (z - az) / (bz - az) + ax) inside = !inside
  }
  return inside
}

/**
 * 舞台・客席・部品を置ける範囲（m）。どんな会場でも収まるよう広くとる（オーナー指示、2026-11-16）。
 * 前は ±24m の箱で、舞台は 48m × 40m までしか広がらなかった
 */
export const THEATRE = { minX: -150, maxX: 150, minZ: -150, maxZ: 150, maxHeight: 40 } as const
/** 舞台の床の大きさの範囲（m）。上は THEATRE に収まる大きさ */
export const STAGE_SIZE = { min: 3, maxWidth: 280, maxDepth: 280 } as const
