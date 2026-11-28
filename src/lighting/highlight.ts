import type { Fixture } from '../store'

/**
 * 「この器具の光だけ見る」（調光卓のハイライトと同じ）。選んだ器具だけを点け、ほかを消して描く。
 * 公演のデータ（キュー）は書き換えない。見え方だけの一時的な表示（2026-11-21 オーナー）
 * 選んだ器具がこのシーンで消えているか 0 のときも、どこを照らすかが見えるよう 60% で点ける
 */
export const HIGHLIGHT_FALLBACK_LEVEL = 0.6

export function highlightFixtures(fixtures: Fixture[], id: string | null): Fixture[] {
  if (!id || !fixtures.some(item => item.id === id)) return fixtures
  return fixtures.map(item => item.id === id
    ? { ...item, enabled: true, intensity: item.enabled && item.intensity > 0 ? item.intensity : HIGHLIGHT_FALLBACK_LEVEL }
    : { ...item, enabled: false })
}

/**
 * 初めての人の案内（FirstStageCoach）で、1 段ずつ明かりを入れて見せる。mask にない器具は消して描く。
 * highlightFixtures と同じく見え方だけで、公演のデータ（キュー）は書き換えない
 */
export function maskFixtures(fixtures: Fixture[], mask: string[] | null, rise: { ids: string[]; level: number; dim?: number } | null = null): Fixture[] {
  if (!mask) return fixtures
  const lit = new Set(mask)
  const rising = new Set(rise?.ids ?? [])
  const riseLevel = rise && rise.level < 1 ? Math.max(0, rise.level) : 1
  // dim: いま入れている器具のほかを、この割合まで落とす（ピンで二人だけを浮かせる）
  const dim = rise?.dim ?? 1
  return fixtures.map(item => !lit.has(item.id) ? { ...item, enabled: false }
    : rising.has(item.id) ? (riseLevel < 1 ? { ...item, intensity: item.intensity * riseLevel } : item)
    : dim < 1 ? { ...item, intensity: item.intensity * dim } : item)
}
