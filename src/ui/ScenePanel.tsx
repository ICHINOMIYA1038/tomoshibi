import { useEffect, useState } from 'react'
import { useStore, useIsDirty } from '../store'
import { importScene } from '../io/sceneIO'
import {
  loginUrl, signupUrl, logoutUrl,
  listCloudScenes, saveCloudSceneNew, updateCloudScene, loadCloudScene, deleteCloudScene,
  type CloudSceneMeta, CloudError,
} from '../io/cloud'
import { useCloudSession } from '../io/cloudSession'
import { useDraggablePanel } from './useDraggablePanel'

const MAX_SCENES = 5

export function ScenePanel() {
  const { panelProps, handleProps } = useDraggablePanel('scene', {
    x: typeof window !== 'undefined' ? window.innerWidth - 760 : 600,
    y: 12,
  })
  const update = useStore(s => s.updateSettings)
  const open = useStore(s => s.settings.scenePanelOpen)
  if (!open) return null

  return (
    <div className="panel scene-panel" {...panelProps}>
      <div className="panel-header" {...handleProps}>
        <div className="panel-title">シーン管理</div>
        <div className="panel-actions">
          <button className="icon-btn" title="閉じる" onClick={() => update({ scenePanelOpen: false })}>×</button>
        </div>
      </div>
      <div className="panel-body scene-body">
        <CloudScenes />
      </div>
    </div>
  )
}

