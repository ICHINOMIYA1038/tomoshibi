import { create } from 'zustand'
import type { SelectionKind } from './store'

// 右クリックのメニュー（ObjectContextMenu.tsx）を開く場所と、そのとき指していた物。
// 3D の画面・ヒエラルキー・平面図から同じメニューを開く。

export type MenuTarget = { kind: Exclude<SelectionKind, null>; id: string }
export type MenuState = {
  x: number
  y: number
  /** 指していた物。何も無い所なら null */
  target: MenuTarget | null
  /** 床を指していたときの位置（世界の座標）。「ここに足す」に使う */
  point?: [number, number, number]
}

export const useObjectMenu = create<{ menu: MenuState | null; open: (menu: MenuState) => void; close: () => void }>(set => ({
  menu: null,
  open: menu => set({ menu }),
  close: () => set({ menu: null }),
}))

// 3D の画面では、右ボタンを押してドラッグすると視点が動く。押して離しただけのときにメニューを開く。
// 何を指していたかは、three.js の物の onContextMenu（recordHit）で覚えておく。
// contextmenu は macOS では押したとき、Windows では離したときに来るので、離してから少し待って開く
let pending: { target: MenuTarget | null; point?: [number, number, number]; at: number } | null = null

export function recordHit(target: MenuTarget | null, point?: [number, number, number]) {
  // 手前の物が先に届く。いちばん手前のものだけを使う
  if (pending && performance.now() - pending.at < 50 && pending.target) return
  pending = { target, point, at: performance.now() }
}

let pressed: { x: number; y: number } | null = null

export function canvasPointerDown(event: PointerEvent | React.PointerEvent) {
  if (event.button !== 2) return
  pressed = { x: event.clientX, y: event.clientY }
  pending = null
}

export function canvasPointerUp(event: PointerEvent | React.PointerEvent) {
  if (event.button !== 2 || !pressed) return
  const moved = Math.hypot(event.clientX - pressed.x, event.clientY - pressed.y)
  pressed = null
  if (moved > 5) return
  const { clientX: x, clientY: y } = event
  window.setTimeout(() => {
    const hit = pending && performance.now() - pending.at < 1500 ? pending : null
    pending = null
    useObjectMenu.getState().open({ x, y, target: hit?.target ?? null, point: hit?.point })
  }, 40)
}
