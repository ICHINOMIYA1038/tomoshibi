import { create } from 'zustand'

// いちばん最近の「このシーンだけ」の変更。変えた直後に「このあとのシーンにも／全シーンにも」を出すのに使う（changeScope.ts）
// 項目ごとに共通・シーンごとを決めず、直した人がその場で範囲を選ぶ（2026-11-17 オーナーと決めた形）

export type ChangeKind = 'fixture' | 'performer' | 'setpiece'
export interface SceneChange {
  seq: number
  kind: ChangeKind
  id: string
  op: 'update' | 'add' | 'remove'
  /** update のときに変えた項目（続けて同じ物を直したら重ねる） */
  patch: Record<string, unknown>
  name: string
  sceneId: string | null
}

export const useChangeLog = create<{ change: SceneChange | null }>(() => ({ change: null }))
let seq = 0

export function recordChange(change: Omit<SceneChange, 'seq'>) {
  const last = useChangeLog.getState().change
  if (last && last.kind === change.kind && last.id === change.id && last.sceneId === change.sceneId && last.op !== 'remove') {
    // 足した直後の調整は「足した」のまま。続けて直したら、変えた項目を重ねる
    useChangeLog.setState({ change: { ...last, op: last.op === 'add' && change.op === 'update' ? 'add' : change.op,
      patch: { ...last.patch, ...change.patch }, name: change.name || last.name } })
    return
  }
  useChangeLog.setState({ change: { ...change, seq: ++seq } })
}

export function clearChange() {
  if (useChangeLog.getState().change) useChangeLog.setState({ change: null })
}
