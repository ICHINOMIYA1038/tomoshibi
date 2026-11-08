import type { StagePoint, VenueLayout } from './store'

export const DEFAULT_VENUE_LAYOUT: VenueLayout = {
  stageShape: 'proscenium', stageWidth: 16, stageDepth: 12, targetCapacity: 0,
}

export function stageFootprint(layout: VenueLayout = DEFAULT_VENUE_LAYOUT): StagePoint[] {
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

export function pointInStage(x: number, z: number, outline: StagePoint[]): boolean {
  let inside = false
  for (let index = 0, previous = outline.length - 1; index < outline.length; previous = index++) {
    const [ax, az] = outline[index]
    const [bx, bz] = outline[previous]
    if ((az > z) !== (bz > z) && x < (bx - ax) * (z - az) / (bz - az) + ax) inside = !inside
  }
  return inside
}
