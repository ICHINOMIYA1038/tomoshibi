import { useEffect, useRef, useState } from 'react'
import { sceneDisplayTitle, useStore, type Fixture } from '../store'
import { fixtureRole, type FixtureRoleKey } from '../lighting/fixtureGuide'

// 初めての人の最初の 30 秒（2026-11-28）。トップの「無料で舞台を組む」から、プロジェクトがまだ無い人が来たら、
// 見本の『ロミオとジュリエット』の舞踏会を暗転の状態で開き、調光卓のフェーダーを 1 本ずつ上げるように明かりを入れていく。
// 明かりを消して見せるのは描き方だけ（store の stageMask）。公演のデータ（キュー）は書き換えない

const DONE_KEY = 'tomoshibi.firstStageCoach'

export function firstStageCoachDone(): boolean {
  try { return localStorage.getItem(DONE_KEY) === 'done' } catch { return false }
}
function markDone() {
  try { localStorage.setItem(DONE_KEY, 'done') } catch { /* 覚えられなくても使える */ }
}

type Group = { key: string; roles: FixtureRoleKey[]; tape: string; name: string; text: string; go: string }

// 入れる順は、奥から手前へ（背景 → 輪郭 → 地明かり → 横 → 顔 → 主役）。文は調べた資料
// （docs/stage-lighting-design-research.md、reports/2026-11-20-tomoshibi-lighting-study）に合わせる
const GROUPS: Group[] = [
  { key: 'cyc', roles: ['upperCyc', 'lowerCyc'], tape: 'ホリ', name: 'ホリゾント', go: 'ホリゾントを入れる',
    text: '舞台の奥の幕を染める明かり。ここでは夜空の青にして、夜の宴だと伝えます。' },
  { key: 'back', roles: ['back'], tape: '逆光', name: '逆光', go: '逆光を入れる',
    text: '役者の後ろの上から当てる明かり。頭と肩の輪郭が光り、人が背景から浮き上がります。' },
  { key: 'sus', roles: ['sus'], tape: 'サス', name: 'サス（地明かり）', go: 'サスを入れる',
    text: '舞台の上から、演技する場所を覆う明かり。ここでは奥の群衆を抑えて、手前の二人に目を集めています。' },
  { key: 'side', roles: ['side'], tape: '横', name: '横明かり', go: '横明かりを入れる',
    text: '袖から、人の胸の高さに横から当てる明かり。床を照らさずに、体の厚みと動きを見せます。' },
  { key: 'front', roles: ['front'], tape: '前', name: '前明かり', go: '前明かりを入れる',
    text: '客席の側から、顔に当てる明かり。上からの明かりだけでは、うつむくと顔が影になります。' },
  { key: 'pin', roles: ['pin'], tape: 'ピン', name: 'ピン', go: 'ピンを入れる',
    text: '客席の後ろから、人が手で動かして役者を追う明かり。出会った二人に、観客の目を集めます。' },
]

/** 案内に使うシーン。見本の舞踏会（6 種類の明かりがそろう場面）。無ければ、いま開いているシーン */
function pickScene() {
  const plan = useStore.getState().productionPlan
  return plan.scenes.find(scene => scene.title === 'キャピュレット家の舞踏会') ?? plan.scenes[1] ?? plan.scenes[0]
}

const toRgb = (fixture: Fixture | undefined) => {
  if (!fixture || !fixture.gelEnabled) return 'rgb(255, 226, 184)'
  return `rgb(${fixture.color.map(value => Math.round(Math.min(1, Math.max(0, value)) ** (1 / 2.2) * 255)).join(', ')})`
}

