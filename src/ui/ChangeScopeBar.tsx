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
    setDone(count ? `ほかの ${count} シーンにも入れました` : 'ほかのシーンには、入れる物がありませんでした')
  }
  return <div className={'change-scope-bar' + (phone ? ' phone' : '') + (docked ? ' docked' : '')} role="status"
    onPointerEnter={() => setHold(true)} onPointerLeave={() => setHold(false)}>
    {/* 問いかけと答えの形にする（2026-11-17 オーナー「記述がわかりづらい」） */}
    <span className="change-scope-text">{phone ? 'ほかにも入れる？' : `${describeChange(change)}。この変更を、ほかのシーンにも入れますか？`}</span>
    {showChapter && <button type="button" onClick={() => apply('chapter')} title="同じ章のほかのシーンにも、同じ変更を入れる">{phone ? 'この章' : 'この章のシーン'}</button>}
    {index < scenes.length - 1 && <button type="button" onClick={() => apply('after')} title="このあとのシーン全部に、同じ変更を入れる">{phone ? 'このあと' : 'このあとのシーン'}</button>}
    <button type="button" onClick={() => apply('all')} title="ほかのすべてのシーンに、同じ変更を入れる">全シーン</button>
    <button type="button" className="change-scope-close" title="ほかのシーンには入れない" onClick={clearChange}>{phone ? 'いいえ' : 'このシーンだけ'}</button>
  </div>
}
