import { clearChange, useChangeLog, type SceneChange } from './changeLog'
import { captureActiveScene, useStore } from './store'

const KEY = { fixture: 'fixtures', performer: 'performers', setpiece: 'setPieces' } as const

/** いまのシーンでした変更を、このあとのシーン（after）か、ほかのすべてのシーン（all）にも当てる。当てたシーンの数を返す */
export function applyChangeToScenes(range: 'after' | 'all'): number {
  const change = useChangeLog.getState().change
  const s = useStore.getState()
  if (!change || change.sceneId !== s.productionPlan.activeSceneId) return 0
  const plan = captureActiveScene(s.productionPlan, s)
  const index = plan.scenes.findIndex(scene => scene.id === plan.activeSceneId)
  const key = KEY[change.kind]
  const live = (s[key] as Array<{ id: string }>).find(item => item.id === change.id)
  let count = 0
  const scenes = plan.scenes.map((scene, i) => {
    if (i === index || (range === 'after' && i < index)) return scene
    const items = scene[key] as Array<{ id: string }>
    const exists = items.some(item => item.id === change.id)
    let next = items
    if (change.op === 'remove') next = items.filter(item => item.id !== change.id)
    else if (change.op === 'add') next = exists ? items : live ? [...items, structuredClone(live)] : items
    else if (exists) next = items.map(item => item.id === change.id ? { ...item, ...structuredClone(change.patch) } : item)
    if (next === items) return scene
    count++
    return { ...scene, [key]: next }
  })
  useStore.setState({ productionPlan: { ...plan, scenes } })
  clearChange()
  return count
}

/** 帯に出す文。「机を動かしました」など */
export function describeChange(change: SceneChange): string {
  const name = change.name || 'それ'
  if (change.op === 'add') return `${name}を足しました`
  if (change.op === 'remove') return `${name}を消しました`
  const keys = Object.keys(change.patch)
  if (keys.some(key => key === 'position' || key === 'target' || key === 'rotation' || key === 'parentId')) return `${name}を動かしました`
  if (keys.includes('enabled')) return `${name}の点灯を変えました`
  if (keys.includes('onStage')) return `${name}の出番を変えました`
  if (keys.includes('intensity')) return `${name}の明るさを変えました`
  if (keys.includes('color')) return `${name}の色を変えました`
  return `${name}を変えました`
}
