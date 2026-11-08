import { useSyncExternalStore } from 'react'
import { exportScene, importScene, listSavedScenes, saveSceneLS, saveSerializedSceneLS, type SerializedScene } from './sceneIO'
import { getActiveSavedProjectName, setActiveSavedProjectName } from './mockProjectSession'
import { useStore } from '../store'

const SESSION_KEY = 'tomoshibi.mock.workspace.v1'
const HISTORY_LIMIT = 60
const COALESCE_MS = 500
const SAVE_DELAY_MS = 650

type State = ReturnType<typeof useStore.getState>
type Snapshot = {
  fixtures: State['fixtures']
  performers: State['performers']
  setPieces: State['setPieces']
  productionPlan: State['productionPlan']
  settings: Pick<State['settings'], 'hazeDensity' | 'ambient' | 'exposure' | 'bloom' | 'showHouseLights'>
}
type SaveStatus = 'saved' | 'saving' | 'error'
type ViewState = { canUndo: boolean; canRedo: boolean; saveStatus: SaveStatus }

let installed = false
let applyingHistory = false
let history: string[] = []
let cursor = 0
let lastSignature = ''
let lastRecordedAt = 0
let saveTimer: ReturnType<typeof setTimeout> | null = null
let saveStatus: SaveStatus = 'saved'
let demoBaseline: string | null = null
let viewState: ViewState = { canUndo: false, canRedo: false, saveStatus }
const listeners = new Set<() => void>()

function capture(state: State): string {
  const snapshot: Snapshot = {
    fixtures: state.fixtures,
    performers: state.performers,
    setPieces: state.setPieces,
    productionPlan: state.productionPlan,
    settings: {
      hazeDensity: state.settings.hazeDensity,
      ambient: state.settings.ambient,
      exposure: state.settings.exposure,
      bloom: state.settings.bloom,
      showHouseLights: state.settings.showHouseLights,
    },
  }
  return JSON.stringify(snapshot)
}

function signature(state: State): string {
  return JSON.stringify({
    fixtures: state.fixtures.map(item => item.id),
    performers: state.performers.map(item => item.id),
    setPieces: state.setPieces.map(item => item.id),
    scenes: state.productionPlan.scenes.map(item => item.id),
    audienceBlocks: state.productionPlan.audienceBlocks?.map(item => item.id),
    chapters: state.productionPlan.chapters?.map(item => item.id),
    activeSceneId: state.productionPlan.activeSceneId,
    selection: [state.selection.kind, state.selection.id],
  })
}

function publish() {
  viewState = { canUndo: cursor > 0, canRedo: cursor < history.length - 1, saveStatus }
  listeners.forEach(listener => listener())
}

function subscribe(listener: () => void) {
  listeners.add(listener)
  return () => { listeners.delete(listener) }
}

export function useMockWorkspaceState() {
  return useSyncExternalStore(subscribe, () => viewState, () => viewState)
}

export function markMockDemoBaseline() {
  demoBaseline = projectContentKey(exportScene())
}

function projectContentKey(scene: SerializedScene): string {
  const plan = scene.productionPlan
  return JSON.stringify({
    projectTitle: plan?.projectTitle,
    chapters: plan?.chapters,
    sequences: plan?.sequences,
    scenes: plan?.scenes,
    audienceBlocks: plan?.audienceBlocks,
    venueLayout: plan?.venueLayout,
    settings: {
      hazeDensity: scene.settings?.hazeDensity,
      ambient: scene.settings?.ambient,
      exposure: scene.settings?.exposure,
      bloom: scene.settings?.bloom,
      showHouseLights: scene.settings?.showHouseLights,
    },
  })
}

export function preserveMockDraftBeforeDemo(): boolean {
  try {
    const raw = localStorage.getItem(SESSION_KEY)
    if (!raw) return true
    const session = JSON.parse(raw) as { scene?: SerializedScene; activeSavedName?: string | null; demoBaseline?: string | null }
    if (session.activeSavedName || !session.scene || (session.scene.version !== 1 && session.scene.version !== 2)) return true
    const scene = session.scene
    const title = scene.productionPlan?.projectTitle?.trim() || ''
    if (!title && !scene.fixtures.length && !scene.performers.length && !scene.setPieces?.length) return true
    if (session.demoBaseline && projectContentKey(scene) === session.demoBaseline) return true
    const names = new Set(listSavedScenes().map(item => item.name))
    let name = title || scene.name?.trim() || '保存前のプラン'
    if (names.has(name)) {
      const base = `${name}（保存前）`
      name = base
      for (let number = 2; names.has(name); number++) name = `${base}${number}`
    }
    saveSerializedSceneLS({ ...scene, name, savedAt: new Date().toISOString() })
    return true
  } catch {
    return false
  }
}