function CloudScenes() {
  const { user, loading: sessionLoading } = useCloudSession()
  const [scenes, setScenes] = useState<CloudSceneMeta[]>([])
  const [activeId, setActiveId] = useState<string | null>(null)
  const [activeName, setActiveName] = useState<string>('')
  const [loading, setLoading] = useState(false)
  const [err, setErr] = useState('')
  const [toast, setToast] = useState('')
  const dirty = useIsDirty()
  const markSaved = useStore(s => s.markSavedSnapshot)

  // ページ離脱前の警告 (未保存の変更がある場合のみ)
  useEffect(() => {
    if (!dirty) return
    const handler = (e: BeforeUnloadEvent) => {
      e.preventDefault()
      e.returnValue = ''
    }
    window.addEventListener('beforeunload', handler)
    return () => window.removeEventListener('beforeunload', handler)
  }, [dirty])

  const confirmDiscard = (action: string) =>
    !dirty || confirm(`未保存の変更があります。${action}しますか?\n変更内容は失われます。`)

  const refresh = async () => {
    try { setScenes(await listCloudScenes()); setErr('') }
    catch (e) { if (e instanceof CloudError) setErr(e.message) }
  }
  useEffect(() => {
    if (user) refresh()
    else { setScenes([]); setActiveId(null) }
  }, [user?.id])

  if (sessionLoading && !user) {
    return <div className="scene-status">接続を確認中…</div>
  }
  if (!user) {
    return (
      <div className="scene-login">
        <p className="scene-login-lead">
          ログインすると、明かりプランを<br />
          サーバに保存して別端末から開けます。
        </p>
        <div className="scene-actions">
          <button className="scene-cta primary" onClick={() => { location.href = loginUrl() }}>
            ログイン
          </button>
          <button className="scene-cta-sub" onClick={() => { location.href = signupUrl() }}>
            新規登録
          </button>
        </div>
        <p className="scene-login-note">戯曲図書館アカウント (Google認証) を共通利用します</p>
      </div>
    )
  }

  const isNewScene = !activeId
  const atLimit = isNewScene && scenes.length >= MAX_SCENES
  const showToast = (msg: string) => { setToast(msg); window.setTimeout(() => setToast(''), 1800) }

  const doNew = () => {
    if (!confirmDiscard('破棄して新規シーンを開始')) return
    importScene({
      version: 1, name: '無題', savedAt: new Date().toISOString(),
      fixtures: [], performers: [], settings: {},
    })
    setActiveId(null); setActiveName('')
    markSaved()
  }
  const doSave = async () => {
    const n = activeName.trim()
    if (!n) { setErr('シーン名を入力してください'); return }
    if (atLimit) { setErr(`シーンは ${MAX_SCENES} 件まで保存できます。不要なシーンを削除してください`); return }
    setLoading(true); setErr('')
    try {
      if (activeId) {
        await updateCloudScene(activeId, n); showToast('上書き保存しました')
      } else {
        const created = await saveCloudSceneNew(n); setActiveId(created.id); showToast('保存しました')
      }
      markSaved()
      await refresh()
    } catch (e) {
      if (e instanceof CloudError) setErr(e.message)
    } finally { setLoading(false) }
  }
  const doLoad = async (s: CloudSceneMeta) => {
    if (!confirmDiscard(`「${s.name}」を読み込み`)) return
    setLoading(true); setErr('')
    try {
      await loadCloudScene(s.id); setActiveId(s.id); setActiveName(s.name)
      markSaved()
      showToast('読み込みました')
    } catch (e) {
      if (e instanceof CloudError) setErr(e.message)
    } finally { setLoading(false) }
  }
  const doDelete = async (s: CloudSceneMeta) => {
    if (!confirm(`「${s.name}」を削除しますか?\nこの操作は取り消せません。`)) return
    setLoading(true); setErr('')
    try {
      await deleteCloudScene(s.id)
      if (activeId === s.id) { setActiveId(null); setActiveName('') }
      await refresh()
    } catch (e) {
      if (e instanceof CloudError) setErr(e.message)
    } finally { setLoading(false) }
  }

  return (
    <>
      <section className="scene-section">
        <header className="scene-section-h">
          <span>編集中{dirty && <span className="scene-dirty-mark" title="未保存の変更があります">●</span>}</span>
        </header>
        <input
          className="scene-name-input"
          type="text"
          value={activeName}
          placeholder={isNewScene ? '名前を入れて保存' : ''}
          onChange={e => setActiveName(e.target.value)}
          maxLength={60}
        />
        <div className="scene-actions">
          <button
            className="scene-cta primary"
            disabled={loading || !activeName.trim() || atLimit}
            onClick={doSave}
            title={isNewScene ? 'クラウドに新規保存' : 'クラウドに上書き保存'}
          >
            {isNewScene ? '保存' : '上書き保存'}
          </button>
          <button className="scene-cta-sub" disabled={loading} onClick={doNew}>新規</button>
        </div>
        {err && <div className="scene-error">{err}</div>}
        {toast && <div className="scene-toast">{toast}</div>}
      </section>

      <section className="scene-section">
        <header className="scene-section-h">
          <span>保存済み</span>
          <span className="scene-count">{scenes.length} / {MAX_SCENES}</span>
        </header>
        {scenes.length === 0 ? (
          <div className="empty-hint">まだ保存されたシーンはありません</div>
        ) : (
          <ul className="scene-list">
            {scenes.map(s => (
              <li key={s.id} className={'scene-item' + (activeId === s.id ? ' active' : '')}>
                <button
                  className="scene-item-main"
                  disabled={loading}
                  onClick={() => doLoad(s)}
                  title="このシーンを読み込む"
                >
                  <span className="scene-item-name">{s.name}</span>
                  <span className="scene-item-date">{relTime(s.updatedAt)}</span>
                </button>
                <button
                  className="scene-item-del"
                  disabled={loading}
                  onClick={() => doDelete(s)}
                  aria-label={`${s.name} を削除`}
                  title="削除"
                >×</button>
              </li>
            ))}
          </ul>
        )}
      </section>

      <footer className="scene-account">
        <span className="scene-account-name">{user.name ?? user.id}</span>
        <a href={logoutUrl()} className="scene-account-logout">ログアウト</a>
      </footer>
    </>
  )
}

function relTime(iso: string): string {
  const t = new Date(iso).getTime()
  const diff = Date.now() - t
  const min = Math.floor(diff / 60_000)
  if (min < 1) return 'たった今'
  if (min < 60) return `${min}分前`
  const hr = Math.floor(min / 60)
  if (hr < 24) return `${hr}時間前`
  const day = Math.floor(hr / 24)
  if (day < 7) return `${day}日前`
  return new Date(iso).toLocaleDateString('ja-JP')
}
