import { getProjectEditorIdentity } from './projectEditorIdentity'
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
  maxProjects: number
  /** Pro の契約の窓口。'stripe' は Web（Stripe のポータル）、'app_store' は iOS の App Store。free なら null */
  billing: 'stripe' | 'app_store' | null
  /** Stripe の顧客がある（Web で買ったことがある） */
  hasStripeCustomer: boolean
}

/** App Store のサブスクリプションの管理画面。iPhone では App Store アプリの該当画面が開く */
export const APP_STORE_SUBSCRIPTIONS_URL = 'https://apps.apple.com/account/subscriptions'

export const FREE_MAX_SCENES = 3
export interface CloudSceneMeta {
  id: string
  name: string
  updatedAt: string
  createdAt?: string
}

export interface CloudProjectMeta {
  id: string
  name: string
  revision: number
  origin?: string | null
  updatedAt: string
  createdAt?: string
}

export interface CloudProject extends CloudProjectMeta {
  data: SerializedScene
}

export class CloudError extends Error {
  status: number
  constructor(message: string, status: number) {
    super(message)
    this.status = status
  }
}

let renewingLogin: Promise<void> | null = null
let lastLoginRenewal = 0
async function renewLogin() {
  if (isNativeApp()) return
  if (renewingLogin) return renewingLogin
  if (Date.now() - lastLoginRenewal < 15_000) return
  lastLoginRenewal = Date.now()
  renewingLogin = fetch(`${PORTAL}/refresh?return_to=${encodeURIComponent(location.origin + '/robots.txt')}`, {
    credentials: 'include', mode: 'no-cors', cache: 'no-store', signal: AbortSignal.timeout(10_000),
  }).then(() => undefined).finally(() => { renewingLogin = null })
  return renewingLogin
}

async function req<T>(path: string, init: RequestInit = {}, retryLogin = true): Promise<T> {
  const res = await fetch(`${API}${path}`, {
    credentials: 'include',
    headers: { 'content-type': 'application/json', ...(init.headers || {}) },
    ...init,
  })
  if (res.status === 401 && retryLogin && !isNativeApp()) {
    await renewLogin()
    return req<T>(path, init, false)
  }
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
  unavailable?: boolean
  user: CloudUser | null
  /** Stripe が本番モードで有効になっているか。false なら Pro 申込 UI を「準備中」に。 */
  proAvailable: boolean
}

export async function getSessionSnapshot(): Promise<SessionSnapshot> {
  try {
    let res = await req<{ user: Partial<CloudUser> | null; proAvailable?: boolean; needsRefresh?: boolean }>('/session')
    if (!res.user && res.needsRefresh && !isNativeApp()) {
      await renewLogin()
      res = await req<typeof res>('/session', {}, false)
    }
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
        maxProjects: typeof u.maxProjects === 'number' ? u.maxProjects : u.plan === 'pro' ? 10 : 2,
        // 古い API が billing を返さないときは、これまでどおり Stripe とみなす
        billing: u.plan !== 'pro' ? null : u.billing === 'app_store' ? 'app_store' : 'stripe',
        hasStripeCustomer: u.hasStripeCustomer !== false,
      },
      proAvailable,
    }
  } catch {
    return { user: null, proAvailable: false, unavailable: true }
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
const here = () => (typeof location !== 'undefined' ? location.origin + location.pathname : 'https://tomoshibi.gikyokutosyokan.com/')

export function loginUrl(): string {
  const destination = /\/(studio|mock)(\/|$)/.test(location.pathname) ? location.origin + location.pathname.replace(/\/(studio|mock)(\/.*)?$/, '/$1/projects/?import=local') : here()
  if (isNativeApp()) return `${BASE}/auth/signin?callbackUrl=${encodeURIComponent(destination)}`
  return `${PORTAL}/?return_to=${encodeURIComponent(destination)}`
}
export function logoutUrl(): string {
  if (isNativeApp()) return `${BASE}/api/tomoshibi/logout?callbackUrl=${encodeURIComponent(here())}`
  return `${PORTAL}/logout?return_to=${encodeURIComponent(here())}`
}
export function signupUrl(): string {
  return loginUrl()
}
/**
 * アカウント設定と退会は戯曲 ID のポータルで行う（TOMOSHIBI 固有のアカウントは無い）。
 * iOS アプリ（1.0.4〜）はこの URL をログイン用のシートで開き、閉じると tomoshibi://account でアプリに戻る。
 * 戯曲図書館のマイページには飛ばさない（2026-11-14 オーナー決定）
 */
export function accountUrl(): string {
  if (isNativeApp()) return `${PORTAL}/account?return_to=${encodeURIComponent('tomoshibi://account')}`
  return `${PORTAL}/account?return_to=${encodeURIComponent(here())}`
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

export function listCloudProjects() {
  return req<{ items: CloudProjectMeta[] }>('/projects').then(result => result.items)
}

export function fetchCloudProject(id: string) {
  return req<CloudProject>(`/projects/${id}`)
}

export function createCloudProject(name: string, data: SerializedScene, importKey?: string) {
  return req<CloudProjectMeta>('/projects', {
    method: 'POST', body: JSON.stringify({ name, data, importKey }),
  })
}

export function updateCloudProject(id: string, revision: number, name: string, data: SerializedScene, replace = false, editorId = getProjectEditorIdentity(id)) {
  if (!editorId) return Promise.reject(new CloudError('この画面の編集権を確認してください', 423))
  return req<CloudProjectMeta>(`/projects/${id}`, {
    method: 'PUT', body: JSON.stringify({ name, data, revision, replace, editorId }),
  })
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

export async function fetchCloudScene(id: string): Promise<SerializedScene> {
  const s = await req<{ id: string; name: string; data: Partial<SerializedScene>; updatedAt: string }>(`/scenes/${id}`)
  return {
    version: 1,
    name: s.name,
    savedAt: s.updatedAt,
    fixtures: s.data.fixtures ?? [],
    performers: s.data.performers ?? [],
    setPieces: s.data.setPieces,
    productionPlan: s.data.productionPlan,
    settings: s.data.settings ?? {},
  }
}

export async function loadCloudScene(id: string) {
  const scene = await fetchCloudScene(id)
  importScene(scene)
  return scene
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
    productionPlan: s.productionPlan,
    settings: s.settings,
  }
}

export function syncBilling() {
  return req<{ plan: 'pro'; planExpiresAt: string }>('/billing-sync', { method: 'POST', body: '{}' })
}

export function requestProjectEditor(id: string, editorId: string, action: 'acquire' | 'renew' | 'takeover' | 'release') {
  return req<{ ttlMs: number; project?: CloudProject }>(`/projects/${id}/edit`, {
    method: 'POST', body: JSON.stringify({ editorId, action }), keepalive: action === 'release', signal: AbortSignal.timeout(10_000),
  })
}

export async function replaceCloudProject(id: string, revision: number, name: string, data: SerializedScene) {
  const currentEditor = getProjectEditorIdentity(id)
  if (currentEditor) return updateCloudProject(id, revision, name, data, true, currentEditor)
  const editorId = crypto.randomUUID()
  await requestProjectEditor(id, editorId, 'acquire')
  try { return await updateCloudProject(id, revision, name, data, true, editorId) }
  finally { await requestProjectEditor(id, editorId, 'release').catch(() => undefined) }
}
