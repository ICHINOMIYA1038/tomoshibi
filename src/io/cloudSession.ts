// クラウドセッションのアプリ全体共有 (シングルトン + React フック)
import { useEffect, useSyncExternalStore } from 'react'
import { getSessionSnapshot, type CloudUser } from './cloud'

type State = { user: CloudUser | null; proAvailable: boolean; loading: boolean }
let state: State = { user: null, proAvailable: false, loading: true }
const listeners = new Set<() => void>()
const emit = () => listeners.forEach(l => l())

let inited = false
export async function refreshSession() {
  state = { ...state, loading: true }; emit()
  const snap = await getSessionSnapshot()
  state = { user: snap.user, proAvailable: snap.proAvailable, loading: false }; emit()
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
    }
  }, [])
  return snap
}
