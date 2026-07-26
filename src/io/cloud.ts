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

export function loginUrl(): string {
  const cb = typeof location !== 'undefined' ? location.origin : 'https://tomoshibi.gikyokutosyokan.com'
  return `${BASE}/auth/signin?callbackUrl=${encodeURIComponent(cb)}`
}
export function logoutUrl(): string {
  const cb = typeof location !== 'undefined' ? location.origin : 'https://tomoshibi.gikyokutosyokan.com'
  // NextAuth 標準 /api/auth/signout は CSRF フォームが必要なので tomoshibi 専用ルートを使う
  return `${BASE}/api/tomoshibi/logout?callbackUrl=${encodeURIComponent(cb)}`
}
export function signupUrl(): string {
  const cb = typeof location !== 'undefined' ? location.origin : 'https://tomoshibi.gikyokutosyokan.com'
  return `${BASE}/auth/signup?callbackUrl=${encodeURIComponent(cb)}`
}
// アカウント削除は戯曲図書館本体のマイページで行う (tomoshibi固有のアカウントは存在しない)。
export function accountUrl(): string {
  return `${BASE}/mypage`
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
    settings: s.settings,
  }
}
