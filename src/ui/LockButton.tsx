import { useEffect, useState } from 'react'
import { isLocked, setLocked, useLockNudge, type LockKind } from '../locks'
import { useStore } from '../store'

/** 選んだ物の固定の切り替え。閉じた鍵＋固定中／開いた鍵＋固定する。固定した物を動かそうとすると、一瞬光る */
export function LockButton({ className = '' }: { className?: string }) {
  const selection = useStore(state => state.selection)
  const locked = useStore(state => isLocked(state.productionPlan, selection.kind, selection.id))
  const nudge = useLockNudge(state => state.at)
  const [flash, setFlash] = useState(false)
  useEffect(() => {
    if (!nudge) return
    setFlash(true)
    const timer = window.setTimeout(() => setFlash(false), 900)
    return () => window.clearTimeout(timer)
  }, [nudge])
  if (!selection.kind || !selection.id) return null
  return <button type="button" className={'lock-button' + (locked ? ' locked' : '') + (flash && locked ? ' flash' : '') + (className ? ' ' + className : '')}
    aria-pressed={locked} title={locked ? '固定中。押すと、ドラッグで動かせるようになります' : '押すと固定して、ドラッグで動かないようにします'}
    onClick={() => setLocked(selection.kind as LockKind, selection.id!, !locked)}>
    <svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round">
      <rect x="3" y="7" width="10" height="7" rx="1" />
      <path d={locked ? 'M5.5 7V5a2.5 2.5 0 0 1 5 0v2' : 'M5.5 7V5a2.5 2.5 0 0 1 4.8-1'} />
    </svg>
    {locked ? '固定中' : '固定する'}
  </button>
}
