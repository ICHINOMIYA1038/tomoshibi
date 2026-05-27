import { useEffect, useRef, useState } from 'react'

export interface PanelPos { x: number; y: number } // 画面左上からのオフセット (px)

const storageKey = (id: string) => `tomoshibi.panelPos.${id}`

function loadPos(id: string, fallback: PanelPos): PanelPos {
  try {
    const raw = localStorage.getItem(storageKey(id))
    if (!raw) return fallback
    const p = JSON.parse(raw)
    if (typeof p.x === 'number' && typeof p.y === 'number') return p
  } catch { /* ignore */ }
  return fallback
}
function savePos(id: string, p: PanelPos) {
  try { localStorage.setItem(storageKey(id), JSON.stringify(p)) } catch { /* ignore */ }
}

/**
 * パネルの位置をマウス/タッチでドラッグ可能にするフック。
 * - 位置は localStorage に永続化 (id ごと)
 * - ハンドル (DOM 要素) をドラッグすると position fixed のパネルが移動
 * - 画面外に飛ばないようクランプ
 */
export function useDraggablePanel(id: string, defaultPos: PanelPos) {
  const [pos, setPos] = useState<PanelPos>(() =>
    typeof window === 'undefined' ? defaultPos : loadPos(id, defaultPos)
  )
  const handleRef = useRef<HTMLDivElement | null>(null)
  const panelRef = useRef<HTMLDivElement | null>(null)
  const drag = useRef<{ ox: number; oy: number } | null>(null)

  useEffect(() => {
    const handle = handleRef.current
    if (!handle) return

    // 子要素のボタンや input が押された時はドラッグ開始しない
    const isInteractive = (target: EventTarget | null) => {
      const el = target as HTMLElement | null
      if (!el) return false
      const tag = el.closest('button, a, input, select, textarea, label')
      return !!tag
    }

    const clamp = (clientX: number, clientY: number, ox: number, oy: number) => {
      const panel = panelRef.current
      const w = panel?.offsetWidth ?? 300
      const h = panel?.offsetHeight ?? 200
      const x = Math.max(-w + 120, Math.min(window.innerWidth - 120, clientX - ox))
      const y = Math.max(0, Math.min(window.innerHeight - 60, clientY - oy))
      return { x, y, h }
    }

    const onMouseMove = (e: MouseEvent) => {
      if (!drag.current) return
      e.preventDefault()
      const { x, y } = clamp(e.clientX, e.clientY, drag.current.ox, drag.current.oy)
      setPos({ x, y })
    }
    const onTouchMove = (e: TouchEvent) => {
      const t = e.touches[0]
      if (!drag.current || !t) return
      e.preventDefault()
      const { x, y } = clamp(t.clientX, t.clientY, drag.current.ox, drag.current.oy)
      setPos({ x, y })
    }
    const stop = () => {
      if (drag.current) {
        drag.current = null
        document.body.classList.remove('panel-dragging')
        document.removeEventListener('mousemove', onMouseMove)
        document.removeEventListener('mouseup', stop)
        document.removeEventListener('touchmove', onTouchMove)
        document.removeEventListener('touchend', stop)
        setPos(p => { savePos(id, p); return p })
      }
    }
    const onMouseDown = (e: MouseEvent) => {
      if (isInteractive(e.target)) return
      const panel = panelRef.current
      if (!panel) return
      e.preventDefault()
      const rect = panel.getBoundingClientRect()
      drag.current = { ox: e.clientX - rect.left, oy: e.clientY - rect.top }
      document.body.classList.add('panel-dragging')
      document.addEventListener('mousemove', onMouseMove)
      document.addEventListener('mouseup', stop)
    }
    const onTouchStart = (e: TouchEvent) => {
      if (isInteractive(e.target)) return
      const panel = panelRef.current
      const t = e.touches[0]
      if (!panel || !t) return
      const rect = panel.getBoundingClientRect()
      drag.current = { ox: t.clientX - rect.left, oy: t.clientY - rect.top }
      document.body.classList.add('panel-dragging')
      document.addEventListener('touchmove', onTouchMove, { passive: false })
      document.addEventListener('touchend', stop)
    }

    handle.addEventListener('mousedown', onMouseDown)
    handle.addEventListener('touchstart', onTouchStart, { passive: true })
    return () => {
      handle.removeEventListener('mousedown', onMouseDown)
      handle.removeEventListener('touchstart', onTouchStart)
      stop()
    }
  }, [id])

  return {
    pos,
    panelProps: {
      ref: panelRef,
      style: { left: pos.x, top: pos.y } as React.CSSProperties,
    },
    handleProps: {
      ref: handleRef,
    },
  }
}
