import { emptyProductionPlan, ensurePlanHierarchy, sceneSnapshot } from '../store'
import { listSavedScenes, saveSerializedSceneLS, type SerializedScene } from './sceneIO'

const LEGACY_LOCAL_KEY = 'syoumei.scenes'
const IMPORTS_KEY = 'tomoshibi.studio.imports.v1'

export type LegacyLocalItem = { key: string; scene: SerializedScene }

function validScene(value: unknown): value is SerializedScene {
  if (!value || typeof value !== 'object') return false
  const scene = value as Partial<SerializedScene>
  return (scene.version === 1 || scene.version === 2) &&
    Array.isArray(scene.fixtures) && Array.isArray(scene.performers) &&
    typeof scene.name === 'string'
}

export function listLegacyLocalScenes(): { items: LegacyLocalItem[]; error: string } {
  try {
    const raw = localStorage.getItem(LEGACY_LOCAL_KEY)
    if (!raw) return { items: [], error: '' }
    const parsed: unknown = JSON.parse(raw)
    if (!Array.isArray(parsed)) return { items: [], error: '以前の端末内データを読み取れませんでした。元のデータは変更していません。' }
    const items = parsed.flatMap(value => validScene(value)
      ? [{ key: `local:${value.name}:${value.savedAt ?? ''}`, scene: value }]
      : [])
    return { items, error: items.length !== parsed.length ? '一部の旧プランは形式を読み取れませんでした。元のデータは変更していません。' : '' }
  } catch {
    return { items: [], error: '以前の端末内データを読み取れませんでした。元のデータは変更していません。' }
  }
}

function importRecords(): Record<string, string> {
  try {
    const records: unknown = JSON.parse(localStorage.getItem(IMPORTS_KEY) || '{}')
    return records && typeof records === 'object' && !Array.isArray(records) ? records as Record<string, string> : {}
  } catch { return {} }
}

export function importedProjectName(sourceKey: string): string | null {
  const name = importRecords()[sourceKey]
  return name && listSavedScenes().some(item => item.name === name) ? name : null
}

function availableName(base: string, used: Set<string>): string {
  const title = base.trim().slice(0, 60) || '以前の舞台プラン'
  if (!used.has(title)) return title
  for (let number = 1; ; number++) {
    const suffix = number === 1 ? '（移行）' : `（移行${number}）`
    const candidate = title.slice(0, 60 - suffix.length) + suffix
    if (!used.has(candidate)) return candidate
  }
}

export function copyLegacyScene(source: unknown, sourceKey: string): { name: string; alreadyCopied: boolean } {
  if (!validScene(source)) throw new Error('このプランの保存形式を読み取れませんでした。')
  const existing = importedProjectName(sourceKey)
  if (existing) return { name: existing, alreadyCopied: true }

  const name = availableName(source.name, new Set(listSavedScenes().map(item => item.name)))
  const setPieces = Array.isArray(source.setPieces) ? source.setPieces : []
  let productionPlan = source.productionPlan
  if (!productionPlan?.scenes?.length) {
    const first = sceneSnapshot({ fixtures: source.fixtures, performers: source.performers, setPieces }, '')
    productionPlan = ensurePlanHierarchy({
      ...emptyProductionPlan(), projectTitle: name, scenes: [first], activeSceneId: first.id,
    })
  } else {
    productionPlan = { ...productionPlan, projectTitle: name }
  }
  const copy: SerializedScene = {
    ...source, version: 2, name, savedAt: new Date().toISOString(), setPieces, productionPlan,
    settings: source.settings && typeof source.settings === 'object' ? source.settings : {},
  }
  saveSerializedSceneLS(copy)
  if (!listSavedScenes().some(item => item.name === name)) throw new Error('コピーを保存できませんでした。')
  try {
    localStorage.setItem(IMPORTS_KEY, JSON.stringify({ ...importRecords(), [sourceKey]: name }))
  } catch {}
  return { name, alreadyCopied: false }
}
