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
