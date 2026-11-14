import { useProjectEditor, startProjectEditor, stopProjectEditor, takeoverProjectEditor, retryProjectEditor, viewLatestProject } from '../io/projectEditor'
import { useMockWorkspaceState } from '../io/mockWorkspace'
import { useEffect, useRef, useState, type ReactNode } from 'react'
import { loginUrl } from '../io/cloud'
import { refreshSession, useCloudSession } from '../io/cloudSession'
import { getActiveCloudProject } from '../io/mockProjectSession'
import { askConfirm } from './askConfirm'

export function OnlineWorkspace({ children, enabled, editorVisible, onProjects }: { children: ReactNode; enabled: boolean; editorVisible: boolean; onProjects: () => void }) {
  const { user, loading, connectionError } = useCloudSession()
  const content = useRef<HTMLDivElement>(null)
  const { cloudDirty, saveStatus } = useMockWorkspaceState()
  const editor = useProjectEditor()
  const projectId = getActiveCloudProject()?.id
  const [viewOnly, setViewOnly] = useState(false)
  const [viewError, setViewError] = useState('')
  useEffect(() => {
    setViewOnly(false)
    if (enabled && user && projectId) void startProjectEditor(projectId, user.id, cloudDirty)
    else stopProjectEditor()
    return stopProjectEditor
  }, [enabled, user?.id, projectId])
  const pendingChanges = projectId ? cloudDirty : saveStatus !== 'saved'
  const editorBlocked = !!(enabled && user && projectId && editorVisible &&
    (editor.projectId !== projectId || editor.status !== 'owned'))
  const takeOver = async () => {
    if (!await askConfirm('この画面で編集を引き継ぎますか？\n別の画面では編集できなくなります。保存されていない変更を破棄し、アカウントに保存された最新の内容から再開します。')) return
    setViewOnly(false)
    void takeoverProjectEditor()
  }
  const viewLatest = async () => {
    if (cloudDirty && !await askConfirm('この画面の未保存の変更を破棄し、保存済みの内容を表示しますか？')) return
    try { await viewLatestProject(); setViewOnly(true); setViewError('') }
    catch { setViewError('保存済みの内容を読み込めませんでした。接続を確認してください。') }
  }
  useEffect(() => {
    if (!enabled || !pendingChanges) return
    const warnBeforeLeaving = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = '' }
    window.addEventListener('beforeunload', warnBeforeLeaving)
    return () => window.removeEventListener('beforeunload', warnBeforeLeaving)
  }, [enabled, pendingChanges])
  const offline = enabled && (connectionError || !navigator.onLine)
  const loginRequired = enabled && !loading && !user && !!getActiveCloudProject()
  const blocked = offline || loginRequired || editorBlocked
  useEffect(() => {
    if (content.current) content.current.inert = blocked
    if (!blocked) return
    const stopEditing = (event: KeyboardEvent) => {
      if (event.target instanceof Element && event.target.closest('.workspace-connection-dialog, .workspace-editor-banner')) return
      event.stopImmediatePropagation()
    }
    window.addEventListener('keydown', stopEditing, true)
    return () => window.removeEventListener('keydown', stopEditing, true)
  }, [blocked])
  return <>
    <div ref={content} style={{ display: 'contents' }}>{children}</div>
    {(offline || loginRequired) && <div className="workspace-connection-backdrop">
      <section className="workspace-connection-dialog" role="alertdialog" aria-modal="true" aria-labelledby="workspace-connection-title">
        <h2 id="workspace-connection-title">{offline ? 'インターネット接続が必要です' : 'ログインを更新してください'}</h2>
        <p>{offline ? 'オフラインでは編集・新規作成できません。接続を確認してから続けてください。' : 'アカウントに保存したプロジェクトを表示するため、ログインし直してください。'}</p>
        <p>アカウントに保存済みのプロジェクトは、そのまま残っています。</p>
        {offline ? <button disabled={loading} onClick={() => void refreshSession()}>{loading ? '接続を確認中…' : '接続を確認して再開'}</button>
          : <a href={loginUrl()}>ログインして続ける</a>}
      </section>
    </div>}
    {editorBlocked && !offline && !loginRequired && (viewOnly
      ? <aside className="workspace-editor-banner" role="status">閲覧のみ — この画面では編集できません
          <button onClick={takeOver}>この画面で編集する</button><button onClick={onProjects}>プロジェクト一覧</button>
        </aside>
      : <div className="workspace-connection-backdrop"><section className="workspace-connection-dialog" role="alertdialog" aria-modal="true" aria-labelledby="editor-lock-title">
          <h2 id="editor-lock-title">{editor.status === 'checking' || editor.projectId !== projectId ? '編集権を確認しています…'
            : editor.status === 'lost' ? 'この画面の編集を停止しました'
            : editor.status === 'error' ? '編集権を確認できません'
            : editor.status === 'stale' ? '保存済みの内容が更新されています' : '別の画面で編集中です'}</h2>
          {editor.status === 'checking' || editor.projectId !== projectId ? <p>確認が終わるまでお待ちください。</p> : <>
            <p>{editor.status === 'error' ? editor.error : 'この画面で編集を引き継ぐと、別の画面では編集できなくなります。保存されていない変更を破棄し、アカウントに保存された最新の内容から再開します。'}</p>
            {viewError && <p role="alert">{viewError}</p>}
            <div className="workspace-editor-actions"><button onClick={() => void viewLatest()}>閲覧のみ</button>
            {editor.status === 'error' ? <button onClick={() => void retryProjectEditor()}>接続を確認して再開</button>
              : <button onClick={takeOver}>この画面で編集する</button>}</div>
          </>}
        </section></div>)}
  </>
}