function scheduleSave() {
  if (saveTimer) clearTimeout(saveTimer)
  saveStatus = 'saving'
  publish()
  saveTimer = setTimeout(() => { saveTimer = null; flushMockAutosave() }, SAVE_DELAY_MS)
}

function record(state: State) {
  if (applyingHistory || !installed) return
  const next = capture(state)
  const nextSignature = signature(state)
  if (next === history[cursor]) {
    lastSignature = nextSignature
    return
  }
  const now = Date.now()
  const coalesce = cursor > 0 && cursor === history.length - 1 &&
    now - lastRecordedAt < COALESCE_MS && nextSignature === lastSignature
  if (coalesce) history[cursor] = next
  else {
    history = history.slice(0, cursor + 1)
    history.push(next)
    if (history.length > HISTORY_LIMIT) history.shift()
    cursor = history.length - 1
  }
  lastSignature = nextSignature
  lastRecordedAt = now
  scheduleSave()
}

export function initMockWorkspace(restore = true) {
  if (installed) return
  if (restore) {
    try {
      const raw = localStorage.getItem(SESSION_KEY)
      if (raw) {
        const session = JSON.parse(raw) as { scene?: SerializedScene; activeSavedName?: string | null; demoBaseline?: string | null }
        if (session.scene && (session.scene.version === 1 || session.scene.version === 2)) {
          importScene(session.scene)
          setActiveSavedProjectName(typeof session.activeSavedName === 'string' ? session.activeSavedName : null)
          demoBaseline = session.demoBaseline ?? null
          useStore.getState().markSavedSnapshot()
        }
      }
    } catch {}
  } else { setActiveSavedProjectName(null); demoBaseline = null }
  history = [capture(useStore.getState())]
  cursor = 0
  lastSignature = signature(useStore.getState())
  installed = true
  useStore.subscribe(record)
  window.addEventListener('pagehide', () => { if (saveStatus === 'saving') flushMockAutosave() })
  publish()
}

export function flushMockAutosave(): boolean {
  if (saveTimer) { clearTimeout(saveTimer); saveTimer = null }
  try {
    const name = getActiveSavedProjectName()
    const projectTitle = useStore.getState().productionPlan.projectTitle?.trim()
    const scene = exportScene(name || projectTitle || '編集中のプロジェクト')
    if (name) saveSceneLS(name)
    localStorage.setItem(SESSION_KEY, JSON.stringify({ version: 1, activeSavedName: name, scene, demoBaseline }))
    useStore.getState().markSavedSnapshot()
    saveStatus = 'saved'
    publish()
    return true
  } catch {
    saveStatus = 'error'
    publish()
    return false
  }
}

export function resetMockWorkspace() {
  if (!installed) return
  demoBaseline = null
  if (saveTimer) { clearTimeout(saveTimer); saveTimer = null }
  history = [capture(useStore.getState())]
  cursor = 0
  lastSignature = signature(useStore.getState())
  lastRecordedAt = 0
  flushMockAutosave()
  publish()
}

function restoreHistory(index: number) {
  if (index < 0 || index >= history.length) return
  const snapshot = JSON.parse(history[index]) as Snapshot
  applyingHistory = true
  useStore.setState(state => ({
    fixtures: snapshot.fixtures,
    performers: snapshot.performers,
    setPieces: snapshot.setPieces,
    productionPlan: snapshot.productionPlan,
    settings: { ...state.settings, ...snapshot.settings },
    selection: { kind: null, id: null },
  }))
  applyingHistory = false
  cursor = index
  lastSignature = signature(useStore.getState())
  lastRecordedAt = 0
  scheduleSave()
}

export function undoMockWorkspace() { restoreHistory(cursor - 1) }
export function redoMockWorkspace() { restoreHistory(cursor + 1) }
