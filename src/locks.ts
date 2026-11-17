import { create } from 'zustand'
import { useStore, type ProductionPlan } from './store'

// 物の「固定」（2026-11-17 オーナー「間違って床が動いてストレス」）。固定した物は、ドラッグや矢印では動かない（数字では変えられる）。
// 最初からある舞台・壁・バトン・客席は固定、それ以外とあとから足した物は動かせる。固定は全シーン共通で、プランの lockOverrides に持つ

export type LockKind = 'fixture' | 'performer' | 'setpiece' | 'stagepart' | 'stage' | 'audience'
const LOCKED_BY_DEFAULT = new Set<string>(['stage', 'stagepart', 'audience'])
export const lockKey = (kind: string, id: string) => `${kind}:${id}`

export function isLocked(plan: Pick<ProductionPlan, 'lockOverrides'>, kind: string | null, id: string | null): boolean {
  if (!kind || !id) return false
  return plan.lockOverrides?.[lockKey(kind, id)] ?? LOCKED_BY_DEFAULT.has(kind)
}
export const lockedNow = (kind: string | null, id: string | null) => isLocked(useStore.getState().productionPlan, kind, id)

export function setLocked(kind: LockKind, id: string, locked: boolean) {
  useStore.setState(state => ({ productionPlan: { ...state.productionPlan,
    lockOverrides: { ...state.productionPlan.lockOverrides, [lockKey(kind, id)]: locked } } }))
}

/** 固定した物を動かそうとしたとき、鍵のボタンを一瞬光らせる（知らせの文は出さない） */
export const useLockNudge = create<{ at: number }>(() => ({ at: 0 }))
export function nudgeLock() { useLockNudge.setState({ at: Date.now() }) }
