// シーン保存/読込
// - localStorage に名前付きで複数保存
// - JSON エクスポート/インポート
// - URL hash でショー共有 (#scene=base64(json))

import { useStore, type Fixture, type Performer, type SceneSettings } from '../store'
import type { SetPiece } from '../types'

export interface SerializedScene {
  version: 1
  name: string
  savedAt: string
  fixtures: Fixture[]
  performers: Performer[]
  /** 装置(平台・箱馬・GLTF)。装置対応前の保存データには無いので optional。 */
  setPieces?: SetPiece[]
  settings: Partial<SceneSettings>
}

export function exportScene(name: string = '無題'): SerializedScene {
  const s = useStore.getState()
  return {
    version: 1,
    name,
    savedAt: new Date().toISOString(),
    fixtures: s.fixtures,
    performers: s.performers,
    // blob: URL の GLTF は再読込できないため、URL を持たない形で保存する
    // (位置・大きさは残るので、再取込すれば同じ場所に戻せる)。
    setPieces: s.setPieces.map(sp =>
      sp.url && sp.url.startsWith('blob:') ? { ...sp, url: undefined } : sp,
    ),
    settings: {
      hazeDensity: s.settings.hazeDensity,
      ambient: s.settings.ambient,
      exposure: s.settings.exposure,
      bloom: s.settings.bloom,
      quality: s.settings.quality,
      cameraView: s.settings.cameraView,
    },
  }
}

export function importScene(scene: SerializedScene) {
  if (scene.version !== 1) {
    console.warn('Unsupported scene version', scene.version)
  }
  useStore.setState(s => ({
    fixtures: scene.fixtures,
    performers: scene.performers,
    // 装置が保存されていない古いデータでは、いま舞台にある装置をそのまま残す。
    setPieces: Array.isArray(scene.setPieces) ? scene.setPieces : s.setPieces,
    settings: { ...s.settings, ...scene.settings },
    selection: { kind: null, id: null },
  }))
}

// ---- localStorage 多数保存 ----
const LS_KEY = 'syoumei.scenes'

export function listSavedScenes(): SerializedScene[] {
  try {
    const raw = localStorage.getItem(LS_KEY)
    if (!raw) return []
    return JSON.parse(raw)
  } catch { return [] }
}
export function saveSceneLS(name: string) {
  const list = listSavedScenes()
  const scene = exportScene(name)
  const idx = list.findIndex(s => s.name === name)
  if (idx >= 0) list[idx] = scene
  else list.push(scene)
  localStorage.setItem(LS_KEY, JSON.stringify(list))
}
export function deleteSceneLS(name: string) {
  const list = listSavedScenes().filter(s => s.name !== name)
  localStorage.setItem(LS_KEY, JSON.stringify(list))
}
export function loadSceneLS(name: string) {
  const list = listSavedScenes()
  const s = list.find(x => x.name === name)
  if (s) importScene(s)
}

// ---- JSON ダウンロード/アップロード ----
export function downloadSceneJSON(name?: string) {
  const scene = exportScene(name || `scene_${Date.now()}`)
  const blob = new Blob([JSON.stringify(scene, null, 2)], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `${scene.name}.shou.json`
  a.click()
  URL.revokeObjectURL(url)
}
export async function uploadSceneJSON(file: File) {
  const text = await file.text()
  const scene: SerializedScene = JSON.parse(text)
  importScene(scene)
}

// ---- URL hash 共有 ----
// 圧縮: JSON → base64 (大きい場合は警告)
// production = tomoshibi.gikyokutosyokan.com を使う
export function makeShareURL(): string {
  const scene = exportScene('shared')
  const json = JSON.stringify(scene)
  const b64 = btoa(unescape(encodeURIComponent(json)))
  // 開発中は localhost、本番は tomoshibi.gikyokutosyokan.com を使うのが分かりやすい
  const isLocal = /localhost|127\.0\.0\.1/.test(location.hostname)
  const origin = isLocal ? location.origin : 'https://tomoshibi.gikyokutosyokan.com'
  return `${origin}/#scene=${b64}`
}
export function tryLoadFromHash(): boolean {
  const m = location.hash.match(/#scene=([^&]+)/)
  if (!m) return false
  try {
    const json = decodeURIComponent(escape(atob(m[1])))
    const scene: SerializedScene = JSON.parse(json)
    importScene(scene)
    return true
  } catch (e) {
    console.warn('URL hash decode failed', e)
    return false
  }
}
