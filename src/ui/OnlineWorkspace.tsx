import { useMockWorkspaceState } from '../io/mockWorkspace'
import { useEffect, useRef, type ReactNode } from 'react'
import { loginUrl } from '../io/cloud'
import { refreshSession, useCloudSession } from '../io/cloudSession'
import { getActiveCloudProject } from '../io/mockProjectSession'

export function OnlineWorkspace({ children, enabled }: { children: ReactNode; enabled: boolean }) {
  const { user, loading, connectionError } = useCloudSession()
  const content = useRef<HTMLDivElement>(null)
  const { cloudDirty, saveStatus } = useMockWorkspaceState()
  useEffect(() => {
    if (!enabled || (!cloudDirty && saveStatus === 'saved')) return
    const warnBeforeLeaving = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = '' }
    window.addEventListener('beforeunload', warnBeforeLeaving)
    return () => window.removeEventListener('beforeunload', warnBeforeLeaving)
  }, [enabled, cloudDirty, saveStatus])
  const offline = enabled && (connectionError || !navigator.onLine)
  const loginRequired = enabled && !loading && !user && !!getActiveCloudProject()
  const blocked = offline || loginRequired
  useEffect(() => {
    if (content.current) content.current.inert = blocked
    if (!blocked) return
    const stopEditing = (event: KeyboardEvent) => {
      if (event.target instanceof Element && event.target.closest('.workspace-connection-dialog')) return
      event.stopImmediatePropagation()
    }
    window.addEventListener('keydown', stopEditing, true)
    return () => window.removeEventListener('keydown', stopEditing, true)
  }, [blocked])
  return <>
    <div ref={content} style={{ display: 'contents' }}>{children}</div>
    {blocked && <div className="workspace-connection-backdrop">
      <section className="workspace-connection-dialog" role="alertdialog" aria-modal="true" aria-labelledby="workspace-connection-title">
        <h2 id="workspace-connection-title">{offline ? 'インターネット接続が必要です' : 'ログインを更新してください'}</h2>
        <p>{offline ? 'オフラインでは編集・新規作成できません。接続を確認してから続けてください。' : 'アカウントに保存したプロジェクトを表示するため、ログインし直してください。'}</p>
        <p>アカウントに保存済みのプロジェクトは、そのまま残っています。</p>
        {offline ? <button disabled={loading} onClick={() => void refreshSession()}>{loading ? '接続を確認中…' : '接続を確認して再開'}</button>
          : <a href={loginUrl()}>ログインして続ける</a>}
      </section>
    </div>}
  </>
}