export function FirstStageCoach({ hidden, onPlay, onBuild, onClose }: { hidden: boolean; onPlay: () => void; onBuild: () => void; onClose: () => void }) {
  const plan = useStore(s => s.productionPlan)
  // 案内のシーンを開き、そのシーンで点いている器具を段ごとに分ける。点いていない段は飛ばす
  // （あとで別のシーンに替えても、段は変えない）
  const [groups, setGroups] = useState<Array<Group & { fixtures: Fixture[] }> | null>(null)
  useEffect(() => {
    const scene = pickScene()
    if (scene && scene.id !== useStore.getState().productionPlan.activeSceneId) useStore.getState().selectScene(scene.id)
    useStore.getState().setStageMask([])
    const lit = useStore.getState().fixtures.filter(item => item.enabled && item.intensity > 0)
    setGroups(GROUPS.map(group => ({ ...group, fixtures: lit.filter(item => group.roles.includes(fixtureRole(item) as FixtureRoleKey)) }))
      .filter(group => group.fixtures.length > 0))
  }, [])
  const [step, setStep] = useState(0)
  const finished = !!groups && step > groups.length
  const goRef = useRef<HTMLButtonElement>(null)
  const rootRef = useRef<HTMLElement>(null)
  // 卓の高さだけ、舞台の絵を上に詰める（styles.css の --coach-h）
  useEffect(() => {
    const root = rootRef.current
    const shell = root?.closest<HTMLElement>('.unified-shell')
    if (!root || !shell) return
    const apply = () => shell.style.setProperty('--coach-h', `${Math.ceil(root.getBoundingClientRect().height)}px`)
    apply()
    const observer = new ResizeObserver(apply)
    observer.observe(root)
    return () => { observer.disconnect(); shell.style.removeProperty('--coach-h') }
  }, [groups, hidden])

  // 段に合わせて、点けて見せる器具を決める。いま入れた段は、フェーダーを上げるように 0.9 秒で立ち上げる
  useEffect(() => {
    const store = useStore.getState()
    if (!groups) return
    if (finished) { store.setStageMask(null); return }
    const lit = groups.slice(0, step).flatMap(group => group.fixtures.map(item => item.id))
    const rising = step > 0 ? groups[step - 1].fixtures.map(item => item.id) : []
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    if (!rising.length || reduce) { store.setStageMask(lit); return }
    let frame = 0
    const started = performance.now()
    const tick = (now: number) => {
      const t = Math.min(1, (now - started) / 900)
      const eased = 1 - (1 - t) ** 3
      useStore.getState().setStageMask(lit, { ids: rising, level: eased })
      if (t < 1) frame = requestAnimationFrame(tick)
    }
    frame = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(frame)
  }, [step, groups, finished])
  useEffect(() => () => useStore.getState().setStageMask(null), [])
  // 途中で上の「通しで見る」を押されたら、明かりを全部入れた最後の段にしてから通す
  useEffect(() => { if (hidden && groups && !finished) setStep(groups.length + 1) }, [hidden, groups, finished])
  useEffect(() => { if (finished) markDone() }, [finished])
  useEffect(() => { goRef.current?.focus({ preventScroll: true }) }, [step, groups])

  if (!groups || hidden) return null
  const skip = () => { markDone(); onClose() }
  const current = step > 0 && !finished ? groups[step - 1] : null
  const next = groups[step]
  const scenes = plan.scenes
  const activeIndex = scenes.findIndex(scene => scene.id === plan.activeSceneId)
  const nextScene = scenes.length > 1 ? scenes[(activeIndex + 1) % scenes.length] : null

  return <section ref={rootRef} className={'first-coach' + (finished ? ' is-finished' : '')} aria-label="明かりを入れる案内">
    <div className="first-coach-desk" role="img" aria-label={`調光卓。${groups.length} 本のうち ${Math.min(step, groups.length)} 本が上がっています`}>
      {groups.map((group, index) => {
        const state = finished || index < step ? 'up' : index === step ? 'next' : 'down'
        return <div key={group.key} className={'first-coach-ch ' + state} style={{ '--ch-color': toRgb(group.fixtures[0]) } as React.CSSProperties}>
          <span className="first-coach-tape">{group.tape}</span>
          <span className="first-coach-track"><span className="first-coach-knob" /></span>
          <span className="first-coach-count">{group.fixtures.length}灯</span>
        </div>
      })}
    </div>

    <div className="first-coach-text" aria-live="polite">
      {step === 0 && <>
        <p className="first-coach-where">ロミオとジュリエット　第一幕・キャピュレット家の舞踏会</p>
        <h2>一灯ずつ、明かりを入れてみましょう</h2>
        <p>いまは、舞台の明かりを全部落とした暗転です。</p>
      </>}
      {current && <>
        <p className="first-coach-where">{step} / {groups.length}　{current.fixtures.length}灯</p>
        <h2>{current.name}</h2>
        <p>{current.text}</p>
      </>}
      {finished && <>
        <p className="first-coach-where">ロミオとジュリエット　第一幕・キャピュレット家の舞踏会</p>
        <h2>明かりが、そろいました</h2>
        <p>この重ね方を、シーンごとに変えていきます。替えてみるか、頭から通して見てください。</p>
      </>}
    </div>

    <div className="first-coach-actions">
      {!finished && <button ref={goRef} type="button" className="first-coach-go" onClick={() => setStep(value => value + 1)}>
        {next ? next.go : '明かりをそろえる'}
      </button>}
      {finished && <>
        <div className="first-coach-row">
          {nextScene && <button type="button" className="first-coach-sub" onClick={() => useStore.getState().selectScene(nextScene.id)}>
            <small>シーンを替える</small><span>{sceneDisplayTitle(plan, nextScene.id)}</span></button>}
          <button type="button" className="first-coach-sub" onClick={onPlay}><small>頭から</small><span>▶ 通しで見る</span></button>
        </div>
        <button ref={goRef} type="button" className="first-coach-go" onClick={() => {
          markDone()
          // 見本を開いたときのシーンに戻してから離れる。舞踏会のまま離れると、シーンの空気（スモーク）の違いで
          // 「見本を直した」と見なされ、見本が一覧に 1 件として残っていた
          const first = useStore.getState().productionPlan.scenes[0]
          if (first) useStore.getState().selectScene(first.id)
          onBuild()
        }}>自分の舞台を組む</button>
      </>}
    </div>
    <button type="button" className="first-coach-skip" onClick={skip}>{finished ? 'このまま見本を触る' : 'スキップ'}</button>
  </section>
}
