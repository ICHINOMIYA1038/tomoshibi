import type { AudienceBlock } from './store'

export function audienceSeatPositions(block: AudienceBlock): [number, number][] {
  const angle = block.rotationDeg * Math.PI / 180
  const cosine = Math.cos(angle)
  const sine = Math.sin(angle)
  const seats: [number, number][] = []
  for (let row = 0; row < block.rows; row++) {
    const localZ = (row - (block.rows - 1) / 2) * block.rowSpacing
    for (let column = 0; column < block.seatsPerRow; column++) {
      const localX = (column - (block.seatsPerRow - 1) / 2) * block.seatSpacing
      seats.push([
        block.position[0] + cosine * localX + sine * localZ,
        block.position[1] - sine * localX + cosine * localZ,
      ])
    }
  }
  return seats
}

export function clampAudiencePosition(block: AudienceBlock, x: number, z: number): [number, number] {
  const angle = block.rotationDeg * Math.PI / 180
  const halfWidth = ((block.seatsPerRow - 1) * block.seatSpacing + .54) / 2
  const halfDepth = ((block.rows - 1) * block.rowSpacing + .5) / 2
  const extentX = Math.abs(Math.cos(angle)) * halfWidth + Math.abs(Math.sin(angle)) * halfDepth
  const extentZ = Math.abs(Math.sin(angle)) * halfWidth + Math.abs(Math.cos(angle)) * halfDepth
  const clamp = (value: number, low: number, high: number) => Math.min(high, Math.max(low, value))
  return [clamp(x, -24 + extentX, 24 - extentX), clamp(z, -21 + extentZ, 35 - extentZ)]
}

export function demoAudienceBlocks(): AudienceBlock[] {
  return [-3, 3].map((x, index) => ({
    id: `audience-demo-${index + 1}`,
    name: index === 0 ? '下手客席' : '上手客席',
    position: [x, 10.5] as [number, number],
    rows: 7, seatsPerRow: 6, rowSpacing: .9, seatSpacing: .62, rotationDeg: 0,
  }))
}
