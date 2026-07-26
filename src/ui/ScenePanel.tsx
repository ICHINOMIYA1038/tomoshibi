import { useEffect, useState } from 'react'
import { useStore, useIsDirty } from '../store'
import { importScene } from '../io/sceneIO'
import {
  loginUrl, signupUrl, logoutUrl, accountUrl,
  listCloudScenes, saveCloudSceneNew, updateCloudScene, loadCloudScene, deleteCloudScene,
  type CloudSceneMeta, CloudError,
} from '../io/cloud'
import { useCloudSession } from '../io/cloudSession'
import { useDraggablePanel } from './useDraggablePanel'

const FALLBACK_MAX_SCENES = 3

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
  const maxScenes = user.maxScenes ?? FALLBACK_MAX_SCENES
  const isPro = user.plan === 'pro'
  const atLimit = isNewScene && scenes.length >= maxScenes
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
    if (atLimit) {
      if (!isPro && proAvailable) { setShowUpgrade(true); return }
      setErr(
        !isPro && !proAvailable
          ? `シーンは ${maxScenes} 件まで保存できます。上限解除の Pro プランは現在準備中です。不要なシーンを削除してください。`
          : `シーンは ${maxScenes} 件まで保存できます。不要なシーンを削除してください。`
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
          <span className="scene-count">
            {scenes.length} / {isPro ? '∞' : maxScenes}
            {isPro && <span className="pro-badge" title="Pro プラン">Pro</span>}
          </span>
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
