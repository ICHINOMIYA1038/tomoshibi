import { cancelPlaybackPreview } from '../playback/editorState'
import { useSyncExternalStore } from 'react'
import { CloudError, fetchCloudProject, requestProjectEditor, type CloudProject } from './cloud'
import { getActiveCloudProject, setActiveCloudProject } from './mockProjectSession'
import { setProjectEditorIdentity } from './projectEditorIdentity'
import { refreshSession } from './cloudSession'
import { importScene } from './sceneIO'
import { resetMockWorkspace } from './mockWorkspace'

type Status = 'idle' | 'checking' | 'owned' | 'blocked' | 'lost' | 'error' | 'stale'
// lostBy: 編集を止めた理由。'tab' は同じブラウザの別タブ、'other' はサーバーが別の画面に編集権を渡したと返したとき
type LostBy = 'tab' | 'other' | null
// signedOut: サーバーが 401 を返した（ログアウトしたか、ログインの期限が切れた）。画面は「ログインしていません」を出す
let state: { projectId: string | null; status: Status; error: string; deadline: number; epoch: number; lostBy: LostBy; signedOut: boolean } = { projectId: null, status: 'idle', error: '', deadline: 0, epoch: 0, lostBy: null, signedOut: false }
const isSignedOut = (error: unknown) => error instanceof CloudError && error.status === 401
/** 401 のときは、編集権の確認の失敗ではなく、ログインが要る状態として出す。ログインの状態も取り直す */
function publishSignedOut() {
  publish({ status: 'error', signedOut: true, error: 'ログインしていません。' })
  void refreshSession()
}
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
export async function loseProjectEditor(by: Exclude<LostBy, null> = 'other') {
  if (!owner) return
  const current = owner
  const stamp = ++generation
  pendingRenew = false
  publish({ status: 'lost', deadline: 0, lostBy: by })
  try {
    const latest = await fetchCloudProject(current.projectId)
    if (stamp === generation && state.status === 'lost') install(latest)
  } catch { /* 接続が戻るまで、未保存の作業データを保持する。 */ }
}
channel?.addEventListener('message', event => {
  if (owner && event.data?.projectId === owner.projectId && event.data?.userId === owner.userId &&
      event.data?.editorId !== owner.editorId) void loseProjectEditor('tab')
})
export function stopProjectEditor() {
  const previous = owner
  generation++
  owner = null
  pendingRenew = false
  clearInterval(timer)
  publish({ projectId: null, status: 'idle', deadline: 0, error: '', signedOut: false })
  if (previous) void requestProjectEditor(previous.projectId, previous.editorId, 'release').catch(() => undefined)
}
export async function startProjectEditor(projectId: string, userId: string, dirty: boolean) {
  stopProjectEditor()
  owner = { projectId, userId, editorId: crypto.randomUUID() }
  const stamp = generation
  publish({ projectId, status: 'checking' })
  timer = setInterval(() => {
    // 期限が切れていても、すぐには止めない。裏で取り直し、だめなときだけ知らせる（recoverProjectEditor）
    if (state.status === 'owned' && Date.now() >= state.deadline) void recoverProjectEditor()
    else if (state.status === 'owned') void renewProjectEditor()
    // 更新の失敗で止まったあとも、接続が戻れば自動で取り直す（取られていれば 423 で lost になる）
    else if (state.status === 'error' && !needsSnapshot) void recoverProjectEditor()
  }, 15_000)
  await acquire(false, dirty, stamp)
}
async function acquire(takeover: boolean, dirty: boolean, stamp: number, retry = 0) {
  const current = owner
  if (!current) return
  needsSnapshot = true
  pendingDirty = dirty
  publish({ status: 'checking', error: '', lostBy: null, signedOut: false })
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
    if (isSignedOut(error)) { publishSignedOut(); return }
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
  else await recoverProjectEditor()
}
export async function renewProjectEditor() {
  const current = owner
  const stamp = generation
  if (!current || pendingRenew || !['owned', 'checking', 'error'].includes(state.status)) return
  pendingRenew = true
  const started = Date.now()
  try {
    const result = await requestProjectEditor(current.projectId, current.editorId, 'renew')
    if (stamp === generation) publish({ status: 'owned', deadline: started + result.ttlMs - 5000, error: '', signedOut: false })
  } catch (error) {
    if (stamp === generation) {
      if (isSignedOut(error)) publishSignedOut()
      // 一時的な失敗（サーバーの 500 など）では止めない。期限まではそのまま編集でき、15 秒後の更新でやり直す
      else if (!(error instanceof CloudError && error.status === 423) && Date.now() < state.deadline) publish({ status: 'owned' })
      // 期限切れ（裏のタブで更新が止まった・スリープ）か、別の画面に取られた。取り直せるか確かめる
      else { pendingRenew = false; void recoverProjectEditor() }
    }
  } finally { if (stamp === generation) pendingRenew = false }
}
let recovering = false
const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms))
/**
 * 期限が切れた編集権を、画面を止めずに取り直す（2026-11-17「編集権を確認できません」が頻繁に出る、への対応）。
 * - まず更新を試す。期限切れで 423 なら、だれも取っていなければ取り直せる（acquire）。この画面の作業は残す
 * - 別の画面が持っていれば（acquire も 423）、編集を止める
 * - 接続の失敗は、少し待ってやり直す。30 秒ほど続いたときだけ「確認できません」を出す
 * 取り直すあいだは状態を owned のままにする（画面は止めない。保存は期限が戻るまで待つ）
 */
