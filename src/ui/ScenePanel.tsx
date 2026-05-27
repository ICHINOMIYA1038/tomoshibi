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

// PC専用のシンプルなシーン管理パネル。
// 未ログイン: ログイン/新規登録ボタンのみ。
// ログイン後: 新規 / 保存 (現在のシーンを名前付け保存) / 一覧 (呼び出し・上書・削除)
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
      <div className="panel-body">
        <CloudScenes />
      </div>
    </div>
  )
}

function CloudScenes() {
  const { user, loading: sessionLoading } = useCloudSession()
  const [scenes, setScenes] = useState<CloudSceneMeta[]>([])
  const [activeId, setActiveId] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [err, setErr] = useState('')
  const [name, setName] = useState('')

  const refresh = async () => {
    try { setScenes(await listCloudScenes()); setErr('') }
    catch (e) { if (e instanceof CloudError) setErr(e.message) }
  }
  useEffect(() => {
    if (user) refresh()
    else { setScenes([]); setActiveId(null) }
  }, [user?.id])

  if (sessionLoading && !user) {
    return <div className="info-block" style={{ fontSize: 11 }}>接続を確認中…</div>
  }
  if (!user) {
    return (
      <>
        <div className="info-block" style={{ fontSize: 11, lineHeight: 1.6 }}>
          ログインすると、明かりプランをクラウドに保存して<br />
          別の端末からも開けます。<br />
          <span style={{ color: '#998468' }}>戯曲図書館アカウント (Google認証) 共通</span>
        </div>
        <div className="row" style={{ marginTop: 8 }}>
          <button className="primary" onClick={() => { location.href = loginUrl() }}>ログイン</button>
          <button onClick={() => { location.href = signupUrl() }}>新規登録</button>
        </div>
      </>
    )
  }

  const doNew = () => {
    if (scenes.length === 0 || confirm('現在のシーンを破棄して新規シーンを作成しますか？')) {
      importScene({
        version: 1,
        name: '新規シーン',
        savedAt: new Date().toISOString(),
        fixtures: [],
        performers: [],
        settings: {},
      })
      setActiveId(null)
    }
  }

  const doSave = async () => {
    const n = name.trim()
    if (!n) { setErr('名前を入力してください'); return }
    setLoading(true); setErr('')
    try {
      if (activeId) {
        // 既存を選択中なら上書き
        await updateCloudScene(activeId, n)
      } else {
        const created = await saveCloudSceneNew(n)
        setActiveId(created.id)
      }
      await refresh()
    } catch (e) {
      if (e instanceof CloudError) setErr(e.message)
    } finally { setLoading(false) }
  }

  const doLoad = async (s: CloudSceneMeta) => {
    setLoading(true); setErr('')
    try {
      await loadCloudScene(s.id)
      setActiveId(s.id)
      setName(s.name)
    } catch (e) {
      if (e instanceof CloudError) setErr(e.message)
    } finally { setLoading(false) }
  }
  const doDelete = async (s: CloudSceneMeta) => {
    if (!confirm(`「${s.name}」をクラウドから削除しますか？`)) return
    setLoading(true); setErr('')
    try {
      await deleteCloudScene(s.id)
      if (activeId === s.id) setActiveId(null)
      await refresh()
    } catch (e) {
      if (e instanceof CloudError) setErr(e.message)
    } finally { setLoading(false) }
  }

  return (
    <>
      <div className="info-block" style={{ fontSize: 11, color: '#998468' }}>
        ログイン中: <b style={{ color: 'var(--ink-secondary)' }}>{user.name ?? user.id}</b>
      </div>

      <div className="row" style={{ marginTop: 8 }}>
        <button className="primary" disabled={loading} onClick={doNew}>＋ 新規</button>
      </div>

      <div className="row" style={{ marginTop: 8 }}>
        <input
          type="text"
          placeholder={activeId ? '名前を変更して保存' : '新しい名前を入力'}
          value={name}
          onChange={e => setName(e.target.value)}
          maxLength={60}
          style={{ flex: 1 }}
        />
        <button className="primary" disabled={loading || !name.trim()} onClick={doSave}>
          {activeId ? '上書' : '保存'}
        </button>
      </div>
      {err && <div className="info-block" style={{ color: '#e07a6a', fontSize: 11 }}>{err}</div>}

      <h3 style={{ marginTop: 14 }}>保存済みシーン</h3>
      <div className="list">
        {scenes.map(s => (
          <div
            key={s.id}
            className={'fixture-row' + (activeId === s.id ? ' selected' : '')}
          >
            <span className="name">{s.name}</span>
            <span style={{ fontSize: 10, color: '#998468' }}>{new Date(s.updatedAt).toLocaleDateString('ja-JP')}</span>
            <button className="small" disabled={loading} onClick={() => doLoad(s)}>呼出</button>
            <button className="small danger" disabled={loading} onClick={() => doDelete(s)}>×</button>
          </div>
        ))}
        {scenes.length === 0 && <div className="empty-hint">まだシーンがありません</div>}
      </div>

      <div className="row" style={{ marginTop: 10 }}>
        <a href={logoutUrl()} style={{ fontSize: 10, color: '#998468' }}>ログアウト</a>
      </div>
    </>
  )
}
