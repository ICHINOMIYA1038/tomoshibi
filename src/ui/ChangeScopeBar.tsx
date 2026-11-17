import { useEffect, useState } from 'react'
import { useChangeLog } from '../changeLog'
import { applyChangeToScenes, chapterOfScene, describeChange } from '../changeScope'
import { clearChange } from '../changeLog'
import { useStore } from '../store'

// 変えた直後に出す 1 行。「このあとのシーンにも／全シーンにも」で、同じ変更をほかのシーンに当てる
export function ChangeScopeBar({ phone = false, docked = false }: { phone?: boolean; docked?: boolean }) {
  const change = useChangeLog(state => state.change)
  const scenes = useStore(state => state.productionPlan.scenes)
  const sequences = useStore(state => state.productionPlan.sequences)
  const activeId = useStore(state => state.productionPlan.activeSceneId)
  const [done, setDone] = useState('')
  // 帯の上にマウス（指）があるあいだは消さない
  const [hold, setHold] = useState(false)
  const index = scenes.findIndex(scene => scene.id === activeId)
  const visible = !!change && change.sceneId === activeId && scenes.length > 1
  // 触らなければ 6 秒で消す（このシーンだけの変更のまま）。2026-11-17 オーナー「役者を動かすたびに出て鬱陶しい」で控えめにした
  useEffect(() => {
    if (!visible || hold) return
    const timer = window.setTimeout(clearChange, 6000)
    return () => window.clearTimeout(timer)
  }, [visible, hold, change?.seq, change?.patch])
  useEffect(() => {
    if (!done) return
    const timer = window.setTimeout(() => setDone(''), 2500)
    return () => window.clearTimeout(timer)
  }, [done])
  if (done) return <div className={'change-scope-bar' + (phone ? ' phone' : '') + (docked ? ' docked' : '')} role="status"><span className="change-scope-text">{done}</span></div>
  if (!visible || !change) return null
  // 章が 2 つ以上あって、同じ章にほかのシーンがあるときだけ「この章」を出す（章が 1 つなら「全シーン」と同じ）
  const chapterId = chapterOfScene({ sequences }, scenes[index]?.sequenceId)
  const chapterCount = new Set(scenes.map(scene => chapterOfScene({ sequences }, scene.sequenceId))).size
  const sameChapter = scenes.filter(scene => chapterOfScene({ sequences }, scene.sequenceId) === chapterId).length
  const showChapter = chapterCount > 1 && sameChapter > 1
  const apply = (range: 'chapter' | 'after' | 'all') => {
    const count = applyChangeToScenes(range)
    setDone(count ? `ほかの ${count} シーンも同じにしました` : 'ほかのシーンには、同じにする物がありませんでした')
  }
  return <div className={'change-scope-bar' + (phone ? ' phone' : '') + (docked ? ' docked' : '')} role="status"
    onPointerEnter={() => setHold(true)} onPointerLeave={() => setHold(false)}>
    {/* ボタンだけで何をするかわかる言い方にする（2026-11-17 オーナー「入れる？の文言が嫌」）。キーワードは「同じにする」 */}
    <span className="change-scope-text">{describeChange(change)}<small>（このシーンだけ）</small></span>
    <span className="change-scope-actions">
      {showChapter && <button type="button" onClick={() => apply('chapter')} title="同じ章のほかのシーンも、この変更と同じにする">{phone ? 'この章も同じに' : 'この章も同じにする'}</button>}
      {index < scenes.length - 1 && <button type="button" onClick={() => apply('after')} title="このあとのシーンも、この変更と同じにする">{phone ? 'このあとも同じに' : 'このあとのシーンも同じにする'}</button>}
      <button type="button" onClick={() => apply('all')} title="ほかのすべてのシーンも、この変更と同じにする">{phone ? '全シーン同じに' : '全シーン同じにする'}</button>
    </span>
    <button type="button" className="change-scope-close" aria-label="閉じる（このシーンだけの変更のまま）" title="閉じる（このシーンだけの変更のまま）" onClick={clearChange}>×</button>
  </div>
}
