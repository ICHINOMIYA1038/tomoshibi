import { useEffect, useState } from 'react'
import { useStore, useIsDirty } from '../store'
import { importScene } from '../io/sceneIO'
import {
  listSavedScenes, saveSceneLS, loadSceneLS, deleteSceneLS, makeShareURL, downloadSceneJSON,
} from '../io/sceneIO'
import {
  loginUrl, signupUrl, logoutUrl, accountUrl,
  listCloudScenes, saveCloudSceneNew, updateCloudScene, loadCloudScene, deleteCloudScene,
  type CloudSceneMeta, CloudError,
} from '../io/cloud'
import { useCloudSession } from '../io/cloudSession'
import { useDraggablePanel } from './useDraggablePanel'
import { getActiveSavedProjectName, setActiveSavedProjectName } from '../io/mockProjectSession'
import { flushMockAutosave, resetMockWorkspace } from '../io/mockWorkspace'
import { isWorkspacePath } from '../io/workspacePath'

const FALLBACK_MAX_SCENES = 3
const isMockPreview = isWorkspacePath()

export function ScenePanel() {
  const isMobile = typeof window !== 'undefined' && window.innerWidth <= 960
  const { panelProps, handleProps } = useDraggablePanel('scene', {
    x: typeof window !== 'undefined' ? window.innerWidth - 760 : 600,
    y: 12,
  })
  const update = useStore(s => s.updateSettings)
  const open = useStore(s => s.settings.scenePanelOpen)
  if (!open) return null

  return (
    <>
    <div className="scene-panel-backdrop" onClick={() => update({ scenePanelOpen: false })} />
    <div className="panel scene-panel" {...(isMobile || isMockPreview ? {} : panelProps)}>
      <div className="panel-header" {...(isMobile || isMockPreview ? {} : handleProps)}>
        <div className="panel-title">{isMockPreview ? 'プロジェクトを保存' : '舞台プランの保存・読込'}</div>
        <div className="panel-actions">
          <button className="icon-btn" title="閉じる" onClick={() => update({ scenePanelOpen: false })}>×</button>
        </div>
      </div>
      <div className="panel-body scene-body">
        <LocalScenes />
        {!isMockPreview && <CloudScenes />}
        {!isMockPreview && <SceneSharing />}
      </div>
    </div>
    </>
  )
}

function LocalScenes() {
  return isMockPreview
    ? <LocalScenesBody authenticated={false} loading={false} />
    : <LocalScenesWithSession />
}

function LocalScenesWithSession() {
  const { user, loading } = useCloudSession()
  return <LocalScenesBody authenticated={Boolean(user)} loading={loading} />
}

