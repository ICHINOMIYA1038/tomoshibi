import { useStore } from '../store'
import { listSavedScenes, renameSavedSceneLS } from './sceneIO'
import { getActiveSavedProjectName, setActiveSavedProjectName } from './mockProjectSession'
import { flushMockAutosave } from './mockWorkspace'

/**
 * 編集中のプロジェクトの名前を変える（2026-11-18 オーナー「プロジェクト名を変えられない」）。
 * アカウントに保存したものは、自動保存がこの名前でアカウント側の名前も変える（App.tsx の自動保存は projectTitle を使う）。
 * この端末に保存したものは、一覧に出る名前（保存の鍵）も変える。同じ名前があれば「名前 2」のようにする
 */
export function renameProject(next: string) {
  const title = next.trim().slice(0, 60)
  if (!title) return
  useStore.getState().updateProductionPlan({ projectTitle: title })
  const saved = getActiveSavedProjectName()
  if (saved && saved !== title) {
    const taken = new Set(listSavedScenes().map(scene => scene.name).filter(name => name !== saved))
    let name = title
    for (let number = 2; taken.has(name); number++) name = `${title} ${number}`
    renameSavedSceneLS(saved, name)
    setActiveSavedProjectName(name)
  }
  flushMockAutosave()
}
