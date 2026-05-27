import { useEffect, useState } from 'react'
import { useStore } from '../store'
import { importScene } from '../io/sceneIO'
import {
  loginUrl, signupUrl, logoutUrl,
  listCloudScenes, saveCloudSceneNew, updateCloudScene, loadCloudScene, deleteCloudScene,
  type CloudSceneMeta, CloudError,
} from '../io/cloud'
import { useCloudSession } from '../io/cloudSession'
import { useDraggablePanel } from './useDraggablePanel'

// PC専用のシーン管理パネル。クラウドのみ。
// 未ログイン → ログイン誘導
// ログイン中 → 「現在のシーン (名前+保存)」「保存済み一覧」「ユーザー情報」の3ブロック構造
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

  const refresh = async () => {
    try { setScenes(await listCloudScenes()); setErr('') }
    catch (e) { if (e instanceof CloudError) setErr(e.message) }
  }
  useEffect(() => {
    if (user) refresh()
    else { setScenes([]); setActiveId(null) }
  }, [user?.id])

  // ─────────── 未ログイン ───────────
  if (sessionLoading && !user) {
    return <div className="scene-status">接続を確認中…</div>
  }
  if (!user) {
    return (
      <div className="scene-login">
        <div className="scene-login-icon">☁</div>
        <p className="scene-login-lead">
          ログインすると<br />
          作った明かりを<b>クラウドに保存</b>でき、<br />
          別端末からも開けるようになります。
        </p>
        <button className="scene-cta primary" onClick={() => { location.href = loginUrl() }}>
          ログインして使う
        </button>
        <button className="scene-cta" onClick={() => { location.href = signupUrl() }}>
          新規登録 (無料)
        </button>
        <p className="scene-login-note">戯曲図書館アカウントを共通利用します</p>
      </div>
    )
  }

  // ─────────── ログイン中 ───────────
  const isNewScene = !activeId
  const showToast = (msg: string) => {
    setToast(msg); window.setTimeout(() => setToast(''), 1600)
  }

  const doNew = () => {
    if (scenes.length > 0 && !confirm('現在の編集内容を破棄して新しいシーンを始めますか?\n(クラウドの保存済みシーンは消えません)')) return
    importScene({
      version: 1, name: '新規シーン', savedAt: new Date().toISOString(),
      fixtures: [], performers: [], settings: {},
    })
    setActiveId(null); setActiveName('')
  }

  const doSave = async () => {
    const n = activeName.trim()
    if (!n) { setErr('シーン名を入力してください'); return }
    setLoading(true); setErr('')
    try {
      if (activeId) {
        await updateCloudScene(activeId, n)
        showToast('上書き保存しました')
      } else {
        const created = await saveCloudSceneNew(n)
        setActiveId(created.id)
        showToast('保存しました')
      }
      await refresh()
    } catch (e) {
      if (e instanceof CloudError) setErr(e.message)
    } finally { setLoading(false) }
  }
  const doSaveAs = async () => {
    const suggested = activeName.trim() ? `${activeName.trim()} のコピー` : ''
    const n = prompt('別名で保存。新しい名前を入力:', suggested)?.trim()
    if (!n) return
    setLoading(true); setErr('')
    try {
      const created = await saveCloudSceneNew(n)
      setActiveId(created.id); setActiveName(n)
      showToast('別名で保存しました')
      await refresh()
    } catch (e) {
      if (e instanceof CloudError) setErr(e.message)
    } finally { setLoading(false) }
  }

  const doLoad = async (s: CloudSceneMeta) => {
    setLoading(true); setErr('')
    try {
      await loadCloudScene(s.id)
      setActiveId(s.id); setActiveName(s.name)
      showToast(`「${s.name}」を読み込みました`)
    } catch (e) {
      if (e instanceof CloudError) setErr(e.message)
    } finally { setLoading(false) }
  }
  const doDelete = async (s: CloudSceneMeta) => {
    if (!confirm(`「${s.name}」を削除しますか?\n(この操作は取り消せません)`)) return
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
      {/* 1. 編集中のシーン */}
      <section className="scene-section">
        <header className="scene-section-h">
          <span className="scene-dot" />
          編集中
        </header>
        <input
          className="scene-name-input"
          type="text"
          value={activeName}
          placeholder={isNewScene ? '名前を付けて保存…' : 'シーン名'}
          onChange={e => setActiveName(e.target.value)}
          maxLength={60}
        />
        <div className="scene-actions">
          <button
            className="scene-cta primary"
            disabled={loading || !activeName.trim()}
            onClick={doSave}
            title={isNewScene ? 'クラウドに新規保存' : 'クラウドに上書き保存'}
          >
            {isNewScene ? '💾 保存' : '💾 上書き保存'}
          </button>
          {!isNewScene && (
            <button className="scene-cta-sub" disabled={loading} onClick={doSaveAs}>別名保存</button>
          )}
          <button className="scene-cta-sub" disabled={loading} onClick={doNew}>＋ 新規</button>
        </div>
        {err && <div className="scene-error">{err}</div>}
        {toast && <div className="scene-toast">{toast}</div>}
      </section>

      {/* 2. 保存済みシーン一覧 */}
      <section className="scene-section">
        <header className="scene-section-h">
          保存済み <span className="scene-count">{scenes.length}</span>
        </header>
        {scenes.length === 0 ? (
          <div className="scene-empty">
            まだ保存されたシーンはありません<br />
            <span style={{ opacity: 0.6 }}>上の「保存」で記録できます</span>
          </div>
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
                  title="削除"
                  aria-label={`${s.name} を削除`}
                >×</button>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* 3. アカウント */}
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
