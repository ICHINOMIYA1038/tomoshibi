// クラウド連携 (gikyoku_tosyokan の /api/tomoshibi/* を叩く)
// 認証Cookieは親ドメイン .gikyokutosyokan.com で共有される。
// 開発時は VITE_GIKYOKU_API_BASE で gikyoku_tosyokan のローカル起動先 (例: http://localhost:3000) を指定。

import { exportScene, importScene, type SerializedScene } from './sceneIO'

// CORSプリフライトが 301 (www→apex) を追えないため apex 直指定
const PROD_BASE = 'https://gikyokutosyokan.com'
// @ts-expect-error vite injects
const ENV_BASE: string | undefined = import.meta.env?.VITE_GIKYOKU_API_BASE
const BASE =
  ENV_BASE ||
  (typeof location !== 'undefined' && /tomoshibi\.gikyokutosyokan\.com$/.test(location.hostname)
    ? PROD_BASE
    : PROD_BASE) // ローカル開発時は VITE_GIKYOKU_API_BASE を .env.local に設定

const API = `${BASE}/api/tomoshibi`

/**
 * TOMOSHIBI小屋 iOSアプリのWebView内で動いているかを判定する。
 * アプリはWebViewControllerに `TomoshibiSession` というJavaScriptChannelを
 * 登録しており、WKWebViewはページ自身のスクリプトが動く前に
 * window.webkit.messageHandlers.<channel名> を用意するため、通常のブラウザでは
 * 絶対に存在しない確実な判定材料として使える (追加のプラミング不要)。
 *
 * Guideline 5.1.1(v)対応: Web購読者向けのStripe Checkoutはアカウントに
 * 紐付ける都合上ログインを必須にしてよいが、アプリ内のネイティブIAP購入は
 * ログイン (会員登録) を必須にしてはならない。この判定でアプリ内かどうかを
 * 区別し、Proページの購入導線を出し分ける。
 */
export function isNativeApp(): boolean {
  if (typeof window === 'undefined') return false
  const webkit = (window as unknown as { webkit?: { messageHandlers?: Record<string, unknown> } }).webkit
  return Boolean(webkit?.messageHandlers?.TomoshibiSession)
}

/** アプリ内で未ログインのままネイティブ購入を開始するためのカスタムスキームURL。 */
export const NATIVE_PURCHASE_URL = 'tomoshibi://native-purchase'

export type CloudPlan = 'free' | 'pro'

export interface CloudUser {
  id: string
  name: string | null
  image: string | null
  /** 現在のプラン。バックエンドが返さない旧セッションでは 'free' 扱い。 */
  plan: CloudPlan
  /** Pro 期限。free ならず null。 */
  planExpiresAt: string | null
  /** 保存できるシーンの上限。バックエンドから返す。 */
  maxScenes: number
}

export const FREE_MAX_SCENES = 3
export interface CloudSceneMeta {
  id: string
  name: string
  updatedAt: string
  createdAt?: string
}

export class CloudError extends Error {
  status: number
  constructor(message: string, status: number) {
    super(message)
    this.status = status
  }
}

async function req<T>(path: string, init: RequestInit = {}): Promise<T> {
  const res = await fetch(`${API}${path}`, {
    credentials: 'include',
    headers: { 'content-type': 'application/json', ...(init.headers || {}) },
    ...init,
  })
  if (res.status === 204) return undefined as T
  let body: unknown = null
  try { body = await res.json() } catch { /* noop */ }
  if (!res.ok) {
    const msg = (body as { error?: string })?.error ?? `HTTP ${res.status}`
    throw new CloudError(msg, res.status)
  }
  return body as T
}

/** getSession() の結果全体。user が null でも proAvailable は取れる。 */
export interface SessionSnapshot {
  user: CloudUser | null
  /** Stripe が本番モードで有効になっているか。false なら Pro 申込 UI を「準備中」に。 */
  proAvailable: boolean
}

export async function getSessionSnapshot(): Promise<SessionSnapshot> {
  try {
    const res = await req<{ user: Partial<CloudUser> | null; proAvailable?: boolean }>('/session')
    const proAvailable = res.proAvailable === true
    if (!res.user) return { user: null, proAvailable }
    const u = res.user
    markServiceSeen()
    return {
      user: {
        id: String(u.id),
        name: u.name ?? null,
        image: u.image ?? null,
        plan: (u.plan === 'pro' ? 'pro' : 'free') as CloudPlan,
        planExpiresAt: u.planExpiresAt ?? null,
        maxScenes: typeof u.maxScenes === 'number' ? u.maxScenes : FREE_MAX_SCENES,
      },
      proAvailable,
    }
  } catch {
    return { user: null, proAvailable: false }
  }
}