function LocalScenesBody({ authenticated, loading }: { authenticated: boolean; loading: boolean }) {
  const planTitle = useStore(s => s.productionPlan.title)
  const projectTitle = useStore(s => s.productionPlan.projectTitle)
  const dirty = useIsDirty()
  const markSaved = useStore(s => s.markSavedSnapshot)
  const updateSettings = useStore(s => s.updateSettings)
  const [name, setName] = useState(() => isMockPreview ? useStore.getState().productionPlan.projectTitle ?? '' : '')
  const [loadedName, setLoadedName] = useState<string | null>(() => isMockPreview ? getActiveSavedProjectName() : null)
  const [scenes, setScenes] = useState(listSavedScenes)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  if (loading || authenticated) return null

  const save = () => {
    const sceneName = name.trim()
    const previousActiveName = isMockPreview ? getActiveSavedProjectName() : null
    if (!sceneName) { setError(isMockPreview ? 'プロジェクト名を入力してください。' : '保存名を入力してください。'); return }
    if (scenes.some(scene => scene.name === sceneName) && loadedName !== sceneName &&
        !confirm(`「${sceneName}」に上書き保存しますか？`)) return
    try {
      if (isMockPreview) {
        useStore.getState().updateProductionPlan({ projectTitle: sceneName })
        setActiveSavedProjectName(sceneName)
        if (!flushMockAutosave()) throw new Error('autosave failed')
        resetMockWorkspace()
      } else saveSceneLS(sceneName)
      setName(sceneName)
      setLoadedName(sceneName)
      setScenes(listSavedScenes())
      setError('')
      setSuccess(`「${sceneName}」をこの端末に保存しました`)
      markSaved()
    } catch {
      if (isMockPreview) setActiveSavedProjectName(previousActiveName)
      setError('この端末に保存できませんでした。JSON 書き出しを利用してください。')
    }
  }
  const load = (sceneName: string) => {
    if (isMockPreview ? !flushMockAutosave() && !confirm('現在の変更を保存できませんでした。読み込みますか？')
      : dirty && !confirm('未保存の変更があります。読み込むと失われます。続けますか？')) return
    loadSceneLS(sceneName)
    if (isMockPreview) { setActiveSavedProjectName(sceneName); resetMockWorkspace() }
    setName(sceneName)
    setLoadedName(sceneName)
    markSaved()
    if (isMockPreview) updateSettings({ scenePanelOpen: false })
  }
  const create = () => {
    if (isMockPreview ? !flushMockAutosave() && !confirm('現在の変更を保存できませんでした。新しいプロジェクトを作りますか？')
      : dirty && !confirm('未保存の変更があります。新規プロジェクトを作ると失われます。続けますか？')) return
    useStore.getState().loadPreset('empty')
    if (isMockPreview) { useStore.getState().ensureScenes(); setActiveSavedProjectName(null); resetMockWorkspace() }
    setName('')
    setLoadedName(null)
    setError('')
    setSuccess('')
    markSaved()
    updateSettings({ scenePanelOpen: false })
  }
  const remove = (sceneName: string) => {
    if (!confirm(`「${sceneName}」を削除しますか？`)) return
    deleteSceneLS(sceneName)
    setScenes(listSavedScenes())
  }
  return (
    <section className="scene-section">
      <header className="scene-section-h"><span>{isMockPreview ? (dirty ? '未保存の変更があります' : 'この端末に保存') : 'この端末に保存'}</span></header>
      {isMockPreview ? <label className="project-save-label">保存する名前
        <input className="scene-name-input" value={name} maxLength={60} placeholder="例：秋公演 A劇場"
          onChange={e => { setName(e.target.value); setError(''); setSuccess('') }} />
      </label> : <input className="scene-name-input" value={name} maxLength={60} placeholder="保存名（作品名など）"
        onChange={e => setName(e.target.value)} />}
      {isMockPreview && <p className="scene-save-explainer">章・シーンと舞台の配置をまとめて保存します。名前を変えて保存すると、一覧に別のプロジェクトとして追加します。</p>}
      <div className="scene-actions">
        <button className="scene-cta primary" onClick={save}>{isMockPreview ? 'プロジェクトを保存' : '保存'}</button>
        <button className="scene-cta-sub" onClick={() => downloadSceneJSON(name.trim() || projectTitle?.trim() || planTitle.trim() || '無題のプラン')}>JSONを書き出す</button>
      </div>
      {error && <div className="scene-error">{error}</div>}
      {success && <div className="scene-save-success" role="status" aria-live="polite">{success}</div>}
      {!isMockPreview && scenes.length > 0 && <ul className="scene-list">
          {scenes.map(scene => <li className="scene-item" key={scene.name}>
            <button className="scene-item-main" aria-label={`${scene.name}を開く`} onClick={() => load(scene.name)}>
              <span className="scene-item-name">{scene.name}</span>
              {isMockPreview && <small>開く →</small>}
            </button>
            <button className="scene-item-del" onClick={() => remove(scene.name)}
              aria-label={`${scene.name} を削除`}>{isMockPreview ? '削除' : '×'}</button>
          </li>)}
      </ul>}
      <p className="scene-local-note">{isMockPreview
        ? '保存したプロジェクトは一覧画面から開けます。この端末のブラウザに保存されます。'
        : 'この端末だけに保存されます。別の端末から使うにはログインしてクラウドに保存してください。'}</p>
    </section>
  )
}

function SceneSharing() {
  const [shareURL, setShareURL] = useState('')
  const share = async () => {
    const url = makeShareURL()
    setShareURL(url)
    if (navigator.share) {
      try { await navigator.share({ url, title: 'TOMOSHIBIの舞台プラン' }); return }
      catch (error) { if (error instanceof DOMException && error.name === 'AbortError') return }
    }
    try { await navigator.clipboard.writeText(url) } catch { /* URL は画面からコピーできる */ }
  }
  return (
    <section className="scene-section">
      <header className="scene-section-h"><span>舞台プランを共有</span></header>
      <button className="scene-cta-sub" onClick={share}>共有URLを作成</button>
      {shareURL && <textarea className="scene-share-url" value={shareURL} readOnly onFocus={e => e.target.select()}
        aria-label="共有URL" />}
    </section>
  )
}

