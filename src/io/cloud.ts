// クラウド連携 (gikyoku_tosyokan の /api/tomoshibi/* を叩く)
// 認証Cookieは親ドメイン .gikyokutosyokan.com で共有される。
// 開発時は VITE_GIKYOKU_API_BASE で gikyoku_tosyokan のローカル起動先 (例: http://localhost:3000) を指定。

import { exportScene, importScene, type SerializedScene } from './sceneIO'

const PROD_BASE = 'https://www.gikyokutosyokan.com'
// @ts-expect-error vite injects
const ENV_BASE: string | undefined = import.meta.env?.VITE_GIKYOKU_API_BASE
const BASE =
  ENV_BASE ||
  (typeof location !== 'undefined' && /tomoshibi\.gikyokutosyokan\.com$/.test(location.hostname)
    ? PROD_BASE
    : PROD_BASE) // ローカル開発時は VITE_GIKYOKU_API_BASE を .env.local に設定

const API = `${BASE}/api/tomoshibi`

export interface CloudUser {
  id: string
  name: string | null
  image: string | null
}
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

export async function getSession(): Promise<CloudUser | null> {
  try {
    const { user } = await req<{ user: CloudUser | null }>('/session')
    return user
  } catch {
    return null
  }
}

export function loginUrl(): string {
  const cb = typeof location !== 'undefined' ? location.origin : 'https://tomoshibi.gikyokutosyokan.com'
  return `${BASE}/api/auth/signin/google?callbackUrl=${encodeURIComponent(cb)}`
}
export function logoutUrl(): string {
  const cb = typeof location !== 'undefined' ? location.origin : 'https://tomoshibi.gikyokutosyokan.com'
  return `${BASE}/api/auth/signout?callbackUrl=${encodeURIComponent(cb)}`
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

// 保存するペイロードからUI状態(panelOpenなど)を除き、シーン本体だけ送る
function pick(s: SerializedScene) {
  return {
    fixtures: s.fixtures,
    performers: s.performers,
    settings: s.settings,
  }
}