/** 後方互換 (単体で user だけ欲しい場所用) */
export async function getSession(): Promise<CloudUser | null> {
  const snap = await getSessionSnapshot()
  return snap.user
}

// ログイン・ログアウト・アカウントは戯曲 ID のポータル（3 サービス共通、2026-11）
// iOS アプリの WebView はポータルをアプリ内で開かず Safari に飛ばすので、アプリの中では図書館の入口を使う（アプリ側がログイン用シートに差し替える）
const PORTAL = 'https://id.gikyokutosyokan.com'
const here = () => (typeof location !== 'undefined' ? location.origin + '/' : 'https://tomoshibi.gikyokutosyokan.com/')

export function loginUrl(): string {
  if (isNativeApp()) return `${BASE}/auth/signin?callbackUrl=${encodeURIComponent(here())}`
  return `${PORTAL}/?return_to=${encodeURIComponent(here())}`
}
export function logoutUrl(): string {
  if (isNativeApp()) return `${BASE}/api/tomoshibi/logout?callbackUrl=${encodeURIComponent(here())}`
  return `${PORTAL}/logout?return_to=${encodeURIComponent(here())}`
}
export function signupUrl(): string {
  return loginUrl()
}
/** アカウント設定と退会はポータルで行う（TOMOSHIBI 固有のアカウントは無い） */
export function accountUrl(): string {
  if (isNativeApp()) return `${BASE}/mypage`
  return `${PORTAL}/account`
}

/**
 * 戯曲 ID でこのサービスを使ったことをポータルに知らせる（運営の一覧用）。
 * 親ドメインの Cookie が一緒に送られる。1 日に 1 回で十分なので localStorage で間引く
 */
export function markServiceSeen(): void {
  try {
    const key = 'gid_seen_tomoshibi'
    const today = new Date().toISOString().slice(0, 10)
    if (localStorage.getItem(key) === today) return
    localStorage.setItem(key, today)
  } catch {
    /* localStorage が使えない環境ではそのまま送る */
  }
  fetch(`${PORTAL}/api/seen`, {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ service: 'tomoshibi' }),
  }).catch(() => undefined)
}

export function listCloudScenes() {
  return req<{ items: CloudSceneMeta[] }>('/scenes').then(r => r.items)
}

export function saveCloudSceneNew(name: string) {
  const scene = exportScene(name)
  return req<CloudSceneMeta>('/scenes', {
    method: 'POST',
    body: JSON.stringify({ name, data: pick(scene) }),
  })
}

export function updateCloudScene(id: string, name?: string) {
  const scene = exportScene(name ?? '更新')
  return req<CloudSceneMeta>(`/scenes/${id}`, {
    method: 'PUT',
    body: JSON.stringify({ name, data: pick(scene) }),
  })
}

export async function loadCloudScene(id: string) {
  const s = await req<{ id: string; name: string; data: Partial<SerializedScene>; updatedAt: string }>(`/scenes/${id}`)
  importScene({
    version: 1,
    name: s.name,
    savedAt: s.updatedAt,
    fixtures: s.data.fixtures ?? [],
    performers: s.data.performers ?? [],
    setPieces: s.data.setPieces,
    settings: s.data.settings ?? {},
  })
  return s
}

export function deleteCloudScene(id: string) {
  return req<void>(`/scenes/${id}`, { method: 'DELETE' })
}

/** Stripe Checkout セッションを作成し、Stripe ホスト画面の URL を返す。 */
export async function createProCheckout(): Promise<{ url: string }> {
  return req<{ url: string }>('/checkout', { method: 'POST', body: '{}' })
}

/** Stripe Customer Portal (解約・支払い方法変更) の URL を返す。 */
export async function createBillingPortal(): Promise<{ url: string }> {
  return req<{ url: string }>('/billing-portal', { method: 'POST', body: '{}' })
}

// 保存するペイロードからUI状態(panelOpenなど)を除き、シーン本体だけ送る
function pick(s: SerializedScene) {
  return {
    fixtures: s.fixtures,
    performers: s.performers,
    // 装置はサーバ側 (validateSceneData) も受け付けているのに送っていなかった。
    // クラウド保存→読込で装置が消える原因。
    setPieces: s.setPieces ?? [],
    settings: s.settings,
  }
}
