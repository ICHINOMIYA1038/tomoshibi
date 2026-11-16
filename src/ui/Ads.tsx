import { useEffect, useRef } from 'react'
import { useCloudSession } from '../io/cloudSession'
import { hasDeviceStorage } from '../io/workspaceStorage'

// 無料プランの広告（Google AdSense）。Pro の人・iOS アプリ・本番以外では出さない。
// 広告ユニットは AdSense の「tomoshibi-library」（2026-11-16 作成、レスポンシブ）。

const AD_CLIENT = 'ca-pub-8691137965825158'
const AD_SLOT = '9628738613'
const PRODUCTION_HOST = 'tomoshibi.gikyokutosyokan.com'
/** 本番以外で、置き場所だけを確かめるとき（?ad-preview）。広告は読み込まず、仮の枠を出す */
const AD_PREVIEW = typeof window !== 'undefined' && window.location.hostname !== PRODUCTION_HOST
  && new URLSearchParams(window.location.search).has('ad-preview')

/** 広告を出してよい人か。ログイン状態を確かめているあいだは出さない（Pro の人に一瞬出ないように） */
export function useShowAds() {
  const { user, loading } = useCloudSession()
  if (typeof window === 'undefined' || (window.location.hostname !== PRODUCTION_HOST && !AD_PREVIEW)) return false
  // iOS アプリ（WKWebView）では AdSense を使えない
  if (hasDeviceStorage()) return false
  if (loading) return false
  return user?.plan !== 'pro'
}

let scriptAdded = false
function loadAdScript() {
  if (scriptAdded) return
  scriptAdded = true
  const script = document.createElement('script')
  script.async = true
  script.crossOrigin = 'anonymous'
  script.src = `https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=${AD_CLIENT}`
  document.head.appendChild(script)
}

/** 広告 1 枠。width を数値にすると、その大きさに固定する（画面に固定する広告は幅 300px 以下が AdSense の決まり） */
export function AdSlot({ width, height, className }: { width: number | '100%'; height: number; className?: string }) {
  const ref = useRef<HTMLModElement>(null)
  useEffect(() => {
    if (AD_PREVIEW) return
    loadAdScript()
    try { ((window as unknown as { adsbygoogle?: unknown[] }).adsbygoogle ??= []).push({}) } catch { /* 広告が読めなくても画面は動かす */ }
  }, [])
  return <div className={'ad-slot' + (className ? ' ' + className : '')}>
    <span className="ad-slot-label">広告</span>
    {AD_PREVIEW ? <div className="ad-slot-preview" style={{ width, height }}>広告（仮の枠）</div> : <ins ref={ref} className="adsbygoogle" style={{ display: 'inline-block', width, height }}
      data-ad-client={AD_CLIENT} data-ad-slot={AD_SLOT} />}
  </div>
}
