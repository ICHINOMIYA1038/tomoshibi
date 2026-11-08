import { Fragment, useCallback, useEffect, useRef, useState } from 'react'
import { captureActiveScene, sceneDisplayTitle, sceneStage, SCENE_TRIGGER_LABELS, useStore,
  type PlanScene, type ProductionPlan } from '../store'
import { interpolateStage } from '../playback/interpolateStage'

const TRANSITION_MS = 1200

export function StagePlayback({ onClose, simplified = false }: { onClose: () => void; simplified?: boolean }) {
  const cameraView = useStore(state => state.settings.cameraView)
  const [scenes, setScenes] = useState<PlanScene[]>([])
  const [index, setIndex] = useState(0)
  const [auto, setAuto] = useState(false)
  const [holdSeconds, setHoldSeconds] = useState(3)
  const [transitioning, setTransitioning] = useState(false)
  const [displayMode, setDisplayMode] = useState<'full' | 'compact' | 'hidden'>(simplified ? 'compact' : 'full')
  const planRef = useRef<ProductionPlan | null>(null)
  const originalSceneId = useRef<string | null>(null)
  const indexRef = useRef(0)
  const frameRef = useRef(0)
  const movingRef = useRef(false)

  const showScene = useCallback((nextIndex: number) => {
    const plan = planRef.current
    const scene = plan?.scenes[nextIndex]
    if (!plan || !scene) return
    cancelAnimationFrame(frameRef.current)
    movingRef.current = false
    indexRef.current = nextIndex
    useStore.setState({
      productionPlan: { ...plan, activeSceneId: scene.id },
      ...sceneStage(scene),
      selection: { kind: null, id: null },
    })
    setIndex(nextIndex)
    setTransitioning(false)
  }, [])

  const goTo = useCallback((nextIndex: number) => {
    const plan = planRef.current
    const from = plan?.scenes[indexRef.current]
    const to = plan?.scenes[nextIndex]
    if (!plan || !from || !to || movingRef.current || nextIndex === indexRef.current) return
    movingRef.current = true
    setTransitioning(true)
    const started = performance.now()
    let lastDraw = 0
    const tick = (now: number) => {
      if (!movingRef.current) return
      const progress = Math.min(1, (now - started) / TRANSITION_MS)
      if (progress >= 1) {
        showScene(nextIndex)
        if (nextIndex === plan.scenes.length - 1) setAuto(false)
        return
      }
      if (now - lastDraw >= 30) {
        const eased = progress * progress * (3 - 2 * progress)
        useStore.setState({
          productionPlan: { ...plan, activeSceneId: from.id },
          ...interpolateStage(from, to, eased),
        })
        lastDraw = now
      }
      frameRef.current = requestAnimationFrame(tick)
    }
    frameRef.current = requestAnimationFrame(tick)
  }, [showScene])

  useEffect(() => {
    useStore.getState().ensureScenes()
    const state = useStore.getState()
    const plan = captureActiveScene(state.productionPlan, state)
    const first = plan.scenes[0]
    if (!first) return
    planRef.current = plan
    originalSceneId.current = plan.activeSceneId
    setScenes(plan.scenes)
    showScene(0)
    setAuto(plan.scenes.length > 1)
    return () => {
      cancelAnimationFrame(frameRef.current)
      movingRef.current = false
      const original = plan.scenes.find(scene => scene.id === originalSceneId.current) ?? first
      useStore.setState({
        productionPlan: { ...plan, activeSceneId: original.id },
        ...sceneStage(original),
        selection: { kind: null, id: null },
      })
    }
  }, [showScene])

  useEffect(() => {
    if (!auto || transitioning || index >= scenes.length - 1) return
    const timer = window.setTimeout(() => goTo(index + 1), holdSeconds * 1000)
    return () => window.clearTimeout(timer)
  }, [auto, transitioning, index, scenes.length, holdSeconds, goTo])

  const toggleAuto = useCallback(() => {
    if (auto) {
      setAuto(false)
      return
    }
    if (indexRef.current >= scenes.length - 1) showScene(0)
    setAuto(true)
  }, [auto, scenes.length, showScene])

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault()
        onClose()
        return
      }
      const tag = (event.target as HTMLElement).tagName
      if (tag === 'INPUT' || tag === 'SELECT' || tag === 'TEXTAREA') return
      if (event.code === 'Space') {
        event.preventDefault()
        if (!event.repeat) toggleAuto()
      }
      if (event.key === 'ArrowRight' && !event.repeat) {
        event.preventDefault()
        setAuto(false)
        goTo(indexRef.current + 1)
      }
      if (event.key === 'ArrowLeft' && !event.repeat) {
        event.preventDefault()
        setAuto(false)
        goTo(indexRef.current - 1)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [goTo, onClose, toggleAuto])

  const scene = scenes[index]
  if (!scene) return null
  const plan = planRef.current
  const sequence = plan?.sequences?.find(item => item.id === scene.sequenceId)
  const chapter = plan?.chapters?.find(item => item.id === sequence?.chapterId)

  if (displayMode === 'hidden') return <button className="stage-playback-restore"
    onClick={() => setDisplayMode('compact')} aria-label="通し再生の操作を表示">
    操作を表示 <span>{index + 1} / {scenes.length}</span>
  </button>

  return <section className={`stage-playback stage-playback-${displayMode}`} aria-label="通しで見る">
    <div className="stage-playback-summary">
      <span>通しで見る</span>
      {displayMode === 'full' && <small>{[plan?.projectTitle, chapter?.title, ...(simplified ? [] : [sequence?.title])].filter(Boolean).join(' › ')}</small>}
      <strong>{index + 1} / {scenes.length}　{simplified && plan
        ? sceneDisplayTitle(plan, scene.id) : scene.title || '無題のシーン'}</strong>
      {displayMode === 'full' && <small>{transitioning ? '次のシーンへ切り替え中…' : scene.trigger
        ? `${scene.triggerType ? SCENE_TRIGGER_LABELS[scene.triggerType] : 'きっかけ'}：${scene.trigger}`
        : scene.triggerType ? `${SCENE_TRIGGER_LABELS[scene.triggerType]}：内容未入力` : 'シーンを確認中'}</small>}
    </div>
    {displayMode === 'full' && <nav className="stage-playback-scenes" aria-label="シーンへ移動">
      {scenes.map((item, itemIndex) => {
        const itemSequence = plan?.sequences?.find(group => group.id === item.sequenceId)
        const itemChapter = plan?.chapters?.find(group => group.id === itemSequence?.chapterId)
        const previousSequence = plan?.sequences?.find(group => group.id === scenes[itemIndex - 1]?.sequenceId)
        const startsGroup = itemIndex === 0 || (simplified
          ? previousSequence?.chapterId !== itemSequence?.chapterId
          : scenes[itemIndex - 1]?.sequenceId !== item.sequenceId)
        return <Fragment key={item.id}>
          {startsGroup && <span className="stage-playback-group">
            {simplified ? itemChapter?.title : `${itemChapter?.title} / ${itemSequence?.title}`}
          </span>}
          <button className={itemIndex === index ? 'active' : ''}
            aria-current={itemIndex === index ? 'step' : undefined}
            disabled={transitioning}
            onClick={() => { setAuto(false); showScene(itemIndex) }}>
            {simplified && plan ? sceneDisplayTitle(plan, item.id)
              : `${itemIndex + 1}. ${item.title || '無題のシーン'}`}
          </button>
        </Fragment>
      })}
    </nav>}
    <div className="stage-playback-controls">
      <button disabled={transitioning || index === 0}
        onClick={() => { setAuto(false); goTo(index - 1) }}>前へ</button>
      <button className="stage-playback-primary" disabled={scenes.length < 2}
        onClick={toggleAuto}>{auto ? '一時停止' : index === scenes.length - 1 ? '最初から再生' : '自動再生'}</button>
      <button disabled={transitioning || index >= scenes.length - 1}
        onClick={() => { setAuto(false); goTo(index + 1) }}>次へ GO</button>
      {displayMode === 'full' && <><label>1シーン
        <select value={holdSeconds} onChange={event => setHoldSeconds(Number(event.target.value))}>
          <option value="2">2秒</option><option value="3">3秒</option>
          <option value="5">5秒</option><option value="8">8秒</option>
        </select>
      </label>
      <label>視点
        <select value={cameraView} onChange={event => useStore.getState().updateSettings({ cameraView: event.target.value as typeof cameraView })}>
          <option value="audience">客席</option><option value="aerial">俯瞰</option>
          <option value="sidewing">袖</option><option value="free">自由</option>
        </select>
      </label></>}
      <button onClick={() => setDisplayMode(displayMode === 'full' ? 'compact' : 'full')}>
        {displayMode === 'full' ? '簡易表示' : '詳細'}
      </button>
      <button onClick={() => setDisplayMode('hidden')}>隠す</button>
      <button className="stage-playback-close" onClick={onClose}>編集に戻る</button>
    </div>
  </section>
}
