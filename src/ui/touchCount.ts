/**
 * 画面に触れている指の数。2 本目の指が触れたら、1 本目で始めたドラッグ（物を動かす・図を動かす）をやめ、
 * 2 本指の拡大だけにする。やめないと、拡大のつもりで触れた役者や照明が動いてしまう（2026-11-19）
 */
const touching = new Set<number>()
if (typeof window !== 'undefined') {
  const down = (event: PointerEvent) => { if (event.pointerType === 'touch') touching.add(event.pointerId) }
  const up = (event: PointerEvent) => { touching.delete(event.pointerId) }
  // 部品の pointerdown より先に数えるため、window の capture で受ける
  window.addEventListener('pointerdown', down, true)
  window.addEventListener('pointerup', up, true)
  window.addEventListener('pointercancel', up, true)
}
export function multiTouch() { return touching.size >= 2 }
