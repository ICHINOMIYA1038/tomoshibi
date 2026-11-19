import { useCallback, useEffect, useRef, useState, type RefObject } from 'react'
import type { StagePoint } from '../store'
import { multiTouch } from './touchCount'

/** 図（平面図の「シーン」と「会場」）の拡大と、図を動かす量。どちらも「最初の縮尺」からの差で持つ */
export type MapZoom = { zoom: number; pan: StagePoint }

const MIN_ZOOM = .25
const MAX_ZOOM = 40

/**
 * 平面の図を拡大・縮小し、何も無い所のドラッグで動かす（床をとても大きくすると、物が 1 か所に固まって操作できない。
 * オーナー指摘、2026-11-16）。
 * view() は、いまの図の中心（世界の座標）と、画面の点を世界の座標に直す関数を返す。ホイールで拡大するとき、
 * カーソルの下の点を動かさないのに使う
 */
export function useMapZoom(svgRef: RefObject<SVGSVGElement | null>, view: () => { center: StagePoint; toWorld: (clientX: number, clientY: number) => StagePoint }) {
  const [state, setState] = useState<MapZoom>({ zoom: 1, pan: [0, 0] })
  const viewRef = useRef(view)
  viewRef.current = view
  const stateRef = useRef(state)
  stateRef.current = state
  // 2 本指の間の長さ。下の useEffect は描き直すたびに付け直すので、指の途中の値はここに持つ。
  // 関数の中の変数にすると、拡大して描き直すたびに消え、1 回の操作で 1 段しか大きくならなかった（2026-11-19）
  const pinchRef = useRef<number | null>(null)

  /** anchor（世界の座標）を画面上で動かさずに、拡大率を factor 倍する */
  const zoomBy = useCallback((factor: number, anchor?: StagePoint) => {
    const { zoom, pan } = stateRef.current
    const next = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, zoom * factor))
    if (next === zoom) return
    const { center } = viewRef.current()
    const point = anchor ?? center
    // 中心 c・拡大 z で点 p が画面に出る位置は (p - c) * z。これを変えない中心は c' = p - (p - c) * z / z'
    const keep = 1 - zoom / next
    setState({ zoom: next, pan: [pan[0] + (point[0] - center[0]) * keep, pan[1] + (point[1] - center[1]) * keep] })
  }, [])

  const reset = useCallback(() => setState({ zoom: 1, pan: [0, 0] }), [])

  // ホイール（トラックパッドのピンチを含む）で拡大する。React の onWheel は passive で、ページのスクロールを止められない
  useEffect(() => {
    const svg = svgRef.current
    if (!svg) return
    const onWheel = (event: WheelEvent) => {
      event.preventDefault()
      const delta = event.deltaMode === 1 ? event.deltaY * 16 : event.deltaY
      zoomBy(Math.exp(-delta * (event.ctrlKey ? .01 : .0025)), viewRef.current().toWorld(event.clientX, event.clientY))
    }
    svg.addEventListener('wheel', onWheel, { passive: false })
    // 2 本指で広げる・つまむと拡大・縮小する（スマホ・タブレット。2026-11-17 オーナー指摘）。2 本の指の真ん中を動かさない
    const spread = (touches: TouchList) => Math.hypot(touches[0].clientX - touches[1].clientX, touches[0].clientY - touches[1].clientY)
    const onTouchStart = (event: TouchEvent) => { if (event.touches.length === 2) pinchRef.current = spread(event.touches) }
    const onTouchMove = (event: TouchEvent) => {
      const pinch = pinchRef.current
      if (event.touches.length !== 2 || pinch === null) return
      event.preventDefault()
      const now = spread(event.touches)
      if (!pinch || !now) return
      const midX = (event.touches[0].clientX + event.touches[1].clientX) / 2
      const midY = (event.touches[0].clientY + event.touches[1].clientY) / 2
      zoomBy(now / pinch, viewRef.current().toWorld(midX, midY))
      pinchRef.current = now
    }
    const onTouchEnd = (event: TouchEvent) => { if (event.touches.length < 2) pinchRef.current = null }
    svg.addEventListener('touchstart', onTouchStart, { passive: true })
    svg.addEventListener('touchmove', onTouchMove, { passive: false })
    svg.addEventListener('touchend', onTouchEnd)
    svg.addEventListener('touchcancel', onTouchEnd)
    return () => {
      svg.removeEventListener('wheel', onWheel)
      svg.removeEventListener('touchstart', onTouchStart)
      svg.removeEventListener('touchmove', onTouchMove)
      svg.removeEventListener('touchend', onTouchEnd)
      svg.removeEventListener('touchcancel', onTouchEnd)
    }
  })

  /** 何も無い所を押したときに呼ぶ。ドラッグした分だけ図を動かす。動かさずに離したときは onTap を呼ぶ */
  const beginPan = useCallback((event: { pointerId: number; clientX: number; clientY: number }, onTap?: () => void) => {
    const start = viewRef.current().toWorld(event.clientX, event.clientY)
    const from = stateRef.current.pan
    const startClient: StagePoint = [event.clientX, event.clientY]
    let moved = false
    const move = (next: PointerEvent) => {
      if (next.pointerId !== event.pointerId) return
      // 2 本目の指が触れたら、図を動かすのはやめて拡大に任せる
      if (multiTouch()) { finish(); return }
      if (!moved && Math.hypot(next.clientX - startClient[0], next.clientY - startClient[1]) < 4) return
      moved = true
      // いまの図は、押したときから shift だけ動いている。測った点から shift を引いて、押したときの図の点に直す
      const shift: StagePoint = [stateRef.current.pan[0] - from[0], stateRef.current.pan[1] - from[1]]
      const here = viewRef.current().toWorld(next.clientX, next.clientY)
      const before: StagePoint = [here[0] - shift[0], here[1] - shift[1]]
      setState(current => ({ ...current, pan: [from[0] - (before[0] - start[0]), from[1] - (before[1] - start[1])] }))
    }
    const finish = () => {
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', stop)
      window.removeEventListener('pointercancel', stop)
    }
    const stop = (up: PointerEvent) => {
      if (up.pointerId !== event.pointerId) return
      finish()
      if (!moved && !multiTouch()) onTap?.()
    }
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', stop)
    window.addEventListener('pointercancel', stop)
  }, [])

  return { ...state, zoomBy, reset, beginPan }
}
