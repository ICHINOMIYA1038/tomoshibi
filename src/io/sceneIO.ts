// シーン保存/読込
// - localStorage に名前付きで複数保存
// - JSON エクスポート/インポート
// - URL hash でショー共有 (#scene=base64(json))

import {
  useStore, syncEntityIds, emptyProductionPlan, captureActiveScene, ensurePlanHierarchy, sceneSnapshot, sceneStage, PLAN_LIMITS,
  type Fixture, type Performer, type SceneSettings, type ProductionPlan, type SceneTriggerType, type StagePoint,
} from '../store'
import type { SetPiece } from '../types'

export interface SerializedScene {
  version: 1 | 2
  name: string
  savedAt: string
  fixtures: Fixture[]
  performers: Performer[]
  /** 装置(平台・箱馬・GLTF)。装置対応前の保存データには無いので optional。 */
  setPieces?: SetPiece[]
  productionPlan?: ProductionPlan
  settings: Partial<SceneSettings>
}

export function exportScene(name: string = '無題'): SerializedScene {
  const s = useStore.getState()
  const serializablePieces = (pieces: SetPiece[]) => pieces.map(piece =>
    piece.url?.startsWith('blob:') ? { ...piece, url: undefined } : piece,
  )
  const plan = s.productionPlan.scenes.length
    ? ensurePlanHierarchy(captureActiveScene(s.productionPlan, s)) : s.productionPlan
  return {
    version: 2,
    name,
    savedAt: new Date().toISOString(),
    fixtures: s.fixtures,
    performers: s.performers,
    setPieces: serializablePieces(s.setPieces),
    productionPlan: {
      ...plan,
      scenes: plan.scenes.map(scene => ({ ...scene, setPieces: serializablePieces(scene.setPieces) })),
    },
    settings: {
      hazeDensity: s.settings.hazeDensity,
      ambient: s.settings.ambient,
      exposure: s.settings.exposure,
      bloom: s.settings.bloom,
      showHouseLights: s.settings.showHouseLights,
      quality: s.settings.quality,
      cameraView: s.settings.cameraView,
    },
  }
}

export function importScene(scene: SerializedScene) {
  if (scene.version !== 1 && scene.version !== 2) {
    console.warn('Unsupported scene version', scene.version)
  }
  const plan = normalizeProductionPlan(scene.productionPlan, scene.fixtures, scene.performers, scene.setPieces ?? [])
  const active = plan.scenes.find(item => item.id === plan.activeSceneId)
  const stage = active ? sceneStage(active) : {
    fixtures: scene.fixtures,
    performers: scene.performers,
    setPieces: scene.setPieces ?? [],
  }
  syncEntityIds(
    [...stage.fixtures, ...plan.scenes.flatMap(item => item.fixtures)],
    [...stage.performers, ...plan.scenes.flatMap(item => item.performers)],
  )
  useStore.setState(s => ({
    fixtures: stage.fixtures,
    performers: stage.performers,
    setPieces: stage.setPieces,
    productionPlan: plan,
    settings: { ...s.settings, ...scene.settings },
    selection: { kind: null, id: null },
  }))
}

