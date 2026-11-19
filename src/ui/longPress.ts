import { openFromPendingHit } from '../objectMenu'
import { multiTouch } from './touchCount'

/**
 * 指で長押しすると、右クリックと同じメニューを開く（平面図・一覧・3D）。
 * iPhone は長押しで contextmenu を送らないので、自分で送る。スマホで複製・削除・名前の変更が遠回りだった（2026-11-19 の動作確認）
 */
const HOLD_MS = 550
const SLOP_PX = 8

export function installLongPress() {
  if (typeof window === 'undefined') return
  let timer = 0
  let start: { x: number; y: number; target: EventTarget | null } | null = null
  let fired = false
  const clear = () => { window.clearTimeout(timer); timer = 0; start = null }
  window.addEventListener('pointerdown', event => {
    if (event.pointerType !== 'touch') return
    clear()
    fired = false
    if (multiTouch()) return
    start = { x: event.clientX, y: event.clientY, target: event.target }
    timer = window.setTimeout(() => {
      const s = start
      clear()
      if (!s || multiTouch() || !(s.target instanceof Element)) return
      // 文字の入力欄やボタンの上では、いつもの長押し（文字の選択など）に任せる
      if (s.target.closest('input, textarea, select, [contenteditable="true"]')) return
      fired = true
      s.target.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true, clientX: s.x, clientY: s.y, button: 2 }))
      if (s.target.closest('canvas')) openFromPendingHit(s.x, s.y)
      navigator.vibrate?.(10)
    }, HOLD_MS)
  }, true)
  window.addEventListener('pointermove', event => {
    if (!start || event.pointerType !== 'touch') return
    if (Math.hypot(event.clientX - start.x, event.clientY - start.y) > SLOP_PX) clear()
  }, true)
  const end = () => clear()
  window.addEventListener('pointerup', end, true)
  window.addEventListener('pointercancel', end, true)
  // メニューを開いた長押しのあとの click は、下の物には渡さない（選び直しや道具の切り替えが起きないように）
  window.addEventListener('click', event => {
    if (!fired) return
    fired = false
    event.preventDefault()
    event.stopPropagation()
  }, true)
}
