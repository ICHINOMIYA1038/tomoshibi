// クラウドセッションのアプリ全体共有 (シングルトン + React フック)
import { useEffect, useSyncExternalStore } from 'react'
import { getSession, type CloudUser } from './cloud'

type State = { user: CloudUser | null; loading: boolean }
let state: State = { user: null, loading: true }
const listeners = new Set<() => void>()
const emit = () => listeners.forEach(l => l())

let inited = false
export async function refreshSession() {
  state = { ...state, loading: true }; emit()
  const user = await getSession()
  state = { user, loading: false }; emit()
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
