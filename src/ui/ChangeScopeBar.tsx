import { useEffect, useState } from 'react'
import { useChangeLog } from '../changeLog'
import { applyChangeToScenes, describeChange } from '../changeScope'
import { clearChange } from '../changeLog'
import { useStore } from '../store'

// 変えた直後に出す 1 行。「このあとのシーンにも／全シーンにも」で、同じ変更をほかのシーンに当てる
export function ChangeScopeBar({ phone = false }: { phone?: boolean }) {
  const change = useChangeLog(state => state.change)
  const scenes = useStore(state => state.productionPlan.scenes)
  const activeId = useStore(state => state.productionPlan.activeSceneId)
  const [done, setDone] = useState('')
  const index = scenes.findIndex(scene => scene.id === activeId)
  const visible = !!change && change.sceneId === activeId && scenes.length > 1
  // しばらく触らなければ消す（このシーンだけの変更のまま）
  useEffect(() => {
    if (!visible) return
    const timer = window.setTimeout(clearChange, 30000)
    return () => window.clearTimeout(timer)
  }, [visible, change?.seq, change?.patch])
  useEffect(() => {
    if (!done) return
    const timer = window.setTimeout(() => setDone(''), 2500)
    return () => window.clearTimeout(timer)
  }, [done])
  if (done) return <div className={'change-scope-bar' + (phone ? ' phone' : '')} role="status"><span>{done}</span></div>
  if (!visible || !change) return null
  const apply = (range: 'after' | 'all') => {
    const count = applyChangeToScenes(range)
    setDone(count ? `ほかの ${count} シーンにも反映しました` : 'ほかのシーンには、反映する物がありませんでした')
  }
  return <div className={'change-scope-bar' + (phone ? ' phone' : '')} role="status">
    <span><strong>{describeChange(change)}</strong><small>このシーンだけの変更です</small></span>
    {index < scenes.length - 1 && <button type="button" onClick={() => apply('after')}>このあとのシーンにも</button>}
    <button type="button" onClick={() => apply('all')}>全シーンにも</button>
    <button type="button" className="change-scope-close" aria-label="このシーンだけにする" onClick={clearChange}>×</button>
  </div>
}
