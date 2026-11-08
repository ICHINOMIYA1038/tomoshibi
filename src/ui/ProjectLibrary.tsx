import { useEffect, useRef, useState } from 'react'
import { useIsDirty, useStore } from '../store'
import { deleteSceneLS, exportScene, listSavedScenes, loadSceneLS, type SerializedScene } from '../io/sceneIO'
import { getActiveSavedProjectName, setActiveSavedProjectName } from '../io/mockProjectSession'
import { flushMockAutosave, resetMockWorkspace } from '../io/mockWorkspace'
import { VENUE_STUDY_LINKS } from '../demo/createVenueStudyPlans'
import { audienceSeatPositions } from '../audienceLayout'
import { DEFAULT_VENUE_LAYOUT, stageFootprint } from '../venueLayout'
import { workspaceBasePath } from '../io/workspacePath'

type LibraryItem = { key: string; scene: SerializedScene; draft: boolean }

function savedDate(value: string) {
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? '' : date.toLocaleDateString('ja-JP', { year: 'numeric', month: 'numeric', day: 'numeric' })
}

function sceneCount(item: LibraryItem) {
  return item.scene.productionPlan?.scenes?.length ?? 1
}

function stageObjects(item: LibraryItem) {
  const plan = item.scene.productionPlan
  const active = plan?.scenes?.find(scene => scene.id === plan.activeSceneId) ?? plan?.scenes?.[0]
  return {
    performers: active?.performers ?? item.scene.performers,
    fixtures: active?.fixtures ?? item.scene.fixtures,
    setPieces: active?.setPieces ?? item.scene.setPieces ?? [],
    sceneName: active?.title?.trim() || '最初のシーン',
  }
}

function StagePreview({ item }: { item: LibraryItem }) {
  const { performers, fixtures, setPieces, sceneName } = stageObjects(item)
  const layout = item.scene.productionPlan?.venueLayout ?? DEFAULT_VENUE_LAYOUT
  const outline = stageFootprint(layout)
  const seats = (item.scene.productionPlan?.audienceBlocks ?? []).flatMap(audienceSeatPositions)
  const seatDots = seats.filter((_, index) => index % Math.ceil(seats.length / 600) === 0)
  const points = [...outline, ...seats]
  const minX = Math.min(...points.map(point => point[0])) - 1.5
  const maxX = Math.max(...points.map(point => point[0])) + 1.5
  const minZ = Math.min(...points.map(point => point[1])) - 1.5
  const maxZ = Math.max(...points.map(point => point[1])) + 1.5
  const scale = Math.min(814 / (maxX - minX), 402 / (maxZ - minZ))
  const x = (value: number) => 462 + (value - (minX + maxX) / 2) * scale
  const y = (value: number) => 302 + (value - (minZ + maxZ) / 2) * scale
  const visible = performers.filter(person => person.onStage !== false)
  const shapeName = { proscenium: '額縁舞台', round: '円形舞台', thrust: '張り出し舞台', custom: '自由形状の舞台' }[layout.stageShape]
  return <div className="library-stage-preview" role="img" aria-label={`${sceneName}の配置プレビュー。役者${visible.length}人、照明${fixtures.length}灯、舞台セット${setPieces.length}点`}>
    <div className="library-stage-preview-head"><strong>{sceneName}</strong><span>配置プレビュー</span></div>
    <svg viewBox="0 0 924 594" aria-hidden="true">
      <rect width="924" height="594" fill="#f4efe6" />
      <polygon points={outline.map(([px, pz]) => `${x(px)},${y(pz)}`).join(' ')} fill="#fffdf9" stroke="#584a40" strokeWidth="3" />
      {seatDots.map(([sx, sz], index) => <rect key={index} x={x(sx) - 3} y={y(sz) - 3} width="6" height="6" rx="1" fill="#93756f" />)}
      <text x="462" y="560" textAnchor="middle" fill="#6c6055" fontSize="17">{shapeName} · {seats.length}席</text>
      {fixtures.slice(0, 16).map(fixture => <g key={fixture.id}>
        <line x1={x(fixture.position[0])} y1={y(fixture.position[2])}
          x2={x(fixture.target[0])} y2={y(fixture.target[2])}
          stroke="#b79a62" strokeWidth="2" strokeDasharray="5 5" opacity=".75" />
        <circle cx={x(fixture.position[0])} cy={y(fixture.position[2])} r="5" fill={fixture.enabled ? '#b79a62' : '#aaa39b'} stroke="#fffdf9" strokeWidth="1" />
      </g>)}
      {setPieces.slice(0, 20).map(piece => {
        const width = Math.max(12, (piece.size?.[0] ?? 1) * Math.abs(piece.scale) * scale)
        const depth = Math.max(10, (piece.size?.[2] ?? 1) * Math.abs(piece.scale) * scale)
        return <g key={piece.id}>
          <rect x={x(piece.position[0]) - width / 2} y={y(piece.position[2]) - depth / 2}
            width={width} height={depth} rx="2" fill="#a6a190" stroke="#675e52" />
          <text x={x(piece.position[0])} y={y(piece.position[2]) - depth / 2 - 6}
            textAnchor="middle" fill="#423a33" fontSize="11">{piece.name.slice(0, 12)}</text>
        </g>
      })}
      {visible.slice(0, 24).map(person => <g key={person.id}>
        <circle cx={x(person.position[0])} cy={y(person.position[2])} r="10" fill="#a65a47" stroke="#fffdf9" strokeWidth="2" />
        <text x={x(person.position[0])} y={y(person.position[2]) - 16} textAnchor="middle" fill="#45372f" fontSize="12" fontWeight="700">{person.name.slice(0, 10)}</text>
      </g>)}
      {visible.length === 0 && fixtures.length === 0 && setPieces.length === 0 &&
        <text x="462" y="290" textAnchor="middle" fill="#8a8075" fontSize="18">舞台の配置はまだありません</text>}
    </svg>
    <div className="library-stage-legend"><span><i className="performer" />役者 {visible.length}人</span><span><i className="fixture" />照明 {fixtures.length}灯</span><span><i className="setpiece" />舞台セット {setPieces.length}点</span></div>
  </div>
}

