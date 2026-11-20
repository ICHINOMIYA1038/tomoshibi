import type { Performer, StagePoint, VenueLayout } from './store'
import { DEFAULT_VENUE_LAYOUT, stageFootprint } from './venueLayout'
import { resolveStageParts } from './stageParts'

// 役者の出入り口（出ハケ）。2026-11-20 オーナー要望「ハケ位置って指定できる？」。
// 役者ごと・シーンごとに「このシーンへどこから入るか」「次のシーンへどこへハケるか」を選ぶ。
// 選ばなければ、前と同じく、いた位置に近い側の袖へ真横に出入りする。
// 上手は客席から見て右（x が正）、下手は左。袖の番号は、舞台の前から数えた袖幕のすき間（1 番袖がいちばん前）。
export type StagePortal =
  | 'kami-1' | 'kami-2' | 'kami-3'
  | 'shimo-1' | 'shimo-2' | 'shimo-3'
  | 'oku' | 'kyakuseki'

export const STAGE_PORTALS: { value: StagePortal; label: string }[] = [
  { value: 'kami-1', label: '上手 1 番袖' },
  { value: 'kami-2', label: '上手 2 番袖' },
  { value: 'kami-3', label: '上手 3 番袖' },
  { value: 'shimo-1', label: '下手 1 番袖' },
  { value: 'shimo-2', label: '下手 2 番袖' },
  { value: 'shimo-3', label: '下手 3 番袖' },
  { value: 'oku', label: '奥（ホリの裏）' },
  { value: 'kyakuseki', label: '客席（通路）' },
]

export function portalLabel(portal: StagePortal | undefined): string {
  return STAGE_PORTALS.find(item => item.value === portal)?.label ?? '自動（近い側の袖）'
}

/** 舞台の外の、出入り口の点（床の x・z）。portal が無ければ、いた位置に近い側の袖へ真横に */
export function portalPoint(layout: VenueLayout | undefined, portal: StagePortal | undefined, at: Performer['position']): StagePoint {
  const venue = layout ?? DEFAULT_VENUE_LAYOUT
  const outline = stageFootprint(venue)
  const left = Math.min(...outline.map(point => point[0]))
  const right = Math.max(...outline.map(point => point[0]))
  const rear = Math.min(...outline.map(point => point[1]))
  const front = Math.max(...outline.map(point => point[1]))
  const cx = (left + right) / 2
  // 袖の奥へ消える距離。前からの決まり（舞台幅 14m で 8.7m）を、舞台の幅に合わせて広げる
  const offX = Math.max(8.7, (right - left) / 2 + 1.7)
  if (!portal) return [cx + (at[0] < cx ? -1 : 1) * offX, at[2]]
  if (portal === 'oku') return [Math.max(left + 1, Math.min(right - 1, at[0])), rear - 0.3]
  if (portal === 'kyakuseki') return [cx, front + 3]
  const [side, number] = portal.split('-') as ['kami' | 'shimo', string]
  const sign = side === 'kami' ? 1 : -1
  return [cx + sign * offX, wingGapZ(venue, sign, Number(number), front, rear)]
}

/** その側の n 番目の袖のすき間の奥行き（z）。袖幕が無い舞台は、奥行きを 3 つに分けた真ん中 */
function wingGapZ(layout: VenueLayout, sign: number, n: number, front: number, rear: number): number {
  const [ox, oz] = layout.stageOffset ?? [0, 0]
  const cx = (Math.min(...stageFootprint(layout).map(p => p[0])) + Math.max(...stageFootprint(layout).map(p => p[0]))) / 2
  const wings = resolveStageParts(layout)
    .filter(part => part.kind === 'wing' && Math.sign(part.x + ox - cx) === sign)
    .map(part => part.z + oz)
    .sort((a, b) => b - a)
  if (!wings.length) return front - (front - rear) * (n - 0.5) / 3
  // すき間の前の端：1 番は舞台の前の端（額縁）、2 番からは一つ前の袖幕
  const edges = [front, ...wings, rear]
  const i = Math.min(n, edges.length - 1)
  return (edges[i - 1] + edges[i]) / 2
}
