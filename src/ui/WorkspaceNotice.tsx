import { useEffect, useId, useSyncExternalStore, type ReactNode } from 'react'

type Notice = { id: string; content: ReactNode; kind: 'status' | 'alert' }
let notices: Notice[] = []
const listeners = new Set<() => void>()
const publish = () => listeners.forEach(listener => listener())
const subscribe = (listener: () => void) => { listeners.add(listener); return () => { listeners.delete(listener) } }

export function WorkspaceNotice({ children, kind = 'status' }: { children: ReactNode; kind?: Notice['kind'] }) {
  const id = useId()
  useEffect(() => {
    notices = [...notices.filter(notice => notice.id !== id), { id, content: children, kind }]
    publish()
    return () => { notices = notices.filter(notice => notice.id !== id); publish() }
  }, [id, children, kind])
  return null
}

export function WorkspaceNotices() {
  const items = useSyncExternalStore(subscribe, () => notices, () => notices)
  return <div className="workspace-notices">{items.map(notice =>
    <div key={notice.id} className={`workspace-notice ${notice.kind}`} role={notice.kind}>
      <span aria-hidden="true">{notice.kind === 'alert' ? '!' : '✓'}</span>{notice.content}
    </div>
  )}</div>
}
