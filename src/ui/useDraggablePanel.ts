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

    const onMove = (clientX: number, clientY: number) => {
      if (!drag.current) return
      const panel = panelRef.current
      const w = panel?.offsetWidth ?? 300
      const h = panel?.offsetHeight ?? 200
      const maxX = window.innerWidth - 40
      const maxY = window.innerHeight - 40
      const x = Math.max(-w + 80, Math.min(maxX, clientX - drag.current.ox))
      const y = Math.max(0, Math.min(maxY, clientY - drag.current.oy))
      setPos({ x, y })
    }

    const onMouseMove = (e: MouseEvent) => onMove(e.clientX, e.clientY)
    const onTouchMove = (e: TouchEvent) => {
      if (e.touches[0]) onMove(e.touches[0].clientX, e.touches[0].clientY)
    }
    const stop = () => {
      if (drag.current) {
        drag.current = null
        document.removeEventListener('mousemove', onMouseMove)
        document.removeEventListener('mouseup', stop)
        document.removeEventListener('touchmove', onTouchMove)
        document.removeEventListener('touchend', stop)
        setPos(p => { savePos(id, p); return p })
      }
    }
    const onMouseDown = (e: MouseEvent) => {
      const panel = panelRef.current
      if (!panel) return
      const rect = panel.getBoundingClientRect()
      drag.current = { ox: e.clientX - rect.left, oy: e.clientY - rect.top }
      document.addEventListener('mousemove', onMouseMove)
      document.addEventListener('mouseup', stop)
    }
    const onTouchStart = (e: TouchEvent) => {
      const panel = panelRef.current
      const t = e.touches[0]
      if (!panel || !t) return
      const rect = panel.getBoundingClientRect()
      drag.current = { ox: t.clientX - rect.left, oy: t.clientY - rect.top }
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
