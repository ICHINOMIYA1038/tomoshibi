import { cancelPlaybackPreview } from '../playback/editorState'
import { useSyncExternalStore } from 'react'
import { CloudError, fetchCloudProject, requestProjectEditor, type CloudProject } from './cloud'
import { getActiveCloudProject, setActiveCloudProject } from './mockProjectSession'
import { setProjectEditorIdentity } from './projectEditorIdentity'
import { importScene } from './sceneIO'
import { resetMockWorkspace } from './mockWorkspace'

type Status = 'idle' | 'checking' | 'owned' | 'blocked' | 'lost' | 'error' | 'stale'
let state: { projectId: string | null; status: Status; error: string; deadline: number; epoch: number } = { projectId: null, status: 'idle', error: '', deadline: 0, epoch: 0 }
let owner: { projectId: string; userId: string; editorId: string } | null = null
let generation = 0
let timer: ReturnType<typeof setInterval> | undefined
let pendingRenew = false
let needsSnapshot = true
let pendingDirty = false
const listeners = new Set<() => void>()
const channel = typeof BroadcastChannel !== 'undefined' ? new BroadcastChannel('tomoshibi.project.editor') : null
function publish(patch: Partial<typeof state>) {
  state = { ...state, ...patch, epoch: generation }
  setProjectEditorIdentity(owner && state.status === 'owned' ? owner : null)
  listeners.forEach(listener => listener())
}
export function useProjectEditor() { return useSyncExternalStore(listener => { listeners.add(listener); return () => { listeners.delete(listener) } }, () => state, () => state) }
export function getProjectEditorEpoch() { return generation }
export function canEditProject(id: string) { return state.projectId === id && state.status === 'owned' && Date.now() < state.deadline }
function install(project: CloudProject) {
  if (getActiveCloudProject()?.id !== project.id) return
  cancelPlaybackPreview()
  importScene(project.data)
  setActiveCloudProject({ id: project.id, name: project.name, revision: project.revision })
  resetMockWorkspace()
}
export async function loseProjectEditor() {
  if (!owner) return
  const current = owner
  const stamp = ++generation
  pendingRenew = false
  publish({ status: 'lost', deadline: 0 })
  try {
    const latest = await fetchCloudProject(current.projectId)
    if (stamp === generation && state.status === 'lost') install(latest)
  } catch { /* 接続が戻るまで、未保存の作業データを保持する。 */ }
}
channel?.addEventListener('message', event => {
  if (owner && event.data?.projectId === owner.projectId && event.data?.userId === owner.userId &&
      event.data?.editorId !== owner.editorId) void loseProjectEditor()
})
export function stopProjectEditor() {
  const previous = owner
  generation++
  owner = null
  pendingRenew = false
  clearInterval(timer)
  publish({ projectId: null, status: 'idle', deadline: 0, error: '' })
  if (previous) void requestProjectEditor(previous.projectId, previous.editorId, 'release').catch(() => undefined)
}
export async function startProjectEditor(projectId: string, userId: string, dirty: boolean) {
  stopProjectEditor()
  owner = { projectId, userId, editorId: crypto.randomUUID() }
  const stamp = generation
  publish({ projectId, status: 'checking' })
  timer = setInterval(() => {
    if (state.status === 'owned' && Date.now() >= state.deadline) publish({ status: 'error', error: '編集権を確認できません。接続を確認して再開してください。' })
    if (state.status === 'owned') void renewProjectEditor()
    // 更新の失敗で止まったあとも、接続が戻れば自動で取り直す（取られていれば 423 で lost になる）
    else if (state.status === 'error' && !needsSnapshot) void renewProjectEditor()
  }, 15_000)
  await acquire(false, dirty, stamp)
}
async function acquire(takeover: boolean, dirty: boolean, stamp: number, retry = 0) {
  const current = owner
  if (!current) return
  needsSnapshot = true
  pendingDirty = dirty
  publish({ status: 'checking', error: '' })
  const started = Date.now()
  try {
    const result = await requestProjectEditor(current.projectId, current.editorId, takeover ? 'takeover' : 'acquire')
    if (stamp !== generation) { void requestProjectEditor(current.projectId, current.editorId, 'release').catch(() => undefined); return }
    if (!result.project) throw new Error('保存済みの内容を取得できませんでした')
    if (!takeover && dirty && getActiveCloudProject()?.revision !== result.project.revision) {
      await requestProjectEditor(current.projectId, current.editorId, 'release')
      if (stamp === generation) publish({ status: 'stale' })
      return
    }
    if (takeover || !dirty) install(result.project)
    needsSnapshot = false
    publish({ status: 'owned', deadline: started + result.ttlMs - 5000 })
    channel?.postMessage(current)
  } catch (error) {
    if (stamp !== generation) return
    if (!takeover && retry === 0 && error instanceof CloudError && error.status === 423) {
      await new Promise(resolve => setTimeout(resolve, 350))
      if (stamp === generation) await acquire(false, dirty, stamp, 1)
      return
    }
    publish({ status: error instanceof CloudError && error.status === 423 ? 'blocked' : 'error', error: '編集権を確認できませんでした。接続を確認して再試行してください。' })
  }
}
export async function takeoverProjectEditor() {
  if (!owner) return
  generation++
  pendingRenew = false
  owner = { ...owner, editorId: crypto.randomUUID() }
  await acquire(true, false, generation)
}
export async function retryProjectEditor() {
  if (needsSnapshot) await acquire(false, pendingDirty, generation)
  else await renewProjectEditor()
}
export async function renewProjectEditor() {
  const current = owner
  const stamp = generation
  if (!current || pendingRenew || !['owned', 'checking', 'error'].includes(state.status)) return
  pendingRenew = true
  const started = Date.now()
  try {
    const result = await requestProjectEditor(current.projectId, current.editorId, 'renew')
    if (stamp === generation) publish({ status: 'owned', deadline: started + result.ttlMs - 5000, error: '' })
  } catch (error) {
    if (stamp === generation) {
      if (error instanceof CloudError && error.status === 423) await loseProjectEditor()
      // 一時的な失敗（サーバーの 500 など）では止めない。期限まではそのまま編集でき、15 秒後の更新でやり直す
      else if (Date.now() < state.deadline) publish({ status: 'owned' })
      else publish({ status: 'error', error: '編集権を確認できません。接続を確認して再開してください。' })
    }
  } finally { if (stamp === generation) pendingRenew = false }
}
export async function viewLatestProject() {
  if (!owner) return
  const stamp = generation
  const latest = await fetchCloudProject(owner.projectId)
  if (stamp === generation) install(latest)
}
window.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible' && owner && state.status === 'owned') {
    publish({ status: 'checking' })
    void renewProjectEditor()
  }
})
window.addEventListener('pagehide', () => { if (owner) void requestProjectEditor(owner.projectId, owner.editorId, 'release').catch(() => undefined) })
window.addEventListener('pageshow', event => { if (event.persisted && owner) { publish({ status: 'checking' }); void renewProjectEditor() } })