function normalizeProductionPlan(raw: unknown, fixtures: Fixture[], performers: Performer[], setPieces: SetPiece[]): ProductionPlan {
  if (!raw || typeof raw !== 'object') return emptyProductionPlan()
  const data = raw as Partial<ProductionPlan> & {
    note?: string
    beats?: Array<{ id?: string; title?: string; cue?: string; note?: string; positions?: Record<string, unknown> }>
    directions?: Array<{ performerId?: string; kind?: string; from?: unknown; to?: unknown; note?: string }>
  }
  const performerIds = new Set(performers.map(p => p.id))
  const point = (value: unknown): StagePoint | null => {
    if (!Array.isArray(value) || value.length !== 2 || !value.every(n => typeof n === 'number' && Number.isFinite(n))) return null
    return [Math.max(-9.4, Math.min(9.4, value[0])), Math.max(-8, Math.min(2, value[1]))]
  }
  const title = typeof data.title === 'string' ? data.title.slice(0, 60) : ''
  const projectTitle = typeof data.projectTitle === 'string' ? data.projectTitle.slice(0, 60)
    : [data.workTitle, data.venueTitle].filter(value => typeof value === 'string' && value.trim()).join(' / ').slice(0, 60)
  const workTitle = typeof data.workTitle === 'string' ? data.workTitle.slice(0, 60) : ''
  const venueTitle = typeof data.venueTitle === 'string' ? data.venueTitle.slice(0, 60) : ''
  if (Array.isArray(data.scenes)) {
    const chapters = Array.isArray(data.chapters) ? data.chapters.slice(0, PLAN_LIMITS.chapters).filter(item =>
      item && typeof item.id === 'string' && typeof item.title === 'string').map(item =>
      ({ id: item.id.slice(0, 80), title: item.title.slice(0, 60) })) : []
    const chapterIds = new Set(chapters.map(item => item.id))
    const sequences = Array.isArray(data.sequences) ? data.sequences.slice(0, 100).filter(item =>
      item && typeof item.id === 'string' && typeof item.title === 'string' && chapterIds.has(item.chapterId)).map(item =>
      ({ id: item.id.slice(0, 80), chapterId: item.chapterId, title: item.title.slice(0, 60) })) : []
    const scenes = data.scenes.slice(0, PLAN_LIMITS.scenes).flatMap(rawScene => {
      if (!rawScene || typeof rawScene.id !== 'string') return []
      const source = {
        fixtures: Array.isArray(rawScene.fixtures) ? rawScene.fixtures : fixtures,
        performers: Array.isArray(rawScene.performers) ? rawScene.performers : performers,
        setPieces: Array.isArray(rawScene.setPieces) ? rawScene.setPieces : setPieces,
      }
      return [{
        ...sceneSnapshot(source),
        id: rawScene.id,
        sequenceId: typeof rawScene.sequenceId === 'string' ? rawScene.sequenceId : undefined,
        title: typeof rawScene.title === 'string' ? rawScene.title.slice(0, 60) : 'シーン',
        triggerType: (['dialogue', 'sound', 'light', 'other'] as const).includes(rawScene.triggerType as SceneTriggerType)
          ? rawScene.triggerType as SceneTriggerType : undefined,
        trigger: typeof rawScene.trigger === 'string' ? rawScene.trigger.slice(0, 160) : '',
        note: typeof rawScene.note === 'string' ? rawScene.note.slice(0, 1000) : '',
      }]
    })
    const activeSceneId = scenes.some(scene => scene.id === data.activeSceneId)
      ? data.activeSceneId as string : scenes[scenes.length - 1]?.id ?? null
    return scenes.length ? ensurePlanHierarchy({ title, projectTitle, workTitle, venueTitle, chapters, sequences, scenes, activeSceneId })
      : { title, projectTitle, workTitle, venueTitle, chapters: [], sequences: [], scenes, activeSceneId }
  }
  const scenes = [] as ProductionPlan['scenes']
  if (Array.isArray(data.beats)) {
    for (const beat of data.beats.slice(0, 100)) {
      if (!beat || !beat.positions || typeof beat.positions !== 'object') continue
      const positioned = performers.map(p => {
        const value = performerIds.has(p.id) ? point(beat.positions?.[p.id]) : null
        return value ? { ...p, position: [value[0], p.position[1], value[1]] as Performer['position'] } : p
      })
      scenes.push({
        ...sceneSnapshot({ fixtures, performers: positioned, setPieces }),
        ...(typeof beat.id === 'string' ? { id: `sc-${beat.id}` } : {}),
        title: typeof beat.title === 'string' ? beat.title.slice(0, 60) : 'シーン',
        trigger: typeof beat.cue === 'string' ? beat.cue.slice(0, 160) : '',
        note: typeof beat.note === 'string' ? beat.note.slice(0, 1000) : '',
      })
    }
  }
  if (scenes.length === 0 && Array.isArray(data.directions) && data.directions.length) {
    const start = performers.map(p => {
      const direction = data.directions?.find(d => d?.performerId === p.id)
      const from = point(direction?.from)
      return from ? { ...p, position: [from[0], p.position[1], from[1]] as Performer['position'] } : p
    })
    scenes.push(sceneSnapshot({ fixtures, performers: start, setPieces }))
    for (const direction of data.directions.slice(0, 99)) {
      const to = point(direction?.to)
      if (!to || !performerIds.has(direction.performerId ?? '')) continue
      const previous = scenes[scenes.length - 1]
      const positioned = previous.performers.map(p => p.id === direction.performerId
        ? { ...p, position: [to[0], p.position[1], to[1]] as Performer['position'] } : p)
      const actor = previous.performers.find(p => p.id === direction.performerId)
      const action = direction.kind === 'entrance' ? '登場' : direction.kind === 'exit' ? '退場' : '移動'
      scenes.push({
        ...sceneSnapshot({ fixtures, performers: positioned, setPieces }, `${actor?.name ?? '役者'} ${action}`),
        note: typeof direction.note === 'string' ? direction.note.slice(0, 1000) : '',
      })
    }
  }
  const legacyActiveId = (data as { activeBeatId?: string }).activeBeatId
  if (scenes.length && typeof data.note === 'string' && data.note.trim()) {
    scenes[0].note = [scenes[0].note, data.note.trim()].filter(Boolean).join('\n').slice(0, 1000)
  }
  return ensurePlanHierarchy({
    title, projectTitle, workTitle, venueTitle,
    scenes,
    activeSceneId: scenes.find(scene => scene.id === `sc-${legacyActiveId}`)?.id ?? scenes[scenes.length - 1]?.id ?? null,
  })
}

// ---- localStorage 多数保存 ----
const mockPath = typeof location !== 'undefined' &&
  (location.protocol === 'file:' || location.pathname === '/mock' || location.pathname.startsWith('/mock/'))
const LS_KEY = mockPath ? 'syoumei.mock.scenes' : 'syoumei.scenes'

export function listSavedScenes(): SerializedScene[] {
  try {
    const raw = localStorage.getItem(LS_KEY)
    if (!raw) return []
    return JSON.parse(raw)
  } catch { return [] }
}
export function saveSceneLS(name: string) {
  saveSerializedSceneLS(exportScene(name))
}
export function saveSerializedSceneLS(scene: SerializedScene) {
  const list = listSavedScenes()
  const idx = list.findIndex(s => s.name === scene.name)
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