function CloudScenes() {
  const { user, proAvailable, loading: sessionLoading } = useCloudSession()
  const [scenes, setScenes] = useState<CloudSceneMeta[]>([])
  const [activeId, setActiveId] = useState<string | null>(null)
  const [activeName, setActiveName] = useState<string>('')
  const [loading, setLoading] = useState(false)
  const [err, setErr] = useState('')
  const [toast, setToast] = useState('')
  const [showUpgrade, setShowUpgrade] = useState(false)
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
          ログインすると、舞台プランを<br />
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
        <p className="scene-login-note">戯曲 ID（戯曲図書館・戯曲パレットと共通のアカウント）でログインします</p>
      </div>
    )
  }

  const isNewScene = !activeId
  const maxScenes = user.maxScenes ?? FALLBACK_MAX_SCENES
  const isPro = user.plan === 'pro'
  const atLimit = isNewScene && scenes.length >= maxScenes
  const showToast = (msg: string) => { setToast(msg); window.setTimeout(() => setToast(''), 1800) }

  const doNew = () => {
    if (!confirmDiscard('破棄して新しい舞台プランを開始')) return
    importScene({
      version: 1, name: '無題', savedAt: new Date().toISOString(),
      fixtures: [], performers: [], settings: {},
    })
    setActiveId(null); setActiveName('')
    markSaved()
  }
  const doSave = async () => {
    const n = activeName.trim()
    if (!n) { setErr('保存名を入力してください'); return }
    if (atLimit) {
      if (!isPro && proAvailable) { setShowUpgrade(true); return }
      setErr(
        !isPro && !proAvailable
          ? `舞台プランは ${maxScenes} 件まで保存できます。上限解除の Pro プランは現在準備中です。不要な舞台プランを削除してください。`
          : `舞台プランは ${maxScenes} 件まで保存できます。不要な舞台プランを削除してください。`
      )
      return
    }
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
      if (e instanceof CloudError) {
        if (e.status === 403 && !isPro && proAvailable) { setShowUpgrade(true) }
        else { setErr(e.message) }
      }
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
          placeholder={isNewScene ? '保存名を入れて保存' : ''}
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
          <span className="scene-count">
            {scenes.length} / {isPro ? '∞' : maxScenes}
            {isPro && <span className="pro-badge" title="Pro プラン">Pro</span>}
          </span>
        </header>
        {scenes.length === 0 ? (
          <div className="empty-hint">まだ保存された舞台プランはありません</div>
        ) : (
          <ul className="scene-list">
            {scenes.map(s => (
              <li key={s.id} className={'scene-item' + (activeId === s.id ? ' active' : '')}>
                <button
                  className="scene-item-main"
                  disabled={loading}
                  onClick={() => doLoad(s)}
                  title="この舞台プランを読み込む"
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

      {!isPro && proAvailable && (
        <section className="scene-section pro-upsell">
          <a href="/pro" className="pro-upsell-link">
            <span className="pro-upsell-icon">✦</span>
            <span className="pro-upsell-body">
              <strong>Pro プラン</strong>
              <span>月額300円で保存無制限</span>
            </span>
            <span className="pro-upsell-arrow">→</span>
          </a>
        </section>
      )}

      <footer className="scene-account">
        <span className="scene-account-name">{user.name ?? user.id}</span>
        <span className="scene-account-links">
          <a href={accountUrl()} className="scene-account-logout" title="アカウントの管理・削除は戯曲図書館マイページで行えます">
            アカウント管理
          </a>
          <a href={logoutUrl()} className="scene-account-logout">ログアウト</a>
        </span>
      </footer>

      {showUpgrade && (
        <UpgradeModal
          scenesCount={scenes.length}
          limit={maxScenes}
          onClose={() => setShowUpgrade(false)}
        />
      )}
    </>
  )
}

function UpgradeModal({ scenesCount, limit, onClose }: { scenesCount: number; limit: number; onClose: () => void }) {
  return (
    <div className="upgrade-backdrop" onClick={onClose}>
      <div className="upgrade-modal" onClick={e => e.stopPropagation()}>
        <button className="upgrade-close" onClick={onClose} aria-label="閉じる">×</button>
        <div className="upgrade-flame">✦</div>
        <h2>保存件数の上限に達しました</h2>
        <p>Free プランでは <strong>{limit} 件</strong> まで保存できます。<br />現在: {scenesCount} 件</p>
        <div className="upgrade-price">
          <span className="upgrade-price-amount">¥300</span>
          <span className="upgrade-price-per">/月</span>
        </div>
        <ul className="upgrade-bullets">
          <li>クラウド保存<strong>無制限</strong></li>
          <li>いつでも解約可能・違約金なし</li>
          <li>シミュレーター本体は Free と同じ全機能</li>
        </ul>
        <div className="upgrade-actions">
          <a href="/pro" className="upgrade-cta primary">Pro プランを見る</a>
          <button className="upgrade-cta-sub" onClick={onClose}>今はしない</button>
        </div>
      </div>
    </div>
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
