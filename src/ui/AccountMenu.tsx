import { useEffect, useState } from 'react'
import { APP_STORE_SUBSCRIPTIONS_URL, CloudError, accountUrl, createBillingPortal, loginUrl, logoutUrl } from '../io/cloud'
import { useCloudSession } from '../io/cloudSession'

/** 名前の最初の 1 文字。アイコン画像が無い人の代わりに丸の中に出す */
function initialOf(name: string | null): string {
  const first = name?.trim() ? Array.from(name.trim())[0] : ''
  return first ? first.toUpperCase() : '?'
}

/**
 * ヘッダー右上のアカウントのボタン。
 * ログアウト中は「ログイン」、ログイン中は利用者のアイコン（無ければ名前の頭文字）を出し、
 * 押すとアカウント管理・契約の管理・ログアウトのメニューを開く。
 * Web 版とアプリで同じ部品を使う（アプリではログインと戯曲 ID の画面がシートで開く）。
 * `floating` は旧画面用で、画面の右上に固定する。
 */
export function AccountMenu({ floating = false }: { floating?: boolean }) {
  const { user, loading } = useCloudSession()
  const [open, setOpen] = useState(false)
  const [portalBusy, setPortalBusy] = useState(false)
  const [portalErr, setPortalErr] = useState('')
  const rootClass = 'account-menu-root' + (floating ? ' floating' : '')

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false) }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open])

  const openPortal = async () => {
    setPortalBusy(true); setPortalErr('')
    try {
      const { url } = await createBillingPortal()
      window.location.href = url
    } catch (e) {
      setPortalErr(e instanceof CloudError ? e.message : String(e))
      setPortalBusy(false)
    }
  }

  if (loading && !user) return <div className={rootClass}><span className="account-menu-trigger loading" aria-label="ログイン状態を確認中">…</span></div>

  if (!user) {
    return (
      <div className={rootClass}>
        <a className="account-menu-trigger login" href={loginUrl()}>ログイン</a>
      </div>
    )
  }

  const isPro = user.plan === 'pro'
  const renewLabel = user.planExpiresAt
    ? new Date(user.planExpiresAt).toLocaleDateString('ja-JP', { year: 'numeric', month: 'long', day: 'numeric' })
    : null
  const avatar = (size: 'small' | 'large') => user.image
    ? <img src={user.image} alt="" className={`account-menu-avatar ${size}`} referrerPolicy="no-referrer" />
    : <span className={`account-menu-avatar initial ${size}`} aria-hidden>{initialOf(user.name)}</span>

  return (
    <div className={rootClass}>
      <button
        className={`account-menu-trigger avatar${open ? ' open' : ''}${isPro ? ' pro' : ''}`}
        onClick={() => setOpen(v => !v)}
        aria-expanded={open}
        aria-haspopup="menu"
        aria-label={`${user.name ?? 'ログイン中'}のアカウント`}
      >
        {avatar('small')}
        {isPro && <span className="account-menu-pro-dot" aria-hidden />}
      </button>

      {open && (
        <>
          <div className="account-menu-backdrop" onClick={() => setOpen(false)} />
          <div className="account-menu-panel" role="menu">
            <header className="account-menu-header">
              {avatar('large')}
              <div className="account-menu-header-body">
                <div className="account-menu-name">{user.name ?? 'ログイン中'}</div>
                <div className="account-menu-plan">
                  {isPro
                    ? <><span className="pro-badge">Pro</span>{renewLabel && <span className="account-menu-renew">〜 {renewLabel}</span>}</>
                    : <span className="account-menu-free">Free プラン</span>}
                </div>
              </div>
            </header>

            <div className="account-menu-section">
              <a className="account-menu-item" role="menuitem" href={accountUrl()} onClick={() => setOpen(false)}>
                <span className="account-menu-icon" aria-hidden>👤</span>
                アカウント管理
              </a>
              {isPro && user.billing === 'app_store' ? (
                // App Store で買った契約は Stripe のポータルでは扱えない。iOS の設定で管理する
                <a className="account-menu-item" role="menuitem" href={APP_STORE_SUBSCRIPTIONS_URL} onClick={() => setOpen(false)}>
                  <span className="account-menu-icon" aria-hidden>⚙</span>
                  契約の管理（App Store）
                </a>
              ) : isPro ? (
                <button className="account-menu-item" role="menuitem" onClick={openPortal} disabled={portalBusy}>
                  <span className="account-menu-icon" aria-hidden>⚙</span>
                  契約の管理（領収書・支払い方法・解約）
                </button>
              ) : (
                <a className="account-menu-item" role="menuitem" href="/pro" onClick={() => setOpen(false)}>
                  <span className="account-menu-icon" aria-hidden>✦</span>
                  契約の管理（Pro プラン）
                </a>
              )}
              {portalBusy && <div className="account-menu-note">契約の管理画面へ移動中…</div>}
              {portalErr && <div className="account-menu-err">{portalErr}</div>}
            </div>

            <div className="account-menu-section">
              <a className="account-menu-item" role="menuitem" href={logoutUrl()}>
                <span className="account-menu-icon" aria-hidden>↩</span>
                ログアウト
              </a>
            </div>
          </div>
        </>
      )}
    </div>
  )
}
