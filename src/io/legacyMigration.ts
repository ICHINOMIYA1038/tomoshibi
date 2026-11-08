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

export function buildLegacyLocalProject(items: LegacyLocalItem[], name = '引き継いだ照明プラン'): SerializedScene | null {
  if (!items.length) return null
  const first = items[0].scene
  const scenes = items.map(item => ({
    ...sceneSnapshot({
      fixtures: item.scene.fixtures,
      performers: item.scene.performers,
      setPieces: item.scene.setPieces ?? [],
      settings: item.scene.settings,
    }, item.scene.name),
    legacySourceKey: item.key,
  }))
  const plan = ensurePlanHierarchy({
    ...emptyProductionPlan(), projectTitle: name, scenes, activeSceneId: scenes[0].id,
  })
  return {
    version: 2, name, savedAt: new Date().toISOString(),
    fixtures: first.fixtures, performers: first.performers, setPieces: first.setPieces ?? [],
    settings: first.settings ?? {}, productionPlan: plan,
  }
}

export function ensureLegacyLocalProject(): string | null {
  const source = listLegacyLocalScenes()
  if (!source.items.length) return null
  const saved = listSavedScenes()
  const existing = saved.find(item => item.productionPlan?.scenes.some(scene => scene.legacySourceKey?.startsWith('local:')))
  const name = existing?.name ?? availableName('引き継いだ照明プラン', new Set(saved.map(item => item.name)))
  const built = buildLegacyLocalProject(source.items, name)
  if (!built) return null
  const known = new Set(existing?.productionPlan?.scenes.map(scene => scene.legacySourceKey) ?? [])
  const additions = built.productionPlan?.scenes.filter(scene => !known.has(scene.legacySourceKey)) ?? []
  if (existing && !additions.length) return name
  if (existing?.productionPlan) {
    built.productionPlan = {
      ...existing.productionPlan,
      scenes: [...existing.productionPlan.scenes, ...additions],
    }
    built.fixtures = existing.fixtures
    built.performers = existing.performers
    built.setPieces = existing.setPieces
    built.settings = existing.settings
  }
  saveSerializedSceneLS(built)
  return name
}

export function appendLegacyLocalScenes(project: SerializedScene, items: LegacyLocalItem[]): SerializedScene | null {
  const incoming = buildLegacyLocalProject(items, project.name)
  if (!incoming?.productionPlan?.scenes.length || !project.productionPlan?.scenes.length) return null
  const known = new Set(project.productionPlan.scenes.map(scene => scene.legacySourceKey))
  const sequenceId = project.productionPlan.sequences?.[0]?.id
  const additions = incoming.productionPlan.scenes.filter(scene => !known.has(scene.legacySourceKey))
    .map(scene => ({ ...scene, sequenceId }))
  if (!additions.length) return null
  if (project.productionPlan.scenes.length + additions.length > 100) throw new Error('旧プランの合計が100シーンを超えています。')
  return {
    ...project,
    productionPlan: {
      ...project.productionPlan,
      scenes: [...project.productionPlan.scenes, ...additions],
    },
  }
}
