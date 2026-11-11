// クラウドセッションのアプリ全体共有 (シングルトン + React フック)
import { useEffect, useSyncExternalStore } from 'react'
import { getSessionSnapshot, type CloudUser } from './cloud'

type State = { user: CloudUser | null; proAvailable: boolean; loading: boolean; connectionError: boolean }
let state: State = { user: null, proAvailable: false, loading: true, connectionError: !navigator.onLine }
const listeners = new Set<() => void>()
const emit = () => listeners.forEach(l => l())

let inited = false
let pendingRefresh: Promise<void> | null = null
export function refreshSession(): Promise<void> {
  if (pendingRefresh) return pendingRefresh
  state = { ...state, loading: true }; emit()
  pendingRefresh = getSessionSnapshot().then(snap => {
    if (!snap.unavailable) {
      state = { user: snap.user, proAvailable: snap.proAvailable, loading: false, connectionError: false }
    } else state = { ...state, loading: false, connectionError: true }
    emit()
  }).finally(() => { pendingRefresh = null })
  return pendingRefresh
}

export function useCloudSession(): State {
  const snap = useSyncExternalStore(
    (cb) => { listeners.add(cb); return () => listeners.delete(cb) },
    () => state,
    () => state,
  )
  useEffect(() => {
    if (!inited) {
      inited = true
      refreshSession()
      window.addEventListener('pageshow', () => refreshSession())
      window.addEventListener('offline', () => { state = { ...state, connectionError: true }; emit() })
      window.addEventListener('online', () => refreshSession())
      document.addEventListener('visibilitychange', () => { if (!document.hidden) refreshSession() })
    }
  }, [])
  return snap
}
