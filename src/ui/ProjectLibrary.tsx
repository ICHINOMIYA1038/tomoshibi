import { captureBrowserProjects, clearBrowserProjects } from '../io/browserProjectCleanup'
import { acknowledgeTransfers, pendingTransfers, recordTransferred, transferFingerprint } from '../io/projectTransfer'
import { hasDeviceStorage } from '../io/workspaceStorage'
import { useEffect, useRef, useState } from 'react'
import { useIsDirty, useStore } from '../store'
import { deleteSceneLS, exportScene, listSavedScenes, loadSceneLS, type SerializedScene } from '../io/sceneIO'
import { getActiveCloudProject, getActiveSavedProjectName, setActiveCloudProject, setActiveSavedProjectName } from '../io/mockProjectSession'
import { flushMockAutosave, preserveMockDraftBeforeDemo, resetMockWorkspace, useMockWorkspaceState, waitForCloudSave } from '../io/mockWorkspace'
import { createVenueTemplatePlan, VENUE_STUDY_LINKS, type VenueStudyKind } from '../demo/createVenueStudyPlans'
import { audienceSeatPositions } from '../audienceLayout'
import { DEFAULT_VENUE_LAYOUT, stageFootprint } from '../venueLayout'
import { CloudError, accountUrl, createCloudProject, fetchCloudProject, fetchCloudScene, listCloudProjects, listCloudScenes, loginUrl, replaceCloudProject, type CloudProjectMeta, type CloudSceneMeta } from '../io/cloud'
import { useCloudSession } from '../io/cloudSession'
import { copyLegacyScene, ensureLegacyLocalProject, importedProjectName, listLegacyLocalScenes } from '../io/legacyMigration'
import { importScene } from '../io/sceneIO'

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
  const { cloudDirty, saveStatus } = useMockWorkspaceState()
  const { user, loading: sessionLoading } = useCloudSession()
  const [projects, setProjects] = useState(listSavedScenes)
  const [memberProjects, setMemberProjects] = useState<CloudProjectMeta[]>([])
  const [memberBusy, setMemberBusy] = useState(false)
  const [memberError, setMemberError] = useState('')
  const [legacyLocal, setLegacyLocal] = useState(listLegacyLocalScenes)
  const [cloudItems, setCloudItems] = useState<CloudSceneMeta[]>([])
  const [cloudLoading, setCloudLoading] = useState(false)
  const [cloudError, setCloudError] = useState('')
  const [importOpen, setImportOpen] = useState(() => location.hash === '#import')
  const [importBusy, setImportBusy] = useState('')
  const [importFeedback, setImportFeedback] = useState('')
  const [selectedKey, setSelectedKey] = useState<string | null>(() => dirty ? '__draft' : getActiveSavedProjectName())
  const [feedback, setFeedback] = useState('')
  const [transferOpen, setTransferOpen] = useState(false)
  const transferFingerprints = useRef<string[]>([])
  const [transferKeys, setTransferKeys] = useState<string[]>([])
  const [replaceIds, setReplaceIds] = useState<string[]>([])
  const [transferBusy, setTransferBusy] = useState(false)
  const [transferMessage, setTransferMessage] = useState('')
  const [createOpen, setCreateOpen] = useState(false)
  const [creating, setCreating] = useState(false)
  const [createError, setCreateError] = useState('')
  const [createName, setCreateName] = useState('')
  const [createTemplate, setCreateTemplate] = useState<'empty' | VenueStudyKind>('empty')
  const createNameRef = useRef<HTMLInputElement>(null)
  const createDialogRef = useRef<HTMLFormElement>(null)
  const detailsRef = useRef<HTMLElement>(null)
  const plan = useStore(s => s.productionPlan)
  const markSaved = useStore(s => s.markSavedSnapshot)
  const loadPreset = useStore(s => s.loadPreset)
  const savedName = getActiveSavedProjectName()
  useEffect(() => {
    try {
      if (hasDeviceStorage() && !getActiveCloudProject()) preserveMockDraftBeforeDemo()
      const migratedName = ensureLegacyLocalProject()
      setProjects(listSavedScenes())
      if (migratedName && !getActiveSavedProjectName() && !getActiveCloudProject()) setSelectedKey(migratedName)
    }
    catch { setFeedback('以前の端末内プランをまとめられませんでした。元データは残っています。') }
  }, [])
  useEffect(() => {
    if (sessionLoading) return
    if (!user) { setMemberProjects([]); return }
    let cancelled = false
    setMemberBusy(true)
    const localCandidates = listSavedScenes()
    if (!hasDeviceStorage() && !getActiveCloudProject()) {
      const current = useStore.getState().productionPlan
      if (current.scenes.length && current.projectTitle?.trim()) {
        const draft = exportScene(current.projectTitle.trim())
        if (!localCandidates.some(item => item.name === draft.name)) localCandidates.push(draft)
      }
    }
    listCloudProjects().then(async items => {
      const pending = await pendingTransfers(user.id, localCandidates, items.map(item => item.origin))
      if (!cancelled) {
        setMemberProjects(items)
        setMemberBusy(false)
        setProjects(pending.map(item => item.scene))
        transferFingerprints.current = pending.map(item => item.fingerprint)
        const explicit = new URLSearchParams(location.search).get('import') === 'local'
        if (pending.length && explicit && !getActiveCloudProject()) {
          acknowledgeTransfers(user.id, transferFingerprints.current)
          setTransferOpen(true)
        }
        if (explicit) {
          const url = new URL(location.href)
          url.searchParams.delete('import')
          history.replaceState(null, '', url.pathname + url.search + url.hash)
        }
      }
    }).catch(() => { if (!cancelled) { setMemberError('アカウントのプロジェクトを読み込めませんでした。'); setMemberBusy(false) } })
    return () => { cancelled = true }
  }, [sessionLoading, user?.id])
  useEffect(() => {
    if (!importOpen) return
    setLegacyLocal(listLegacyLocalScenes())
    if (!user) { setCloudItems([]); setCloudLoading(false); return }
    let cancelled = false
    setCloudLoading(true)
    listCloudScenes().then(items => {
      if (!cancelled) { setCloudItems(items); setCloudError(''); setCloudLoading(false) }
    }).catch(() => {
      if (!cancelled) { setCloudError('クラウドの旧プランを読み取れませんでした。'); setCloudLoading(false) }
    })
    return () => { cancelled = true }
  }, [importOpen, user?.id])
  useEffect(() => {
    if (selectedKey === null && savedName) setSelectedKey(savedName)
  }, [plan.activeSceneId, savedName, selectedKey])
  const hasDraft = plan.scenes.length > 0 && (dirty || cloudDirty || !savedName)
  const draftTitle = plan.projectTitle?.trim() || '名称未設定のプロジェクト'
  const items: LibraryItem[] = [
    ...(!user && hasDraft ? [{ key: '__draft', scene: exportScene(draftTitle), draft: true }] : []),
    ...(hasDeviceStorage() ? projects : []).slice().reverse().map(scene => ({ key: scene.name, scene, draft: false })),
  ]
  const selected = items.find(item => item.key === selectedKey) ?? items[0]

  useEffect(() => {
    if (!createOpen) return
    createNameRef.current?.focus()
    const onDialogKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') { setCreateOpen(false); return }
      if (event.key !== 'Tab') return
      const controls = createDialogRef.current?.querySelectorAll<HTMLElement>('button, input')
      if (!controls?.length) return
      const first = controls[0]
      const last = controls[controls.length - 1]
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus() }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus() }
    }
    window.addEventListener('keydown', onDialogKey)
    return () => window.removeEventListener('keydown', onDialogKey)
  }, [createOpen])

  const openCreate = () => {
    setCreateError('')
    setCreateName('')
    setCreateTemplate('empty')
    setCreateOpen(true)
  }

  const selectItem = (key: string) => {
    setSelectedKey(key)
    if (window.innerWidth <= 760) window.setTimeout(() => detailsRef.current?.scrollIntoView({
      behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth', block: 'start',
    }), 50)
  }
  const open = (item: LibraryItem) => {
    if (item.draft) { onOpenEditor(); return }
    if (!flushMockAutosave() && !window.confirm('現在の変更を保存できませんでした。別のプロジェクトを開きますか？')) return
    if (!preserveMockDraftBeforeDemo()) { setFeedback('現在の変更を端末に控えられませんでした。'); return }
    loadSceneLS(item.scene.name)
    setActiveCloudProject(null)
    setActiveSavedProjectName(item.scene.name)
    markSaved()
    resetMockWorkspace()
    onOpenEditor()
  }
  const create = async () => {
    if (creating) return
    if (user && memberProjects.length >= user.maxProjects) { setCreateError(`プロジェクトは${user.maxProjects}件まで保存できます。`); return }
    const title = createName.trim()
    if (!title) { createNameRef.current?.focus(); return }
    if (cloudDirty) {
      if (!window.confirm('編集中の変更がまだ保存されていません。保存が完了してから、新しいプロジェクトを作成しますか？')) return
      setCreating(true)
      try { await waitForCloudSave() }
      catch (error) { setCreateError(error instanceof Error ? error.message : '保存状態を確認できませんでした。'); setCreating(false); return }
      setCreating(false)
    }
    if (!flushMockAutosave() && !window.confirm('現在の変更を保存できませんでした。新しいプロジェクトを作りますか？')) return
    if (hasDeviceStorage() && !preserveMockDraftBeforeDemo()) { setCreateError('現在の変更を保存できませんでした。'); return }
    if (!user && !hasDeviceStorage() && hasDraft && !window.confirm('編集中のプロジェクトを新しい内容に置き換えますか？ブラウザで保持できるのは1件です。')) return
    const previous = exportScene()
    const previousCloud = getActiveCloudProject()
    const previousName = getActiveSavedProjectName()
    setCreating(true)
    try {
    if (createTemplate === 'empty') {
      loadPreset('empty')
      useStore.getState().ensureScenes()
    } else createVenueTemplatePlan(createTemplate)
    useStore.getState().updateProductionPlan({ projectTitle: title })
    setActiveSavedProjectName(null)
    setActiveCloudProject(null)
    markSaved()
    resetMockWorkspace()
    flushMockAutosave()
    if (user) {
      const created = await createCloudProject(title, exportScene(title))
      setActiveCloudProject({ id: created.id, name: created.name, revision: created.revision })
      resetMockWorkspace()
      flushMockAutosave()
    }
    setCreateOpen(false)
    onOpenEditor()
    } catch (error) {
      importScene(previous)
      setActiveCloudProject(previousCloud)
      setActiveSavedProjectName(previousName)
      resetMockWorkspace()
      flushMockAutosave()
      setCreateError(error instanceof Error ? error.message : '作成できませんでした。もう一度お試しください。')
    } finally { setCreating(false) }
  }
  const openMemberProject = async (item: CloudProjectMeta) => {
    if (!flushMockAutosave()) { setMemberError('現在の変更を端末に保存できませんでした。'); return }
    if (cloudDirty) {
      if (!window.confirm('編集中の変更がまだ保存されていません。保存が完了してから、選んだプロジェクトを開きますか？')) return
      setMemberBusy(true)
      try { await waitForCloudSave() }
      catch (error) { setMemberError(error instanceof Error ? error.message : '保存状態を確認できませんでした。'); setMemberBusy(false); return }
    }
    setMemberBusy(true)
    try {
      const full = await fetchCloudProject(item.id)
      importScene(full.data)
      setActiveSavedProjectName(null)
      setActiveCloudProject({ id: full.id, name: full.name, revision: full.revision })
      markSaved()
      resetMockWorkspace()
      onOpenEditor()
    } catch (error) { setMemberError(error instanceof CloudError ? error.status === 401 ? 'ログインの有効期限が切れました。再度ログインしてください。' : error.message : 'プロジェクトを開けませんでした。もう一度お試しください。') }
    finally { setMemberBusy(false) }
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

  useEffect(() => {
    setTransferOpen(false)
    setTransferKeys([])
    setReplaceIds([])
    transferFingerprints.current = []
  }, [user?.id])

  const availableSlots = Math.max(0, (user?.maxProjects ?? 2) - memberProjects.length)
  const closeTransfer = () => {
    if (transferBusy) return
    if (user) acknowledgeTransfers(user.id, transferFingerprints.current)
    setTransferOpen(false)
    setReplaceIds([])
    const url = new URL(location.href)
    url.searchParams.delete('import')
    history.replaceState(null, '', url.pathname + url.search + url.hash)
  }
  const transferProjects = async () => {
    if (!user || transferBusy) return
    if (replaceIds.length > transferKeys.length) { setTransferMessage('入れ替える数だけ、新しく残すプロジェクトを選んでください。'); return }
    const selected = projects.filter(scene => transferKeys.includes(scene.name))
    if (!selected.length || selected.length !== transferKeys.length) return
    const replacementNames = memberProjects.filter(item => replaceIds.includes(item.id)).map(item => item.name)
    const warning = [
      `アカウントに保存するプロジェクト（${selected.length}件）\n${selected.map(scene => `・${scene.name}`).join('\n')}`,
      ...(replacementNames.length ? [`上書きするプロジェクト\n${replacementNames.map(name => `・${name}`).join('\n')}`] : []),
      ...(hasDeviceStorage() ? [] : ['保存後、このブラウザのプロジェクトは、選ばなかったものも含めてすべて削除されます。']),
      'この内容で続けますか？',
    ].join('\n\n')
    if (!window.confirm(warning)) return
    setTransferBusy(true)
    setTransferMessage('')
    try {
      if (!flushMockAutosave()) throw new Error('編集中の内容を保持できませんでした。空き容量を確認してください。')
      const browserProjects = captureBrowserProjects()
      let savedProject: { id: string; name: string; revision: number; data: SerializedScene } | null = null
      const current = await listCloudProjects()
      const targets = memberProjects.filter(item => replaceIds.includes(item.id))
      if (targets.some(item => !current.some(latest => latest.id === item.id && latest.revision === item.revision))) {
        setMemberProjects(current); setReplaceIds([])
        setTransferMessage('別の端末で更新されています。残すプロジェクトを選び直してください。')
        return
      }
      if (transferKeys.length > Math.max(0, user.maxProjects - current.length) + targets.length) {
        setMemberProjects(current)
        setTransferKeys([])
        setTransferMessage('空き枠が変わりました。保存するプロジェクトを選び直してください。')
        return
      }
      for (const key of transferKeys) {
        const scene = projects.find(item => item.name === key)
        if (!scene) continue
        const importKey = await transferFingerprint(scene)
        const target = targets.shift()
        const created = target
          ? await replaceCloudProject(target.id, target.revision, scene.name.slice(0, 60), scene)
          : await createCloudProject(scene.name.slice(0, 60), scene, importKey)
        savedProject ??= { id: created.id, name: created.name, revision: created.revision, data: scene }
        recordTransferred(user.id, importKey)
        setProjects(items => items.filter(item => item.name !== key))
        if (target) setReplaceIds(ids => ids.filter(id => id !== target.id))
        setMemberProjects(items => items.some(item => item.id === created.id) ? items.map(item => item.id === created.id ? { ...item, ...created } : item) : [...items, created])
        setTransferKeys(keys => keys.filter(item => item !== key))
      }
      if (!hasDeviceStorage()) {
        clearBrowserProjects(browserProjects)
        if (!getActiveCloudProject() && savedProject) {
          importScene(savedProject.data)
          setActiveCloudProject({ id: savedProject.id, name: savedProject.name, revision: savedProject.revision })
          setActiveSavedProjectName(null)
          markSaved()
          resetMockWorkspace()
        }
        setProjects([])
        setLegacyLocal(listLegacyLocalScenes())
      }
      acknowledgeTransfers(user.id, transferFingerprints.current)
      setTransferOpen(false)
      setReplaceIds([])
      setFeedback('アカウントに引き継ぎました。ほかの端末からも開けます。')
    } catch (error) {
      setTransferMessage(error instanceof Error ? error.message : '保存できませんでした。端末の元データは残っています。')
    } finally { setTransferBusy(false) }
  }

  const closeImport = () => {
    if (importBusy) return
    setImportOpen(false)
    if (location.hash === '#import') history.replaceState(null, '', location.pathname + location.search)
  }
  const copyOne = async (sourceKey: string, getScene: () => Promise<SerializedScene>) => {
    setImportBusy(sourceKey)
    setImportFeedback('')
    try {
      const result = copyLegacyScene(await getScene(), sourceKey)
      setProjects(listSavedScenes())
      setSelectedKey(result.name)
      setImportFeedback(result.alreadyCopied
        ? `「${result.name}」は引き継ぎ済みです。`
        : `「${result.name}」をコピーしました。元のプランはそのままです。`)
    } catch (error) {
      setImportFeedback(error instanceof Error ? error.message : 'コピーできませんでした。元のプランはそのままです。')
    } finally { setImportBusy('') }
  }
  const copyAll = async () => {
    setImportBusy('all')
    setImportFeedback('')
    let copied = 0
    let skipped = 0
    let failed = 0
    for (const item of legacyLocal.items) {
      try {
        const result = copyLegacyScene(item.scene, item.key)
        result.alreadyCopied ? skipped++ : copied++
      } catch { failed++ }
    }
    for (const item of cloudError ? [] : cloudItems) {
      try {
        const result = copyLegacyScene(await fetchCloudScene(item.id), `cloud:${item.id}:${item.updatedAt}`)
        result.alreadyCopied ? skipped++ : copied++
      } catch { failed++ }
    }
    setProjects(listSavedScenes())
    setImportFeedback(`${copied}件をコピーしました。${skipped ? `引き継ぎ済み${skipped}件。` : ''}${failed ? `${failed}件はコピーできませんでした。` : ''}元のプランはそのままです。`)
    setImportBusy('')
  }

  return <main className="project-library">
    <header className="project-library-header">
      <a href="/" className="project-library-brand">TOMOSHIBI<span>小屋</span></a>
      <span className="project-library-storage">{user ? <><a href="/pro">{user.plan === 'pro' ? 'プラン管理・解約' : '料金プラン'}</a><a href={accountUrl()}>アカウント設定 ↗</a></> : (hasDeviceStorage() ? 'このアプリに保存' : 'ブラウザに一時保存')}</span>
    </header>
    <div className="project-library-workspace">
      <aside className="project-library-rail" aria-label="プロジェクト一覧">
        <div className="project-library-rail-head"><h1>プロジェクト</h1><p>編集する舞台を選んでください。</p></div>
        <button className="project-library-create" onClick={openCreate}>＋ 新しいプロジェクトを作る</button>
        {user && <>
          <div className="project-library-list-head project-library-list-head-explained">
            <strong>アカウントに保存 {memberProjects.length} / {user.maxProjects}件</strong><span>ログインすれば、ほかの端末からも開けます</span>
          </div>
          {memberBusy && <p className="project-library-list-empty">読み込み中…</p>}
          {memberError && <p className="project-library-feedback" role="status">{memberError}</p>}
          <div className="project-library-list">
            {memberProjects.map(item => <button key={item.id} className="project-library-list-item"
              disabled={memberBusy} onClick={() => openMemberProject(item)}>
              <strong>{item.name}</strong><span>{savedDate(item.updatedAt)}<small>開く →</small></span>
            </button>)}
          </div>
        </>}
        {(!user || hasDeviceStorage()) && <>
        <div className="project-library-list-head project-library-list-head-explained">
          <strong>{items.length ? `${hasDeviceStorage() ? 'このアプリに保存' : 'ブラウザに一時保存'} ${items.length}件` : (hasDeviceStorage() ? 'このアプリに保存' : 'ブラウザに一時保存')}</strong>
          <span>{hasDeviceStorage() ? 'アカウントとは同期されません' : 'タブを閉じる前に、アカウントへ保存してください'}</span>
        </div>
        {items.length ? <div className="project-library-list">
          {items.map(item => <button key={item.key}
            className={'project-library-list-item' + (selected?.key === item.key ? ' selected' : '')}
            aria-current={selected?.key === item.key ? 'true' : undefined}
            onClick={() => selectItem(item.key)}>
            <strong>{item.scene.name}</strong>
            <span>{item.draft ? '編集中の変更' : savedDate(item.scene.savedAt)}<small>{sceneCount(item)}シーン</small></span>
          </button>)}
        </div> : <div className="project-library-list-empty">まだプロジェクトがありません。上のボタンから作成できます。</div>}
        </>}
        {user && projects.length > 0 && <button className="project-library-import" onClick={() => { setTransferKeys([]); setReplaceIds([]); setTransferMessage(''); setTransferOpen(true) }}>プロジェクトをアカウントへ引き継ぐ</button>}
        {feedback && <div className="project-library-feedback" role="status">{feedback}</div>}
      </aside>
      <section className="project-library-detail" ref={detailsRef} aria-label="選択したプロジェクトの内容">
        {selected ? <>
          <div className="project-library-detail-head">
            <div><span className="project-library-detail-type">{selected.draft ? '編集中' : '保存済みのプロジェクト'}</span>
              <h2>{selected.scene.name}</h2>
              <p>{selected.draft
                ? saveStatus === 'saving' ? '変更を自動保存しています…'
                  : saveStatus === 'error' ? '自動保存できませんでした。通信状況や保存容量を確認してください。'
                    : cloudDirty ? 'アカウントへの保存待ち' : getActiveCloudProject() ? 'アカウントに自動保存されています' : (hasDeviceStorage() ? 'このアプリに自動保存されています' : 'ブラウザに一時保存中です。タブを閉じると失われます。')
                : `最終保存 ${savedDate(selected.scene.savedAt)}`}</p></div>
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
          <button className="project-library-open" onClick={openCreate}>新しいプロジェクトを作る</button>
        </div>}
      </section>
    </div>
    {transferOpen && user && <div className="project-create-backdrop">
      <section className="project-create-dialog" role="dialog" aria-modal="true" aria-labelledby="project-transfer-title">
        <div className="project-create-head"><div><h2 id="project-transfer-title">アカウントに残すプロジェクトを選ぶ</h2>
          <p>上限{user.maxProjects}件・現在{memberProjects.length}件。保存済みの選択を外すと、新しいものと入れ替えられます。</p></div></div>
        {user.plan !== 'pro' && <p className="project-library-feedback">有料プランなら10件まで保存できます。<a href="/pro">有料プランを見る →</a></p>}
        <h3>アカウントに保存済み</h3>
        <div className="project-create-template-grid">{memberProjects.map(item => <label key={item.id} className={!replaceIds.includes(item.id) ? 'selected' : ''}>
          <input type="checkbox" checked={!replaceIds.includes(item.id)} disabled={transferBusy}
            onChange={event => { setReplaceIds(ids => event.target.checked ? ids.filter(id => id !== item.id) : [...ids, item.id]); setTransferKeys([]) }} />
          <span><strong>{item.name}</strong><small>{replaceIds.includes(item.id) ? '入れ替え対象（上書きされます）' : 'アカウントに残す'}</small></span>
        </label>)}</div>
        <h3>{hasDeviceStorage() ? 'このアプリに保存されているプロジェクト' : 'このブラウザに保存されているプロジェクト'}</h3>
        <p>ここからアカウントへ引き継ぐものを、あと{Math.max(0, availableSlots + replaceIds.length - transferKeys.length)}件選べます。</p>
        <div className="project-create-template-grid">
          {projects.map(scene => <label key={scene.name} className={transferKeys.includes(scene.name) ? 'selected' : ''}>
            <input type="checkbox" checked={transferKeys.includes(scene.name)}
              disabled={transferBusy || !transferKeys.includes(scene.name) && transferKeys.length >= availableSlots + replaceIds.length}
              onChange={event => setTransferKeys(keys => event.target.checked ? [...keys, scene.name] : keys.filter(key => key !== scene.name))} />
            <span><strong>{scene.name}</strong><small>{savedDate(scene.savedAt)}</small></span>
          </label>)}
        </div>
        <p role="status" className={!hasDeviceStorage() && !transferMessage ? 'project-transfer-warning' : undefined}>{transferMessage || (hasDeviceStorage() ? '選ばなかったものは、アプリ内で引き続き利用できます。' : '選んだプロジェクトをアカウントに保存します。保存後、このブラウザのプロジェクトは、選ばなかったものも含めてすべて削除されます。残したいものを選んでください。')}</p>
        <div className="project-create-actions">
          <button disabled={transferBusy} onClick={closeTransfer}>閉じる</button>
          <button disabled={transferBusy || !transferKeys.length} onClick={transferProjects}>{transferBusy ? '保存中…' : `選んだ${transferKeys.length}件を保存して続ける`}</button>
        </div>
      </section>
    </div>}
    {createOpen && <div className="project-create-backdrop" onMouseDown={event => { if (event.target === event.currentTarget) setCreateOpen(false) }}>
      <form ref={createDialogRef} className="project-create-dialog" role="dialog" aria-modal="true" aria-labelledby="project-create-title"
        onSubmit={event => { event.preventDefault(); create() }}>
        <div className="project-create-head">
          <div><h2 id="project-create-title">新しいプロジェクト</h2><p>{!user && !hasDeviceStorage() ? 'ログイン前の作業は一時保存です。残す場合はログインして引き継いでください。' : '名前と舞台のひな形を決めて始めます。'}</p></div>
          <button type="button" className="project-create-close" onClick={() => setCreateOpen(false)} aria-label="閉じる">×</button>
        </div>
        <label className="project-create-name">プロジェクト名
          <input ref={createNameRef} value={createName} onChange={event => setCreateName(event.target.value)}
            placeholder="例：星の夜" required maxLength={80} />
        </label>
        <fieldset className="project-create-templates">
          <legend>舞台のひな形</legend>
          <div className="project-create-template-grid">
            <label className={createTemplate === 'empty' ? 'selected' : ''}>
              <input type="radio" name="project-template" checked={createTemplate === 'empty'} onChange={() => setCreateTemplate('empty')} />
              <span><strong>白紙から始める</strong><small>客席・役者・照明を自分で配置</small></span>
            </label>
            {VENUE_STUDY_LINKS.map(study => <label key={study.kind} className={createTemplate === study.kind ? 'selected' : ''}>
              <input type="radio" name="project-template" checked={createTemplate === study.kind} onChange={() => setCreateTemplate(study.kind)} />
              <span><strong>{study.label}</strong><small>{study.detail}を配置</small></span>
            </label>)}
          </div>
          <p>ひな形には舞台と客席のみが入ります。役者・照明・シーンは自由に追加できます。</p>
        </fieldset>
        {cloudDirty && <div role="status" className="project-create-save-notice">
          <p>編集中のプロジェクトに、まだクラウドに保存されていない変更があります。保存が完了すると新規作成できます。</p>
          <button type="button" onClick={onOpenEditor}>編集中のプロジェクトに戻る</button>
        </div>}
        {createError && <p role="alert">{createError}</p>}
        <div className="project-create-actions">
          <button type="button" disabled={creating} onClick={() => setCreateOpen(false)}>キャンセル</button>
          <button type="submit" disabled={creating}>{creating ? '保存・作成中…' : cloudDirty ? '保存して新規作成' : 'プロジェクトを作成'}</button>
        </div>
      </form>
    </div>}
    {importOpen && <div className="legacy-import-backdrop" onMouseDown={event => { if (event.target === event.currentTarget) closeImport() }}>
      <section className="legacy-import-dialog" role="dialog" aria-modal="true" aria-labelledby="legacy-import-title">
        <header><div><h2 id="legacy-import-title">以前のプランを引き継ぐ</h2>
          <p>旧プランをこの端末の新しいプロジェクトにコピーします。元のプランは残ります。コピー先は別の端末と同期しません。</p></div>
          <button className="legacy-import-close" onClick={closeImport} aria-label="閉じる">×</button></header>
        <div className="legacy-import-body">
          <section><h3>この端末に保存したプラン <small>{legacyLocal.items.length}件</small></h3>
            {legacyLocal.error && <p className="legacy-import-error">{legacyLocal.error}</p>}
            {legacyLocal.items.length ? <ul>{legacyLocal.items.map(item => <li key={item.key}>
              <span><strong>{item.scene.name}</strong><small>{savedDate(item.scene.savedAt)}</small></span>
              <button disabled={Boolean(importBusy)} onClick={() => copyOne(item.key, async () => item.scene)}>
                {importedProjectName(item.key) ? 'コピー済み' : 'コピーする'}
              </button>
            </li>)}</ul> : <p className="legacy-import-empty">この端末に保存した旧プランはありません。</p>}
          </section>
          <section><h3>会員アカウントに保存したプラン <small>{user ? `${cloudItems.length}件` : ''}</small></h3>
            {sessionLoading ? <p className="legacy-import-empty">ログイン状態を確認中…</p>
              : !user ? <p className="legacy-import-empty">ログインすると、クラウドに保存した旧プランも読み込めます。<a href={loginUrl()}>ログインする →</a></p>
                : cloudLoading ? <p className="legacy-import-empty">クラウドの旧プランを読み込み中…</p>
                : cloudError ? <p className="legacy-import-error">{cloudError}</p>
                  : cloudItems.length ? <ul>{cloudItems.map(item => {
                    const key = `cloud:${item.id}:${item.updatedAt}`
                    return <li key={item.id}><span><strong>{item.name}</strong><small>{savedDate(item.updatedAt)}</small></span>
                      <button disabled={Boolean(importBusy)} onClick={() => copyOne(key, () => fetchCloudScene(item.id))}>
                        {importedProjectName(key) ? 'コピー済み' : 'コピーする'}
                      </button></li>
                  })}</ul> : <p className="legacy-import-empty">クラウドに保存した旧プランはありません。</p>}
          </section>
        </div>
        <footer><span role="status" aria-live="polite">{importFeedback}</span>
          <button className="legacy-import-all" disabled={Boolean(importBusy) || cloudLoading || !legacyLocal.items.length && !cloudItems.length} onClick={copyAll}>
            {importBusy === 'all' ? 'コピー中…' : 'まとめてコピー'}</button></footer>
      </section>
    </div>}
  </main>
}