function StructurePreview({ item }: { item: LibraryItem }) {
  const plan = item.scene.productionPlan
  const chapters = plan?.chapters ?? []
  const sequences = plan?.sequences ?? []
  const scenes = plan?.scenes ?? []
  if (!chapters.length) return <p className="library-structure-empty">章の構成はまだありません。編集画面で追加できます。</p>
  return <div className="library-structure-list">
    {chapters.map((chapter, index) => {
      const groupIds = new Set(sequences.filter(sequence => sequence.chapterId === chapter.id).map(sequence => sequence.id))
      const entries = scenes.filter(scene => groupIds.has(scene.sequenceId ?? ''))
      const names = entries.slice(0, 3).map(scene => scene.title || '無題のシーン').join('、')
      return <div className="library-structure-row" key={chapter.id}>
        <span className="library-structure-number">{index + 1}</span>
        <div><strong>{chapter.title || '無題の章'}</strong>
          <p>{entries.length ? `${entries.length}シーン · ${names}${entries.length > 3 ? `、ほか${entries.length - 3}件` : ''}` : 'シーンなし'}</p></div>
      </div>
    })}
  </div>
}

export function ProjectLibrary({ onOpenEditor }: { onOpenEditor: () => void }) {
  const dirty = useIsDirty()
  const [projects, setProjects] = useState(listSavedScenes)
  const [selectedKey, setSelectedKey] = useState<string | null>(() => dirty ? '__draft' : getActiveSavedProjectName())
  const [feedback, setFeedback] = useState('')
  const detailsRef = useRef<HTMLElement>(null)
  const plan = useStore(s => s.productionPlan)
  const markSaved = useStore(s => s.markSavedSnapshot)
  const loadPreset = useStore(s => s.loadPreset)
  const savedName = getActiveSavedProjectName()
  useEffect(() => {
    if (selectedKey === null && savedName) setSelectedKey(savedName)
  }, [plan.activeSceneId, savedName, selectedKey])
  const hasDraft = plan.scenes.length > 0 && (dirty || !savedName)
  const draftTitle = plan.projectTitle?.trim() || '名称未設定のプロジェクト'
  const items: LibraryItem[] = [
    ...(hasDraft ? [{ key: '__draft', scene: exportScene(draftTitle), draft: true }] : []),
    ...projects.slice().reverse().map(scene => ({ key: scene.name, scene, draft: false })),
  ]
  const selected = items.find(item => item.key === selectedKey) ?? items[0]

  const selectItem = (key: string) => {
    setSelectedKey(key)
    if (window.innerWidth <= 760) window.setTimeout(() => detailsRef.current?.scrollIntoView({
      behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth', block: 'start',
    }), 50)
  }
  const open = (item: LibraryItem) => {
    if (item.draft) { onOpenEditor(); return }
    if (!flushMockAutosave() && !window.confirm('現在の変更を保存できませんでした。別のプロジェクトを開きますか？')) return
    loadSceneLS(item.scene.name)
    setActiveSavedProjectName(item.scene.name)
    markSaved()
    resetMockWorkspace()
    onOpenEditor()
  }
  const create = () => {
    if (!flushMockAutosave() && !window.confirm('現在の変更を保存できませんでした。新しいプロジェクトを作りますか？')) return
    loadPreset('empty')
    useStore.getState().ensureScenes()
    setActiveSavedProjectName(null)
    markSaved()
    resetMockWorkspace()
    onOpenEditor()
  }
  const remove = (name: string) => {
    if (!window.confirm(`「${name}」をこの端末から削除しますか？`)) return
    try {
      deleteSceneLS(name)
      if (savedName === name) { setActiveSavedProjectName(null); resetMockWorkspace() }
      setProjects(listSavedScenes())
      setSelectedKey(null)
      setFeedback(`「${name}」を削除しました`)
    } catch {
      setFeedback('削除できませんでした。端末の保存領域を確認してください。')
    }
  }

  return <main className="project-library">
    <header className="project-library-header">
      <a href="/" className="project-library-brand">TOMOSHIBI<span>小屋</span></a>
      <span className="project-library-storage">この端末に保存</span>
    </header>
    <div className="project-library-workspace">
      <aside className="project-library-rail" aria-label="プロジェクト一覧">
        <div className="project-library-rail-head"><h1>プロジェクト</h1><p>編集する舞台を選んでください。</p></div>
        <button className="project-library-create" onClick={create}>＋ 新しいプロジェクトを作る</button>
        <div className="project-library-list-head">会場配置のサンプル</div>
        <div className="project-library-study-list">
          {VENUE_STUDY_LINKS.map(study => <a key={study.kind} href={`${workspaceBasePath()}/?demo=venue-${study.kind}`}>
            <strong>{study.label}</strong><span>{study.detail}　↗</span>
          </a>)}
        </div>
        <div className="project-library-list-head">{items.length ? `${items.length}件のプロジェクト` : '保存したプロジェクト'}</div>
        {items.length ? <div className="project-library-list">
          {items.map(item => <button key={item.key}
            className={'project-library-list-item' + (selected?.key === item.key ? ' selected' : '')}
            aria-current={selected?.key === item.key ? 'true' : undefined}
            onClick={() => selectItem(item.key)}>
            <strong>{item.scene.name}</strong>
            <span>{item.draft ? '編集中の変更' : savedDate(item.scene.savedAt)}<small>{sceneCount(item)}シーン</small></span>
          </button>)}
        </div> : <div className="project-library-list-empty">まだプロジェクトがありません。上のボタンから作成できます。</div>}
        {feedback && <div className="project-library-feedback" role="status">{feedback}</div>}
      </aside>
      <section className="project-library-detail" ref={detailsRef} aria-label="選択したプロジェクトの内容">
        {selected ? <>
          <div className="project-library-detail-head">
            <div><span className="project-library-detail-type">{selected.draft ? '編集中' : '保存済みのプロジェクト'}</span>
              <h2>{selected.scene.name}</h2>
              <p>{selected.draft ? 'まだ保存していない変更があります' : `最終保存 ${savedDate(selected.scene.savedAt)}`}</p></div>
            <button className="project-library-open" onClick={() => open(selected)}>{selected.draft ? '編集に戻る' : 'このプロジェクトを開く'}</button>
          </div>
          <StagePreview item={selected} />
          <div className="project-library-detail-bottom">
            <section><h3>公演の流れ</h3><StructurePreview item={selected} /></section>
            <section className="project-library-detail-info"><h3>内容</h3>
              <dl><div><dt>章</dt><dd>{selected.scene.productionPlan?.chapters?.length ?? 0}</dd></div>
                <div><dt>シーン</dt><dd>{sceneCount(selected)}</dd></div></dl>
              {!selected.draft && <button className="project-library-delete" onClick={() => remove(selected.scene.name)}>このプロジェクトを削除</button>}
            </section>
          </div>
        </> : <div className="project-library-empty-detail">
          <div className="project-library-empty-stage" aria-hidden="true"><span>舞台</span><span>客席</span></div>
          <h2>新しい舞台をつくる</h2>
          <p>プロジェクトを作ると、照明・役者・舞台セットを同じ舞台で配置できます。</p>
          <button className="project-library-open" onClick={create}>新しいプロジェクトを作る</button>
        </div>}
      </section>
    </div>
  </main>
}