export async function recoverProjectEditor() {
  const current = owner
  if (!current || recovering) return
  recovering = true
  const stamp = generation
  try {
    for (const wait of [0, 2000, 4000, 8000, 16000]) {
      if (wait) await sleep(wait)
      if (stamp !== generation || owner !== current) return
      const started = Date.now()
      try {
        const result = await requestProjectEditor(current.projectId, current.editorId, 'renew')
        if (stamp === generation) publish({ status: 'owned', deadline: started + result.ttlMs - 5000, error: '', signedOut: false })
        return
      } catch (error) {
        if (stamp !== generation) return
        if (isSignedOut(error)) { publishSignedOut(); return }
        if (!(error instanceof CloudError && error.status === 423)) continue
      }
      try {
        const result = await requestProjectEditor(current.projectId, current.editorId, 'acquire')
        if (stamp !== generation) return
        // 期限切れのあいだに、別の画面が保存していた。この画面の内容は古いので、確かめてもらう
        if (result.project && getActiveCloudProject()?.revision !== result.project.revision) {
          await requestProjectEditor(current.projectId, current.editorId, 'release').catch(() => undefined)
          if (stamp === generation) publish({ status: 'stale' })
          return
        }
        publish({ status: 'owned', deadline: started + result.ttlMs - 5000, error: '', signedOut: false })
        return
      } catch (error) {
        if (stamp !== generation) return
        if (isSignedOut(error)) { publishSignedOut(); return }
        if (error instanceof CloudError && error.status === 423) { await loseProjectEditor(); return }
      }
    }
    if (stamp === generation) publish({ status: 'error', error: '編集権を確認できません。接続を確認して再開してください。' })
  } finally { recovering = false }
}
export async function viewLatestProject() {
  if (!owner) return
  const stamp = generation
  const latest = await fetchCloudProject(owner.projectId)
  if (stamp === generation) install(latest)
}
// 画面に戻ったとき。「確認しています」で画面を止めず、裏で更新する（期限切れなら取り直す）
window.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible' && owner && state.status === 'owned') {
    if (Date.now() >= state.deadline) void recoverProjectEditor()
    else void renewProjectEditor()
  }
})
window.addEventListener('pagehide', () => { if (owner) void requestProjectEditor(owner.projectId, owner.editorId, 'release').catch(() => undefined) })
window.addEventListener('pageshow', event => { if (event.persisted && owner) void recoverProjectEditor() })
