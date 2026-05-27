import { useEffect, useState } from 'react'
import { useStore, LIMITS } from '../store'
import {
  listSavedScenes, saveSceneLS, loadSceneLS, deleteSceneLS,
  downloadSceneJSON, uploadSceneJSON, makeShareURL,
} from '../io/sceneIO'
import {
  loginUrl, signupUrl, logoutUrl,
  listCloudScenes, saveCloudSceneNew, updateCloudScene, loadCloudScene, deleteCloudScene,
  type CloudSceneMeta, CloudError,
} from '../io/cloud'
import { useCloudSession } from '../io/cloudSession'
import { useDraggablePanel } from './useDraggablePanel'

// PC専用の独立パネル: シーン管理(ローカル/クラウド/共有URL/エクスポート)
// モバイルでは display:none (スマホはローカルストレージのみのシンプル運用)
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
          <button
            className="icon-btn"
            title="閉じる"
            onClick={() => update({ scenePanelOpen: false })}
          >×</button>
        </div>
      </div>
      <div className="panel-body">
        <LocalScenes />
        <CloudScenes />
      </div>
    </div>
  )
}

function LocalScenes() {
  const fixtureCount = useStore(s => s.fixtures.length)
  const performerCount = useStore(s => s.performers.length)
  const loadPreset = useStore(s => s.loadPreset)
  const [name, setName] = useState('明かり1')
  const [shareURL, setShareURL] = useState('')
  const saved = listSavedScenes()

  return (
    <>
      <h3>テンプレート</h3>
      <div className="preset-grid">
        <button onClick={() => loadPreset('basic')}>基本</button>
        <button onClick={() => loadPreset('colorful')}>カラフル</button>
        <button onClick={() => loadPreset('empty')}>空</button>
      </div>
      <div className="info-block" style={{ marginTop: 6, fontSize: 11 }}>
        器具 <b>{fixtureCount}</b>/{LIMITS.fixtures} ・ 役者 <b>{performerCount}</b>/{LIMITS.performers}
      </div>

      <h3>この端末に保存</h3>
      <div className="row">
        <label>名前</label>
        <input type="text" value={name} onChange={e => setName(e.target.value)} />
      </div>
      <div className="row">
        <button className="primary" onClick={() => { saveSceneLS(name); alert('保存しました') }}>保存</button>
        <button onClick={() => downloadSceneJSON(name)}>書出</button>
        <label className="file-btn">
          読込
          <input type="file" accept=".json" hidden onChange={async e => {
            const f = e.target.files?.[0]; if (f) { await uploadSceneJSON(f) }
          }} />
        </label>
      </div>
      <div className="row">
        <button onClick={() => setShareURL(makeShareURL())} style={{ flex: 1 }}>共有URL生成</button>
      </div>
      {shareURL && (
        <textarea className="share-url" readOnly value={shareURL} onClick={e => (e.target as HTMLTextAreaElement).select()} />
      )}
      <div className="list" style={{ marginTop: 6 }}>
        {saved.map(s => (
          <div key={s.name} className="fixture-row">
            <span className="name">{s.name}</span>
            <span style={{ fontSize: 10, color: '#998468' }}>{new Date(s.savedAt).toLocaleDateString('ja-JP')}</span>
            <button className="small" onClick={() => loadSceneLS(s.name)}>読込</button>
            <button className="small danger" onClick={() => { deleteSceneLS(s.name); location.reload() }}>×</button>
          </div>
        ))}
        {saved.length === 0 && <div className="empty-hint">保存されたシーンはありません</div>}
      </div>
    </>
  )
}

function CloudScenes() {
  const { user, loading: sessionLoading } = useCloudSession()
  const [scenes, setScenes] = useState<CloudSceneMeta[]>([])
  const [loading, setLoading] = useState(false)
  const [err, setErr] = useState('')
  const [name, setName] = useState('')

  const refreshScenes = async () => {
    try { setScenes(await listCloudScenes()); setErr('') }
    catch (e) { if (e instanceof CloudError) setErr(e.message) }
  }

  useEffect(() => {
    if (user) refreshScenes()
    else setScenes([])
  }, [user?.id])

  if (sessionLoading && !user) {
    return (<>
      <h3>クラウド保存</h3>
      <div className="info-block" style={{ fontSize: 11 }}>接続を確認中…</div>
    </>)
  }
  if (!user) {
    return (<>
      <h3>クラウド保存</h3>
      <div className="info-block" style={{ fontSize: 11, lineHeight: 1.6 }}>
        ログインすると、別端末からもシーンを開けます。<br />
        <span style={{ color: '#998468' }}>戯曲図書館アカウント(Google認証)共通</span>
      </div>
      <div className="row" style={{ marginTop: 6 }}>
        <button className="primary" onClick={() => { location.href = loginUrl() }}>ログイン</button>
        <button onClick={() => { location.href = signupUrl() }}>新規登録</button>
      </div>
    </>)
  }

  const doSave = async () => {
    const n = name.trim() || `シーン ${new Date().toLocaleString('ja-JP')}`
    setLoading(true); setErr('')
    try { await saveCloudSceneNew(n); setName(''); await refreshScenes() }
    catch (e) { if (e instanceof CloudError) setErr(e.message) }
    finally { setLoading(false) }
  }
  const doUpdate = async (s: CloudSceneMeta) => {
    if (!confirm(`「${s.name}」を現在の状態で上書きしますか？`)) return
    setLoading(true); setErr('')
    try { await updateCloudScene(s.id, s.name); await refreshScenes() }
    catch (e) { if (e instanceof CloudError) setErr(e.message) }
    finally { setLoading(false) }
  }
  const doLoad = async (s: CloudSceneMeta) => {
    setLoading(true); setErr('')
    try { await loadCloudScene(s.id) }
    catch (e) { if (e instanceof CloudError) setErr(e.message) }
    finally { setLoading(false) }
  }
  const doDelete = async (s: CloudSceneMeta) => {
    if (!confirm(`「${s.name}」をクラウドから削除しますか？`)) return
    setLoading(true); setErr('')
    try { await deleteCloudScene(s.id); await refreshScenes() }
    catch (e) { if (e instanceof CloudError) setErr(e.message) }
    finally { setLoading(false) }
  }

  return (<>
    <h3>クラウド保存 ({user.name ?? 'ログイン中'})</h3>
    <div className="row">
      <input
        type="text"
        placeholder="新しい名前で保存…"
        value={name}
        onChange={e => setName(e.target.value)}
        maxLength={60}
        style={{ flex: 1 }}
      />
      <button className="primary" disabled={loading} onClick={doSave}>保存</button>
    </div>
    {err && <div className="info-block" style={{ color: '#e07a6a', fontSize: 11 }}>{err}</div>}
    <div className="list" style={{ marginTop: 6 }}>
      {scenes.map(s => (
        <div key={s.id} className="fixture-row">
          <span className="name">{s.name}</span>
          <span style={{ fontSize: 10, color: '#998468' }}>{new Date(s.updatedAt).toLocaleDateString('ja-JP')}</span>
          <button className="small" disabled={loading} onClick={() => doLoad(s)}>読込</button>
          <button className="small" disabled={loading} onClick={() => doUpdate(s)}>上書</button>
          <button className="small danger" disabled={loading} onClick={() => doDelete(s)}>×</button>
        </div>
      ))}
      {scenes.length === 0 && <div className="empty-hint">クラウドに保存されたシーンはありません</div>}
    </div>
    <div className="row" style={{ marginTop: 6 }}>
      <a href={logoutUrl()} style={{ fontSize: 10, color: '#998468' }}>ログアウト</a>
    </div>
  </>)
}
