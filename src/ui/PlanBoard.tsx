import { Fragment, useEffect, useRef, useState, type MouseEvent, type PointerEvent } from 'react'
import { activeSceneDirections, LIMITS, PLAN_LIMITS, SCENE_TRIGGER_LABELS, sceneDisplayTitle, useStore,
  type DirectionKind, type MoveSceneResult, type SceneTriggerType, type StagePoint } from '../store'
import { AudienceLayoutEditor } from './AudienceLayoutEditor'

const MAP = { left: 100, top: 70, width: 760, height: 480, svgWidth: 960, svgHeight: 630 }
const pathColors: Record<DirectionKind, string> = {
  move: '#d4af6f', entrance: '#78bca0', exit: '#df8f7c',
}
const actorColors = ['#9f674d', '#627f9b', '#708d62', '#a27793', '#9a7e48', '#688e89']
const triggerPlaceholders: Record<SceneTriggerType, string> = {
  dialogue: '例：行こう', sound: '例：ドアが閉まる音', light: '例：暗転', other: 'きっかけを入力',
}
function CueIcon({ type }: { type?: SceneTriggerType }) {
  if (type === 'dialogue') return <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.7" aria-hidden="true"><path d="M3 4.5h14v9H9l-4 3v-3H3z" /></svg>
  if (type === 'sound') return <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.7" aria-hidden="true"><path d="M8 14V4l8-2v10" /><circle cx="5.5" cy="15" r="2.5" /><circle cx="13.5" cy="13" r="2.5" /></svg>
  if (type === 'light') return <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.7" aria-hidden="true"><path d="M7 14h6m-5 3h4M6.3 11.5a6 6 0 1 1 7.4 0c-.8.7-1.2 1.4-1.3 2.5H7.6c-.1-1.1-.5-1.8-1.3-2.5Z" /></svg>
  return null
}

function mapX(x: number) { return MAP.left + (x + 8) * MAP.width / 16 }
function mapY(z: number) { return z <= 2 ? MAP.top + (z + 8) * MAP.height / 10 : 550 + (z - 2) * 2.5 }
function clamp(value: number, min: number, max: number) { return Math.max(min, Math.min(max, value)) }
function colorToHex(rgb: [number, number, number]) {
  return '#' + rgb.map(value => Math.round(clamp(value, 0, 1) * 255).toString(16).padStart(2, '0')).join('')
}
function hexToRgb(hex: string): [number, number, number] {
  return [1, 3, 5].map(index => parseInt(hex.slice(index, index + 2), 16) / 255) as [number, number, number]
}
function mapPoint(event: PointerEvent<SVGSVGElement>, includeHouse = false): StagePoint {
  const rect = event.currentTarget.getBoundingClientRect()
  const px = (event.clientX - rect.left) * MAP.svgWidth / rect.width
  const py = (event.clientY - rect.top) * MAP.svgHeight / rect.height
  return [
    Math.round(clamp((px - MAP.left) * 16 / MAP.width - 8, -9.2, 9.2) * 10) / 10,
    Math.round(clamp(includeHouse && py > 550 ? 2 + (py - 550) / 2.5
      : (py - MAP.top) * 10 / MAP.height - 8, -7.8, includeHouse ? 24 : 1.8) * 10) / 10,
  ]
}
function placeName(point: StagePoint) {
  if (point[0] < -8) return '下手袖'
  if (point[0] > 8) return '上手袖'
  const side = point[0] < -2.4 ? '下手' : point[0] > 2.4 ? '上手' : '中央'
  const depth = point[1] < -4.8 ? '奥' : point[1] > -1.2 ? '前' : ''
  return side + depth
}

type DragStart = { kind: 'performer' | 'fixture' | 'target' | 'setpiece'; id: string; sceneId: string; from: StagePoint }
type OutlineKind = 'scene' | 'chapter'
type OutlineTarget = { id: string; position: 'before' | 'after' | 'chapter' | 'gap';
  chapterId?: string; beforeSceneId?: string | null }
type OutlinePointer = { kind: OutlineKind; id: string; pointerId: number; startX: number; startY: number;
  active: boolean; target: OutlineTarget | null }

export function PlanBoard({ open, onClose, onPlay, persistent = false, onNavigate,
  onCloseOutline, onCloseMap, showDirections = true, onToggleDirections,
  sceneEditorOpen = false, onOpenSceneEditor, onCloseSceneEditor }: {
  open: boolean; onClose: () => void; onPlay: () => void; persistent?: boolean; onNavigate?: () => void
  onCloseOutline?: () => void; onCloseMap?: () => void
  showDirections?: boolean; onToggleDirections?: () => void
  sceneEditorOpen?: boolean; onOpenSceneEditor?: () => void; onCloseSceneEditor?: () => void
}) {
  const plan = useStore(s => s.productionPlan)
  const performers = useStore(s => s.performers)
  const fixtures = useStore(s => s.fixtures)
  const setPieces = useStore(s => s.setPieces)
  const selection = useStore(s => s.selection)
  const select = useStore(s => s.select)
  const updateSettings = useStore(s => s.updateSettings)
  const ensureScenes = useStore(s => s.ensureScenes)
  const addScene = useStore(s => s.addScene)
  const addSceneAt = useStore(s => s.addSceneAt)
  const addChapter = useStore(s => s.addChapter)
  const addChapterAfter = useStore(s => s.addChapterAfter)
  const addSequence = useStore(s => s.addSequence)
  const updateChapter = useStore(s => s.updateChapter)
  const updateSequence = useStore(s => s.updateSequence)
  const updateProductionPlan = useStore(s => s.updateProductionPlan)
  const selectScene = useStore(s => s.selectScene)
  const updateScene = useStore(s => s.updateScene)
  const removeScene = useStore(s => s.removeScene)
  const removeScenes = useStore(s => s.removeScenes)
  const removeChapter = useStore(s => s.removeChapter)
  const moveScene = useStore(s => s.moveScene)
  const moveSceneToChapter = useStore(s => s.moveSceneToChapter)
  const moveChapter = useStore(s => s.moveChapter)
  const addPerformer = useStore(s => s.addPerformer)
  const addFixture = useStore(s => s.addFixture)
  const addPrimitiveSetPiece = useStore(s => s.addPrimitiveSetPiece)
  const updatePerformer = useStore(s => s.updatePerformer)
  const updateFixture = useStore(s => s.updateFixture)
  const updateSetPiece = useStore(s => s.updateSetPiece)
  const [showFixtures, setShowFixtures] = useState(true)
  const [showSetPieces, setShowSetPieces] = useState(true)
  const [audienceEditorOpen, setAudienceEditorOpen] = useState(false)
  const [lastMove, setLastMove] = useState<DragStart | null>(null)
  const [feedback, setFeedback] = useState('')
  const [contextMenu, setContextMenu] = useState<{ kind: 'chapter' | 'scene' | 'empty'; id: string; x: number; y: number } | null>(null)
  const [draggingOutline, setDraggingOutline] = useState<{ kind: OutlineKind; id: string } | null>(null)
  const [dropTarget, setDropTarget] = useState<OutlineTarget | null>(null)
  const [selectedSceneIds, setSelectedSceneIds] = useState<Set<string>>(() => new Set())
  const [selectionAnchorId, setSelectionAnchorId] = useState<string | null>(null)
  const [selectionMode, setSelectionMode] = useState(false)
  const outlinePointer = useRef<OutlinePointer | null>(null)
  const suppressOutlineClick = useRef<string | null>(null)
  const outlineRef = useRef<HTMLElement>(null)
  const dragStart = useRef<DragStart | null>(null)
  const svgRef = useRef<SVGSVGElement>(null)
  const chapterNameRef = useRef<HTMLInputElement>(null)
  const sequenceNameRef = useRef<HTMLInputElement>(null)
  const sceneNameRef = useRef<HTMLInputElement>(null)
  const pendingFocus = useRef<'chapter' | 'sequence' | 'scene' | null>(null)
  const [renaming, setRenaming] = useState<{ kind: 'chapter' | 'sequence' | 'scene'; id: string } | null>(null)
  const renameOriginal = useRef('')
  const [collapsedChapters, setCollapsedChapters] = useState<Set<string>>(() => new Set())
  const visibleSelectedIds = plan.scenes.filter(item => selectedSceneIds.has(item.id)).map(item => item.id)

  useEffect(() => {
    const field = pendingFocus.current === 'chapter' ? chapterNameRef.current
      : pendingFocus.current === 'sequence' ? sequenceNameRef.current : sceneNameRef.current
    if (!pendingFocus.current || !field) return
    field.focus()
    field.select()
    pendingFocus.current = null
  }, [plan.activeSceneId, renaming])

  useEffect(() => {
    if (open && (plan.scenes.length === 0 || !plan.chapters?.length || !plan.sequences?.length)) ensureScenes()
  }, [open, plan.scenes.length, plan.chapters?.length, plan.sequences?.length, ensureScenes])

  useEffect(() => {
    if (!contextMenu) return
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return
      event.preventDefault()
      event.stopPropagation()
      setContextMenu(null)
    }
    window.addEventListener('keydown', closeOnEscape, true)
    return () => window.removeEventListener('keydown', closeOnEscape, true)
  }, [contextMenu])

  if (!open) return null
  const activeIndex = plan.scenes.findIndex(item => item.id === plan.activeSceneId)
  const scene = plan.scenes[activeIndex]
  if (!scene) return null
  const sequence = plan.sequences?.find(item => item.id === scene.sequenceId)
  const chapter = plan.chapters?.find(item => item.id === sequence?.chapterId)
  const sequenceScenes = plan.scenes.filter(item => item.sequenceId === sequence?.id)
  const sequenceSceneIndex = sequenceScenes.findIndex(item => item.id === scene.id)
  const previousScene = plan.scenes[activeIndex - 1]
  const directions = activeSceneDirections(plan, performers)
  const targetChanges = previousScene ? fixtures.flatMap(fixture => {
    const previous = previousScene.fixtures.find(item => item.id === fixture.id)
    if (!previous || Math.hypot(previous.target[0] - fixture.target[0], previous.target[2] - fixture.target[2]) < .12) return []
    return [{ fixture, from: previous.target }]
  }) : []
  const selectedPerformer = selection.kind === 'performer'
    ? performers.find(item => item.id === selection.id) : undefined
  const selectedFixture = selection.kind === 'fixture'
    ? fixtures.find(item => item.id === selection.id) : undefined
  const selectedSetPiece = selection.kind === 'setpiece'
    ? setPieces.find(item => item.id === selection.id) : undefined
  const selectedName = selectedPerformer?.name ?? selectedFixture?.name ?? selectedSetPiece?.name
  const selectedTab = selectedPerformer ? 'performers' : selectedFixture ? 'fixtures' : 'props'
  const selectedPath = directions.find(item => item.performerId === selectedPerformer?.id)
  const stageIsEmpty = performers.length === 0 && fixtures.length === 0 && setPieces.length === 0

  const quickAdd = (kind: 'performer' | 'fixture' | 'setpiece') => {
    const id = kind === 'performer' ? addPerformer()
      : kind === 'fixture' ? addFixture('Fresnel8') : addPrimitiveSetPiece('box')
    if (!id) return
    if (kind === 'fixture') setShowFixtures(true)
    if (kind === 'setpiece') setShowSetPieces(true)
    updateSettings({ uiTab: kind === 'performer' ? 'performers' : kind === 'fixture' ? 'fixtures' : 'props', panelOpen: true })
    setFeedback(kind === 'performer' ? '役者を舞台に置きました。平面図で動かし、編集パネルで名前を付けられます。'
      : kind === 'fixture' ? '照明を追加しました。平面図で設置位置と光の狙いを動かせます。'
        : '箱馬を置きました。平面図で動かし、編集パネルで名前を付けられます。')
  }

  const selectActor = (id: string) => {
    select('performer', id)
    updateSettings({ uiTab: 'performers' })
  }
  const selectFixture = (id: string, handle: 'position' | 'target' = 'position') => {
    select('fixture', id, handle)
    updateSettings({ uiTab: 'fixtures' })
  }
  const selectSetPiece = (id: string) => {
    select('setpiece', id)
    updateSettings({ uiTab: 'props' })
  }
  const beginDrag = (event: PointerEvent<SVGElement>, kind: DragStart['kind'], id: string, from: StagePoint) => {
    event.preventDefault()
    event.stopPropagation()
    dragStart.current = { kind, id, sceneId: scene.id, from }
    svgRef.current?.setPointerCapture(event.pointerId)
    if (kind === 'performer') selectActor(id)
    else if (kind === 'target' || kind === 'fixture') selectFixture(id, kind === 'target' ? 'target' : 'position')
    else selectSetPiece(id)
  }
  const moveDrag = (event: PointerEvent<SVGSVGElement>) => {
    const start = dragStart.current
    if (!start || start.sceneId !== scene.id) return
    const [x, z] = mapPoint(event, start.kind === 'fixture')
    if (start.kind === 'performer') {
      const actor = useStore.getState().performers.find(item => item.id === start.id)
      if (actor) updatePerformer(actor.id, { position: [x, actor.position[1], z] })
    } else if (start.kind === 'target') {
      const fixture = useStore.getState().fixtures.find(item => item.id === start.id)
      if (fixture) updateFixture(fixture.id, {
        target: [clamp(x, -7.8, 7.8), fixture.target[1], z],
      })
    } else if (start.kind === 'fixture') {
      const fixture = useStore.getState().fixtures.find(item => item.id === start.id)
      if (fixture) updateFixture(fixture.id, {
        position: [clamp(x, -7, 7), fixture.position[1], clamp(z, -7.5, 24)],
      })
    } else {
      const piece = useStore.getState().setPieces.find(item => item.id === start.id)
      if (piece) updateSetPiece(piece.id, {
        position: [clamp(x, -7, 7), piece.position[1], clamp(z, -7.5, 2)],
      })
    }
  }
  const endDrag = (event: PointerEvent<SVGSVGElement>) => {
    const start = dragStart.current
    dragStart.current = null
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId)
    if (!start) return
    const point = start.kind === 'target'
      ? useStore.getState().fixtures.find(fixture => fixture.id === start.id)?.target
      : start.kind === 'fixture'
        ? useStore.getState().fixtures.find(fixture => fixture.id === start.id)?.position
        : start.kind === 'performer'
          ? useStore.getState().performers.find(actor => actor.id === start.id)?.position
          : useStore.getState().setPieces.find(piece => piece.id === start.id)?.position
    if (point && Math.hypot(point[0] - start.from[0], point[2] - start.from[1]) > 0.01) {
      setLastMove(start)
      setFeedback(start.kind === 'target' ? '光の狙いを変更しました' : start.kind === 'fixture'
        ? '器具の位置を変更しました' : start.kind === 'performer'
          ? '役者の立ち位置を変更しました' : '舞台セットの位置を変更しました')
    }
  }
  const undoMove = () => {
    if (!lastMove) return
    if (lastMove.kind === 'performer') {
      if (plan.activeSceneId !== lastMove.sceneId) selectScene(lastMove.sceneId)
      const actor = useStore.getState().performers.find(item => item.id === lastMove.id)
      if (actor) updatePerformer(actor.id, {
        position: [lastMove.from[0], actor.position[1], lastMove.from[1]],
      })
    } else if (lastMove.kind === 'fixture' || lastMove.kind === 'target') {
      const fixture = useStore.getState().fixtures.find(item => item.id === lastMove.id)
      if (fixture) updateFixture(fixture.id, lastMove.kind === 'target'
        ? { target: [lastMove.from[0], fixture.target[1], lastMove.from[1]] }
        : { position: [lastMove.from[0], fixture.position[1], lastMove.from[1]] })
    } else if (lastMove.kind === 'setpiece') {
      const piece = useStore.getState().setPieces.find(item => item.id === lastMove.id)
      if (piece) updateSetPiece(piece.id, {
        position: [lastMove.from[0], piece.position[1], lastMove.from[1]],
      })
    }
    setLastMove(null)
    setFeedback('移動を元の位置に戻しました')
  }
  const createSceneAt = (chapterId: string, beforeSceneId: string | null) => {
    const id = addSceneAt(chapterId, beforeSceneId)
    if (!id) { setFeedback('シーンを追加できませんでした'); return }
    setCollapsedChapters(previous => {
      const next = new Set(previous); next.delete(chapterId); return next
    })
    setLastMove(null)
    setFeedback('シーンを追加しました。名前の変更は右の ⋯ からできます。')
  }
  const createChapterAfter = (chapterId: string) => {
    const id = addChapterAfter(chapterId)
    if (!id) { setFeedback('章を追加できませんでした'); return }
    setCollapsedChapters(previous => {
      const next = new Set(previous); next.delete(id); return next
    })
    setLastMove(null)
    setFeedback('章を追加しました。直前の章の最後の舞台を引き継いでいます。')
  }
  const createNext = (kind: 'scene' | 'sequence' | 'chapter') => {
    if (kind === 'scene') addScene()
    else if (kind === 'sequence') addSequence()
    else addChapter()
    pendingFocus.current = kind
    setLastMove(null)
    setFeedback(kind === 'scene' ? '次のシーンを追加しました。名前を入力してください。舞台の配置は引き継いでいます。'
      : kind === 'sequence' ? 'この章にシーケンスを追加しました。名前を入力してください。'
        : '次の章を追加しました。章名を入力してください。')
  }
  const navigateScene = (id: string, label: string) => {
    setRenaming(null)
    selectScene(id)
    setLastMove(null)
    setFeedback(`${label}を開きました`)
    onNavigate?.()
  }
  const startRename = (kind: 'chapter' | 'sequence' | 'scene', id: string, title: string) => {
    renameOriginal.current = title
    pendingFocus.current = kind
    setRenaming({ kind, id })
  }
  const cancelRename = () => {
    if (!renaming) return
    if (renaming.kind === 'chapter') updateChapter(renaming.id, renameOriginal.current)
    else if (renaming.kind === 'sequence') updateSequence(renaming.id, renameOriginal.current)
    else updateScene(renaming.id, { title: renameOriginal.current })
    setRenaming(null)
  }
  const openContextMenu = (event: MouseEvent, kind: 'chapter' | 'scene' | 'empty', id: string) => {
    event.preventDefault()
    event.stopPropagation()
    const rect = event.currentTarget.getBoundingClientRect()
    const x = event.clientX || rect.right
    const y = event.clientY || rect.bottom
    setContextMenu({ kind, id, x: Math.max(8, Math.min(x, window.innerWidth - 230)),
      y: Math.max(8, Math.min(y, window.innerHeight - 350)) })
  }
  const reportMove = (result: MoveSceneResult, kind: OutlineKind = 'scene') => {
    if (result === 'moved') setFeedback(kind === 'chapter' ? '章の順番を変更しました' : 'シーンの順番を変更しました')
    else if (result === 'invalid') setFeedback('移動できませんでした')
  }
  const gapId = (chapterId: string, beforeSceneId: string | null) => `${chapterId}:${beforeSceneId ?? 'end'}`
  const sceneInsertSlot = (chapterId: string, beforeSceneId: string | null) => {
    const id = gapId(chapterId, beforeSceneId)
    return <div className={'plan-scene-slot' + (dropTarget?.position === 'gap' && dropTarget.id === id ? ' drop-active' : '')}
      data-plan-drop="gap" data-chapter-id={chapterId} data-before-scene-id={beforeSceneId ?? ''}>
      <span className="plan-scene-slot-line" aria-hidden="true" />
      <button type="button" disabled={plan.scenes.length >= PLAN_LIMITS.scenes}
        aria-label="ここにシーンを追加" title="ここにシーンを追加"
        onClick={() => createSceneAt(chapterId, beforeSceneId)}>＋ <span>ここにシーンを追加</span></button>
    </div>
  }
  const startOutlineDrag = (event: PointerEvent<HTMLElement>, kind: OutlineKind, id: string) => {
    if (selectionMode || event.button !== 0 || renaming?.id === id) return
    const target = event.target as Element
    if (target.closest('input, textarea, .plan-outline-select, .plan-outline-node-edit')) return
    if (event.pointerType === 'touch' && !target.closest('.plan-scene-grip')) return
    event.currentTarget.setPointerCapture(event.pointerId)
    outlinePointer.current = { kind, id, pointerId: event.pointerId, startX: event.clientX,
      startY: event.clientY, active: false, target: null }
  }
  const updateOutlineDrag = (event: PointerEvent<HTMLElement>) => {
    const drag = outlinePointer.current
    if (!drag || drag.pointerId !== event.pointerId) return
    if (!drag.active && Math.hypot(event.clientX - drag.startX, event.clientY - drag.startY) < 5) return
    if (!drag.active) {
      drag.active = true
      setDraggingOutline({ kind: drag.kind, id: drag.id })
    }
    const outline = outlineRef.current
    if (outline) {
      const rect = outline.getBoundingClientRect()
      if (event.clientY < rect.top + 28) outline.scrollTop -= 12
      else if (event.clientY > rect.bottom - 28) outline.scrollTop += 12
    }
    const hit = document.elementFromPoint(event.clientX, event.clientY)?.closest<HTMLElement>('[data-plan-drop]')
    let target: OutlineTarget | null = null
    if (hit && outline?.contains(hit)) {
      const kind = hit.dataset.planDrop
      if (drag.kind === 'scene' && kind === 'gap') {
        const chapterId = hit.dataset.chapterId
        if (chapterId) target = { id: gapId(chapterId, hit.dataset.beforeSceneId || null), position: 'gap',
          chapterId, beforeSceneId: hit.dataset.beforeSceneId || null }
      } else if (drag.kind === 'scene' && kind === 'scene' && hit.dataset.sceneId !== drag.id) {
        const rect = hit.getBoundingClientRect()
        target = { id: hit.dataset.sceneId!, position: event.clientY < rect.top + rect.height / 2 ? 'before' : 'after' }
      } else if (drag.kind === 'scene' && kind === 'chapter') {
        target = { id: hit.dataset.chapterId!, position: 'chapter' }
      } else if (drag.kind === 'chapter') {
        const chapterNode = hit.closest<HTMLElement>('[data-plan-chapter-id]')
        const chapterId = chapterNode?.dataset.planChapterId
        if (chapterId && chapterId !== drag.id) {
          const header = chapterNode.querySelector<HTMLElement>('[data-plan-drop="chapter"]')
          const rect = (header ?? chapterNode).getBoundingClientRect()
          target = { id: chapterId, position: event.clientY < rect.top + rect.height / 2 ? 'before' : 'after' }
        }
      }
    }
    drag.target = target
    setDropTarget(target)
  }
  const endOutlineDrag = (event: PointerEvent<HTMLElement>) => {
    const drag = outlinePointer.current
    if (!drag || drag.pointerId !== event.pointerId) return
    outlinePointer.current = null
    setDraggingOutline(null)
    setDropTarget(null)
    if (drag.active) {
      const key = `${drag.kind}:${drag.id}`
      suppressOutlineClick.current = key
      window.setTimeout(() => { if (suppressOutlineClick.current === key) suppressOutlineClick.current = null }, 0)
    }
    if (event.type === 'pointercancel' || !drag.active || !drag.target) return
    const target = drag.target
    if (drag.kind === 'chapter' && (target.position === 'before' || target.position === 'after'))
      reportMove(moveChapter(drag.id, target.id, target.position), 'chapter')
    else if (drag.kind === 'scene' && target.position === 'gap')
      reportMove(target.beforeSceneId ? moveScene(drag.id, target.beforeSceneId, 'before')
        : moveSceneToChapter(drag.id, target.chapterId!))
    else if (drag.kind === 'scene' && target.position === 'chapter') reportMove(moveSceneToChapter(drag.id, target.id))
    else if (drag.kind === 'scene' && (target.position === 'before' || target.position === 'after'))
      reportMove(moveScene(drag.id, target.id, target.position))
  }
  const toggleSceneSelection = (id: string, range: boolean) => {
    if (range && selectionAnchorId) {
      const start = plan.scenes.findIndex(item => item.id === selectionAnchorId)
      const end = plan.scenes.findIndex(item => item.id === id)
      if (start >= 0 && end >= 0) {
        const ids = plan.scenes.slice(Math.min(start, end), Math.max(start, end) + 1).map(item => item.id)
        setSelectedSceneIds(new Set(ids))
        return
      }
    }
    setSelectedSceneIds(previous => {
      const next = new Set(previous)
      if (next.has(id)) next.delete(id); else next.add(id)
      return next
    })
    setSelectionAnchorId(id)
  }
  const handleSceneClick = (event: MouseEvent<HTMLButtonElement>, id: string) => {
    if (suppressOutlineClick.current === `scene:${id}`) {
      event.preventDefault()
      suppressOutlineClick.current = null
      return
    }
    if (selectionMode || event.shiftKey || event.metaKey || event.ctrlKey) {
      setSelectionMode(true)
      toggleSceneSelection(id, event.shiftKey)
      return
    }
    setSelectionAnchorId(id)
    navigateScene(id, sceneDisplayTitle(plan, id))
  }
  const toggleChapterSelection = (ids: string[]) => {
    if (!ids.length) return
    setSelectedSceneIds(previous => {
      const next = new Set(previous)
      if (ids.every(id => next.has(id))) ids.forEach(id => next.delete(id))
      else ids.forEach(id => next.add(id))
      return next
    })
    setSelectionAnchorId(ids[0])
  }
  const deleteSelectedScenes = () => {
    if (!visibleSelectedIds.length || !window.confirm(`選択した${visibleSelectedIds.length}シーンを削除しますか？`)) return
    const count = removeScenes(visibleSelectedIds)
    setSelectedSceneIds(new Set())
    setSelectionAnchorId(null)
    setFeedback(`${count}シーンを削除しました`)
  }
  const deleteChapter = (id: string) => {
    const item = plan.chapters?.find(chapter => chapter.id === id)
    if (!item || plan.chapters!.length <= 1 || !window.confirm(`「${item.title || '無題の章'}」と中のシーンを削除しますか？`)) return
    if (removeChapter(id)) {
      setSelectedSceneIds(new Set())
      setSelectionAnchorId(null)
      setFeedback('章と中のシーンを削除しました')
    }
  }
  const moveByOne = (id: string, direction: -1 | 1) => {
    const currentPlan = useStore.getState().productionPlan
    const moving = currentPlan.scenes.find(item => item.id === id)
    const currentChapterId = currentPlan.sequences?.find(item => item.id === moving?.sequenceId)?.chapterId
    const groupIds = new Set(currentPlan.sequences?.filter(item => item.chapterId === currentChapterId).map(item => item.id) ?? [])
    const entries = currentPlan.scenes.filter(item => groupIds.has(item.sequenceId ?? ''))
    const index = entries.findIndex(item => item.id === id)
    const target = entries[index + direction]
    if (target) reportMove(moveScene(id, target.id, direction < 0 ? 'before' : 'after'))
  }
  const moveChapterByOne = (id: string, direction: -1 | 1) => {
    const chapters = useStore.getState().productionPlan.chapters ?? []
    const index = chapters.findIndex(item => item.id === id)
    const target = chapters[index + direction]
    if (target) reportMove(moveChapter(id, target.id, direction < 0 ? 'before' : 'after'), 'chapter')
  }
  const deleteScene = (id: string) => {
    if (plan.scenes.length <= 1 || !window.confirm('このシーンを削除しますか？')) return
    removeScene(id)
    setLastMove(null)
    setFeedback('シーンを削除しました')
  }
  const menuScene = contextMenu?.kind === 'scene' ? plan.scenes.find(item => item.id === contextMenu.id) : undefined
  const menuSceneChapterId = plan.sequences?.find(item => item.id === menuScene?.sequenceId)?.chapterId
  const menuChapterSequenceIds = new Set(plan.sequences?.filter(item => item.chapterId === menuSceneChapterId).map(item => item.id) ?? [])
  const menuChapterScenes = plan.scenes.filter(item => menuChapterSequenceIds.has(item.sequenceId ?? ''))
  const menuSceneIndex = menuChapterScenes.findIndex(item => item.id === menuScene?.id)
  const lastChapterId = plan.chapters?.slice(-1)[0]?.id
  const saveDiagram = async () => {
    if (!svgRef.current) return
    const svg = new XMLSerializer().serializeToString(svgRef.current)
    const name = (persistent ? sceneDisplayTitle(plan, scene.id) : scene.title.trim() || '演出プラン')
      .replace(/[\\/:*?"<>|]/g, '_')
    const file = new File([svg], name + (persistent ? '' : '-シーン' + (activeIndex + 1)) + '.svg', { type: 'image/svg+xml' })
    if (navigator.canShare?.({ files: [file] })) {
      try {
        await navigator.share({ files: [file], title: persistent ? sceneDisplayTitle(plan, scene.id) : scene.title || '演出プラン' })
        setFeedback('平面図を共有しました')
        return
      } catch (error) {
        if (error instanceof DOMException && error.name === 'AbortError') return
      }
    }
    const url = URL.createObjectURL(file)
    const link = document.createElement('a')
    link.href = url
    link.download = file.name
    link.click()
    setFeedback('平面図をSVGファイルとして保存しました')
    window.setTimeout(() => URL.revokeObjectURL(url), 1000)
  }

  return <section id="plan-board" className={'plan-board' + (contextMenu ? ' context-open' : '') +
    (sceneEditorOpen ? ' scene-editor-open' : '') + (audienceEditorOpen ? ' audience-editor-open' : '')} aria-label="平面図・演出プラン">
    <div className="plan-board-head">
      <strong>{plan.projectTitle?.trim() || '名称未設定のプロジェクト'}</strong>
      <span>演出プラン</span>
      {!persistent && <button className="plan-play-button" onClick={onPlay}>▶ 通しで見る</button>}
      {!persistent && <button className="plan-board-close" onClick={onClose}>3D 舞台に戻る</button>}
    </div>
    <div className="plan-board-body">
      <aside ref={outlineRef} className={'plan-outline' + (selectionMode ? ' selection-mode' : '')} aria-label="プロジェクトの構成">
        {persistent ? <div className="plan-outline-project plan-outline-heading">
          <div className="plan-outline-heading-row"><strong>公演の流れ</strong>
            <button type="button" className="plan-selection-toggle" aria-pressed={selectionMode}
              onClick={() => {
                setSelectionMode(value => !value)
                setSelectedSceneIds(new Set())
                setSelectionAnchorId(null)
              }}>{selectionMode ? '完了' : '選択'}</button>
            <button type="button" className="plan-pane-close" aria-label="シーン一覧を閉じる"
              title="シーン一覧を閉じる" onClick={onCloseOutline}>×</button></div>
          {selectionMode ? <small>シーンを選択してまとめて削除。Shiftで範囲選択</small>
            : <><small>章を開き、シーンを選ぶと舞台が切り替わります</small>
              <small>行をドラッグして並べ替え · 行間の＋で追加 · ⋯で編集</small></>}
        </div> : <div className="plan-outline-project">
          <label>プロジェクト名<input value={plan.projectTitle ?? ''} maxLength={60} placeholder="例：秋公演 A劇場"
            onChange={event => updateProductionPlan({ projectTitle: event.target.value })} /></label>
        </div>}
        {persistent && selectionMode && <div className="plan-outline-selection-bar">
          <strong>{visibleSelectedIds.length} / {plan.scenes.length} シーン選択中</strong>
          <button type="button" disabled={visibleSelectedIds.length === plan.scenes.length}
            onClick={() => setSelectedSceneIds(new Set(plan.scenes.map(item => item.id)))}>すべて選択</button>
          <button type="button" disabled={!visibleSelectedIds.length} onClick={deleteSelectedScenes}>削除</button>
          <button type="button" disabled={!visibleSelectedIds.length} onClick={() => setSelectedSceneIds(new Set())}>解除</button>
        </div>}
        <nav className="plan-outline-tree" aria-label={persistent ? '章とシーン' : '章・シーケンス・シーン'}
          onContextMenu={persistent ? event => openContextMenu(event, 'empty', '') : undefined}>
          {plan.chapters?.map((item, chapterIndex) => {
            const groups = plan.sequences?.filter(group => group.chapterId === item.id) ?? []
            const groupIds = new Set(groups.map(group => group.id))
            const scenesInChapter = plan.scenes.filter(entry => groupIds.has(entry.sequenceId ?? ''))
            return <div className="plan-outline-chapter" key={item.id} data-plan-chapter-id={item.id}>
              {persistent ? <div className={'plan-outline-node chapter' + (chapter?.id === item.id ? ' in-path' : '') +
                (draggingOutline?.kind === 'chapter' && draggingOutline.id === item.id ? ' dragging' : '') +
                (dropTarget?.id === item.id ? ` drop-${dropTarget.position}` : '')}
                data-plan-drop="chapter" data-chapter-id={item.id}
                onContextMenu={event => openContextMenu(event, 'chapter', item.id)}>
                {selectionMode && <button type="button" className="plan-outline-select" disabled={!scenesInChapter.length}
                  aria-pressed={scenesInChapter.length > 0 && scenesInChapter.every(entry => selectedSceneIds.has(entry.id))}
                  aria-label={`${item.title || '章'}のシーンをまとめて選択`}
                  onClick={() => toggleChapterSelection(scenesInChapter.map(entry => entry.id))}>
                  {scenesInChapter.length > 0 && scenesInChapter.every(entry => selectedSceneIds.has(entry.id)) ? '✓' : ''}</button>}
                <span className="plan-scene-grip" role="button" tabIndex={0}
                  aria-label={`${item.title || '章'}を並べ替え。上下キーでも移動できます`} title="ドラッグまたは上下キーで章ごと並べ替え"
                  onKeyDown={event => {
                    if (event.key === 'ArrowUp' || event.key === 'ArrowDown') {
                      event.preventDefault(); moveChapterByOne(item.id, event.key === 'ArrowUp' ? -1 : 1)
                    }
                  }}
                  onPointerDown={event => startOutlineDrag(event, 'chapter', item.id)}
                  onPointerMove={updateOutlineDrag} onPointerUp={endOutlineDrag} onPointerCancel={endOutlineDrag}>⠿</span>
                {renaming?.kind === 'chapter' && renaming.id === item.id
                  ? <input ref={chapterNameRef} aria-label="章名" value={item.title} maxLength={60} placeholder="章名"
                    onChange={event => updateChapter(item.id, event.target.value)}
                    onBlur={() => setRenaming(null)}
                    onKeyDown={event => {
                      if (event.key === 'Enter') setRenaming(null)
                      else if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); cancelRename() }
                    }} />
                  : <><button className="plan-outline-node-main" aria-expanded={!collapsedChapters.has(item.id)}
                    onKeyDown={event => { if (event.key === 'F2') { event.preventDefault(); startRename('chapter', item.id, item.title) } }}
                    onPointerDown={event => startOutlineDrag(event, 'chapter', item.id)}
                    onPointerMove={updateOutlineDrag} onPointerUp={endOutlineDrag} onPointerCancel={endOutlineDrag}
                    onClick={event => {
                      if (suppressOutlineClick.current === `chapter:${item.id}`) {
                        event.preventDefault()
                        suppressOutlineClick.current = null
                        return
                      }
                      setCollapsedChapters(previous => {
                        const next = new Set(previous)
                        if (next.has(item.id)) next.delete(item.id); else next.add(item.id)
                        return next
                      })
                    }}><small>{collapsedChapters.has(item.id) ? '▶' : '▼'} 章</small><strong>{item.title || '無題の章'}</strong></button>
                    <button className="plan-outline-node-edit" aria-label={`${item.title || '章'}の操作メニュー`}
                      title="章の操作" onClick={event => openContextMenu(event, 'chapter', item.id)}>⋯</button></>}
              </div> : <button className={'plan-outline-chapter-button' + (chapter?.id === item.id ? ' active' : '')}
                onClick={() => {
                  const first = plan.scenes.find(entry => groups.some(group => group.id === entry.sequenceId))
                  if (first) navigateScene(first.id, item.title || '章')
                }}>{chapterIndex + 1}. {item.title || '無題の章'}</button>}
              {!persistent && chapter?.id === item.id && <label className="plan-outline-rename">章名
                <input ref={chapterNameRef} value={item.title} maxLength={60} placeholder="章名"
                  onChange={event => updateChapter(item.id, event.target.value)} />
              </label>}
              {persistent && !collapsedChapters.has(item.id) && sceneInsertSlot(item.id, scenesInChapter[0]?.id ?? null)}
              {persistent && !collapsedChapters.has(item.id) && scenesInChapter.map((entry, entryIndex) =>
                <Fragment key={entry.id}><div
                  className={'plan-outline-node scene' + (entry.id === scene.id ? ' active' : '') +
                    (selectedSceneIds.has(entry.id) ? ' multi-selected' : '') +
                    (draggingOutline?.kind === 'scene' && draggingOutline.id === entry.id ? ' dragging' : '') +
                    (dropTarget?.id === entry.id ? ` drop-${dropTarget.position}` : '')}
                  data-plan-drop="scene" data-scene-id={entry.id}
                  onContextMenu={event => openContextMenu(event, 'scene', entry.id)}>
                  {selectionMode && <button type="button" className="plan-outline-select"
                    aria-pressed={selectedSceneIds.has(entry.id)} aria-label={`${sceneDisplayTitle(plan, entry.id)}を選択`}
                    onClick={event => { event.stopPropagation(); toggleSceneSelection(entry.id, event.shiftKey) }}>
                    {selectedSceneIds.has(entry.id) ? '✓' : ''}</button>}
                  <span className="plan-scene-grip" role="button" tabIndex={0}
                    aria-label={`${sceneDisplayTitle(plan, entry.id)}を並べ替え。上下キーでも移動できます`} title="ドラッグまたは上下キーでシーンを並べ替え"
                    onKeyDown={event => {
                      if (event.key === 'ArrowUp' || event.key === 'ArrowDown') {
                        event.preventDefault(); moveByOne(entry.id, event.key === 'ArrowUp' ? -1 : 1)
                      }
                    }}
                    onPointerDown={event => startOutlineDrag(event, 'scene', entry.id)}
                    onPointerMove={updateOutlineDrag} onPointerUp={endOutlineDrag} onPointerCancel={endOutlineDrag}>⠿</span>
                  {renaming?.kind === 'scene' && renaming.id === entry.id
                    ? <input ref={sceneNameRef} aria-label="シーン名" value={entry.title} maxLength={60} placeholder="シーン名"
                      onChange={event => updateScene(entry.id, { title: event.target.value })}
                      onBlur={() => setRenaming(null)}
                      onKeyDown={event => {
                        if (event.key === 'Enter') setRenaming(null)
                        else if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); cancelRename() }
                      }} />
                    : <><button className="plan-outline-node-main" aria-current={entry.id === scene.id ? 'step' : undefined}
                      onKeyDown={event => { if (event.key === 'F2') { event.preventDefault(); startRename('scene', entry.id, entry.title) } }}
                      onPointerDown={event => startOutlineDrag(event, 'scene', entry.id)}
                      onPointerMove={updateOutlineDrag} onPointerUp={endOutlineDrag} onPointerCancel={endOutlineDrag}
                      onClick={event => handleSceneClick(event, entry.id)}>
                      <strong>{sceneDisplayTitle(plan, entry.id)}</strong>
                      {(entry.trigger ?? '').trim() && <small className="plan-scene-cue-summary"
                        aria-label={entry.triggerType && entry.triggerType !== 'other'
                          ? `${SCENE_TRIGGER_LABELS[entry.triggerType]}: ${entry.trigger}` : entry.trigger}>
                        <CueIcon type={entry.triggerType} /><span>{entry.trigger}</span></small>}</button>
                      <button className="plan-outline-node-edit" aria-label={`${sceneDisplayTitle(plan, entry.id)}の操作メニュー`}
                        title="シーンの操作" onClick={event => openContextMenu(event, 'scene', entry.id)}>⋯</button></>}
                </div>
                  {sceneInsertSlot(item.id, scenesInChapter[entryIndex + 1]?.id ?? null)}</Fragment>)}
              {!persistent && groups.map((group, groupIndex) => {
                const entries = plan.scenes.filter(entry => entry.sequenceId === group.id)
                return <div className="plan-outline-sequence" key={group.id}>
                  <button className={'plan-outline-sequence-button' + (sequence?.id === group.id ? ' active' : '')}
                    onClick={() => { if (entries[0]) navigateScene(entries[0].id, group.title || 'シーケンス') }}>
                    {groupIndex + 1}. {group.title || '無題のシーケンス'}</button>
                  {sequence?.id === group.id && <label className="plan-outline-rename">シーケンス名
                    <input ref={sequenceNameRef} value={group.title} maxLength={60} placeholder="シーケンス名"
                      onChange={event => updateSequence(group.id, event.target.value)} />
                  </label>}
                  {entries.map((entry, entryIndex) => <button key={entry.id}
                    className={'plan-outline-scene-button' + (entry.id === scene.id ? ' active' : '')}
                    aria-current={entry.id === scene.id ? 'step' : undefined}
                    onClick={() => navigateScene(entry.id, entry.title || 'シーン')}>
                    {entryIndex + 1}. {entry.title || '無題のシーン'}
                  </button>)}
                </div>
              })}
            </div>
          })}
        </nav>
        <div className="plan-outline-actions">
          {!persistent && <button className="plan-add-scene" onClick={() => createNext('scene')} disabled={plan.scenes.length >= PLAN_LIMITS.scenes}>
            ＋ 次のシーン<small>現在の舞台を複製</small></button>}
          {!persistent && <button onClick={() => createNext('sequence')} disabled={plan.scenes.length >= PLAN_LIMITS.scenes}>
            ＋ 次のシーケンス<small>この章に追加</small></button>}
          <button className={persistent ? 'plan-add-chapter' : undefined}
            onClick={() => persistent && lastChapterId ? createChapterAfter(lastChapterId) : createNext('chapter')}
            disabled={plan.scenes.length >= PLAN_LIMITS.scenes || (plan.chapters?.length ?? 0) >= PLAN_LIMITS.chapters}>
            {persistent ? '＋ 章を追加' : '＋ 次の章'}<small>{persistent ? '最後の章の舞台を引き継ぐ' : '章を追加'}</small></button>
          {persistent && plan.scenes.length >= PLAN_LIMITS.scenes &&
            <small className="plan-outline-limit">シーンは最大{PLAN_LIMITS.scenes}件です。追加するには不要なシーンを削除してください。</small>}
          {persistent && (plan.chapters?.length ?? 0) >= PLAN_LIMITS.chapters &&
            <small className="plan-outline-limit">章は最大{PLAN_LIMITS.chapters}件です。</small>}
          {!persistent && <small>新しいシーンには現在の舞台の配置を引き継ぎます</small>}
        </div>
      </aside>
      {feedback && <div className="plan-action-feedback" role="status" aria-live="polite">
        <span aria-hidden="true">✓</span><span>{feedback}</span>
        <button aria-label="通知を閉じる" onClick={() => setFeedback('')}>×</button>
      </div>}
      {persistent && contextMenu && <>
        <div className="plan-context-backdrop" onPointerDown={() => setContextMenu(null)} />
        <div className="plan-context-menu" role="menu" aria-label="構成の操作"
          style={{ left: contextMenu.x, top: contextMenu.y }}>
          {contextMenu.kind === 'scene' && menuScene ? <>
            <strong>{sceneDisplayTitle(plan, menuScene.id)}</strong>
            <button role="menuitem" autoFocus onClick={() => { setContextMenu(null); startRename('scene', menuScene.id, menuScene.title) }}>名前を変更</button>
            <button role="menuitem" onClick={() => {
              setContextMenu(null)
              if (menuScene.id !== scene.id) selectScene(menuScene.id)
              onOpenSceneEditor?.()
            }}>きっかけ・メモを編集</button>
            <button role="menuitem" disabled={menuSceneIndex <= 0}
              onClick={() => { setContextMenu(null); moveByOne(menuScene.id, -1) }}>一つ上へ移動</button>
            <button role="menuitem" disabled={menuSceneIndex >= menuChapterScenes.length - 1}
              onClick={() => { setContextMenu(null); moveByOne(menuScene.id, 1) }}>一つ下へ移動</button>
            {plan.chapters && plan.chapters.length > 1 && <>
              <span className="plan-context-label">別の章へ移動</span>
              {plan.chapters.filter(item => item.id !== menuSceneChapterId).map(item =>
                <button role="menuitem" key={item.id} onClick={() => {
                  setContextMenu(null)
                  reportMove(moveSceneToChapter(menuScene.id, item.id))
                }}>{item.title || '無題の章'}へ</button>)}
            </>}
            <button role="menuitem" className="danger" disabled={plan.scenes.length <= 1}
              onClick={() => { setContextMenu(null); deleteScene(menuScene.id) }}>このシーンを削除</button>
          </> : contextMenu.kind === 'chapter' ? <>
            <strong>{plan.chapters?.find(item => item.id === contextMenu.id)?.title || '章'}</strong>
            <button role="menuitem" autoFocus onClick={() => {
              const item = plan.chapters?.find(item => item.id === contextMenu.id)
              setContextMenu(null)
              if (item) startRename('chapter', item.id, item.title)
            }}>章名を変更</button>
            <button role="menuitem" onClick={() => { setContextMenu(null); createChapterAfter(contextMenu.id) }}>この後に章を追加</button>
            <button role="menuitem" disabled={(plan.chapters?.findIndex(item => item.id === contextMenu.id) ?? 0) <= 0}
              onClick={() => {
                const index = plan.chapters?.findIndex(item => item.id === contextMenu.id) ?? -1
                const target = plan.chapters?.[index - 1]
                setContextMenu(null)
                if (target) reportMove(moveChapter(contextMenu.id, target.id, 'before'), 'chapter')
              }}>章ごと一つ上へ移動</button>
            <button role="menuitem" disabled={(plan.chapters?.findIndex(item => item.id === contextMenu.id) ?? 0) >= (plan.chapters?.length ?? 0) - 1}
              onClick={() => {
                const index = plan.chapters?.findIndex(item => item.id === contextMenu.id) ?? -1
                const target = plan.chapters?.[index + 1]
                setContextMenu(null)
                if (target) reportMove(moveChapter(contextMenu.id, target.id, 'after'), 'chapter')
              }}>章ごと一つ下へ移動</button>
            <button role="menuitem" className="danger" disabled={(plan.chapters?.length ?? 0) <= 1}
              onClick={() => { setContextMenu(null); deleteChapter(contextMenu.id) }}>章と中のシーンを削除</button>
          </> : <>
            <strong>公演の流れ</strong>
            <button role="menuitem" autoFocus onClick={() => {
              setContextMenu(null)
              if (lastChapterId) createChapterAfter(lastChapterId)
            }}>章を追加</button>
          </>}
        </div>
      </>}
      {persistent && sceneEditorOpen && <div className="plan-scene-editor-backdrop"
        onPointerDown={event => { if (event.target === event.currentTarget) onCloseSceneEditor?.() }}>
        <section className="plan-scene-editor" role="dialog" aria-modal="true" aria-labelledby="plan-scene-editor-heading"
          onKeyDown={event => {
            if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); onCloseSceneEditor?.() }
          }}>
          <header><div><small>シーンの設定</small><h2 id="plan-scene-editor-heading">{sceneDisplayTitle(plan, scene.id)}</h2></div>
            <button type="button" aria-label="シーンの設定を閉じる" onClick={onCloseSceneEditor}>×</button></header>
          <div className="plan-scene-editor-body">
            <div className="plan-scene-editor-cue"><span>切り替えのきっかけ</span>
              <div>
                <select autoFocus aria-label="きっかけの種類"
                  value={scene.triggerType ?? (scene.trigger ? 'other' : '')}
                  onChange={event => {
                    const type = event.target.value as SceneTriggerType | ''
                    updateScene(scene.id, type ? { triggerType: type } : { triggerType: undefined, trigger: '' })
                  }}>
                  <option value="">なし</option>
                  {Object.entries(SCENE_TRIGGER_LABELS).map(([value, label]) =>
                    <option key={value} value={value}>{label}</option>)}
                </select>
                {(scene.triggerType || scene.trigger) && <input aria-label="きっかけの内容" value={scene.trigger}
                  maxLength={160} placeholder={triggerPlaceholders[scene.triggerType ?? 'other']}
                  onChange={event => updateScene(scene.id, { trigger: event.target.value })} />}
              </div>
            </div>
            <label>演出メモ<textarea value={scene.note} maxLength={1000} rows={5}
              placeholder="役者の動きや照明の意図、確認事項など"
              onChange={event => updateScene(scene.id, { note: event.target.value })} /></label>
            <small>変更は自動保存されます</small>
          </div>
          <footer><button type="button" onClick={onCloseSceneEditor}>閉じる</button></footer>
        </section>
      </div>}
    <div className="plan-board-content">
      <div className="plan-map-pane">
        <div className="plan-map-caption"><strong>平面図</strong><span>{stageIsEmpty
          ? 'まず舞台に置くものを選んでください'
          : selectedPerformer ? `${selectedPerformer.name}を選択中 · 丸をドラッグして立ち位置を変更`
            : selectedFixture ? `${selectedFixture.name}を選択中 · 番号をドラッグして設置位置、色の輪で光の狙いを変更`
              : selectedSetPiece ? `${selectedSetPiece.name}を選択中 · 四角をドラッグして位置を変更`
                : '丸や四角をドラッグして移動。選ぶと編集パネルで詳しく変更できます'}</span>
          {persistent && selectedName && <button className="plan-inspect-button" onClick={() =>
            updateSettings({ uiTab: selectedTab, panelOpen: true })}>名前・設定を編集</button>}
          {persistent && <button type="button" className="plan-pane-close plan-map-close"
            aria-label="平面図を閉じる" title="平面図を閉じる" onClick={onCloseMap}>×</button>}
        </div>
        {persistent && <div className="plan-map-actionbar" role="group" aria-label="今のシーンの舞台に追加">
          <strong>舞台に置く</strong>
          <button type="button" onClick={() => quickAdd('performer')}>＋ 役者</button>
          <button type="button" onClick={() => quickAdd('fixture')}>＋ 照明</button>
          <button type="button" onClick={() => quickAdd('setpiece')}>＋ 箱馬</button>
          <button type="button" className="plan-audience-button" onClick={() => setAudienceEditorOpen(true)}>
            客席を配置{plan.audienceBlocks?.length ? `（${plan.audienceBlocks.reduce((count, block) => count + block.rows * block.seatsPerRow, 0)}席）` : ''}
          </button>
          {lastMove && <button type="button" className="plan-map-undo" onClick={undoMove}>↶ 移動を戻す</button>}
          <small>追加後、平面図で移動できます</small>
        </div>}
        <div className="plan-map-layerbar" role="group" aria-label="平面図の表示">
          <span>図に表示</span>
          <button type="button" className={showSetPieces ? 'active' : ''} aria-pressed={showSetPieces}
            onClick={() => setShowSetPieces(value => !value)}>舞台セット：{showSetPieces ? '表示中' : '非表示'}</button>
          <button type="button" className={showFixtures ? 'active' : ''} aria-pressed={showFixtures}
            onClick={() => setShowFixtures(value => !value)}>照明：{showFixtures ? '表示中' : '非表示'}</button>
          {persistent && <button type="button" className={showDirections ? 'active' : ''} aria-pressed={showDirections}
            onClick={onToggleDirections}>役者の動き：{showDirections ? '表示中' : '非表示'}</button>}
          <small>図を左右にスワイプ</small>
        </div>
        <div className="plan-map-scroll">
          <svg ref={svgRef} xmlns="http://www.w3.org/2000/svg" viewBox="0 0 960 630"
            aria-label="舞台の平面図。役者の立ち位置と器具の狙う位置を変更できます"
            onPointerMove={moveDrag} onPointerUp={endDrag} onPointerCancel={endDrag}>
            <defs>
              {Object.entries(pathColors).map(([kind, color]) => <marker key={kind}
                id={'plan-arrow-' + kind} markerWidth="10" markerHeight="10"
                refX="8" refY="5" orient="auto" markerUnits="strokeWidth">
                <path d="M 1 1 L 9 5 L 1 9 z" fill={color} />
              </marker>)}
              <marker id="plan-arrow-light" markerWidth="10" markerHeight="10"
                refX="8" refY="5" orient="auto" markerUnits="strokeWidth">
                <path d="M 1 1 L 9 5 L 1 9 z" fill="#5b88a0" />
              </marker>
            </defs>
            <rect width="960" height="630" fill="#f8f4ec" />
            <text x="24" y="35" fill="#2e2925" fontSize="21" fontWeight="700" fontFamily="sans-serif">
              {persistent ? sceneDisplayTitle(plan, scene.id).slice(0, 40)
                : `${sequenceSceneIndex + 1} / ${sequenceScenes.length}　${scene.title.slice(0, 32)}`}
            </text>
            <rect x="8" y="70" width="92" height="480" fill="#e5ddd0" stroke="#8e8273" />
            <rect x="860" y="70" width="92" height="480" fill="#e5ddd0" stroke="#8e8273" />
            <rect x="100" y="70" width="760" height="480" fill="#fffdf8" stroke="#3b342b" strokeWidth="3" />
            <line x1="100" x2="860" y1="230" y2="230" stroke="#ded6c9" strokeDasharray="6 7" />
            <line x1="100" x2="860" y1="390" y2="390" stroke="#ded6c9" strokeDasharray="6 7" />
            <text x="54" y="110" textAnchor="middle" fill="#5b5349" fontSize="17">下手袖</text>
            <text x="906" y="110" textAnchor="middle" fill="#5b5349" fontSize="17">上手袖</text>
            <text x="480" y="100" textAnchor="middle" fill="#777066" fontSize="16">舞台奥</text>
            <rect x="100" y="558" width="760" height="60" fill="#ece6da" stroke="#a99a83" strokeDasharray="8 6" />
            <text x="112" y="577" fill="#716758" fontSize="14">客席側の吊り位置</text>
            <text x="848" y="577" textAnchor="end" fill="#777066" fontSize="13">距離を縮めて表示</text>
            {showSetPieces && setPieces.map((piece, index) => {
              const active = selectedSetPiece?.id === piece.id
              const width = Math.max(28, (piece.size?.[0] ?? 1) * Math.abs(piece.scale) * MAP.width / 16)
              const depth = Math.max(24, (piece.size?.[2] ?? 1) * Math.abs(piece.scale) * MAP.height / 10)
              const duplicates = setPieces.filter(item => item.name === piece.name)
              const order = setPieces.slice(0, index + 1).filter(item => item.name === piece.name).length
              const name = (piece.name.trim() || '名称未設定') + (duplicates.length > 1 ? ` ${order}` : '')
              const label = name.length > 14 ? name.slice(0, 13) + '…' : name
              const x = mapX(piece.position[0])
              const y = mapY(piece.position[2])
              return <g key={piece.id} transform={`translate(${x} ${y})`}
                role="button" tabIndex={0} aria-label={`${name}を選択・移動`}
                style={{ cursor: 'grab', touchAction: 'none' }}
                onPointerDown={event => beginDrag(event, 'setpiece', piece.id, [piece.position[0], piece.position[2]])}
                onKeyDown={event => {
                  const delta = event.key === 'ArrowLeft' ? [-.5, 0] : event.key === 'ArrowRight' ? [.5, 0]
                    : event.key === 'ArrowUp' ? [0, -.5] : event.key === 'ArrowDown' ? [0, .5] : null
                  if (event.key === 'Enter' || event.key === ' ') {
                    event.preventDefault()
                    selectSetPiece(piece.id)
                    return
                  }
                  if (!delta) return
                  event.preventDefault()
                  selectSetPiece(piece.id)
                  setLastMove({ kind: 'setpiece', id: piece.id, sceneId: scene.id, from: [piece.position[0], piece.position[2]] })
                  updateSetPiece(piece.id, { position: [
                    clamp(piece.position[0] + delta[0], -7, 7), piece.position[1],
                    clamp(piece.position[2] + delta[1], -7.5, 2),
                  ] })
                }}>
                {piece.kind === 'gltf' && <title>3D モデルの平面上の大きさは目安です</title>}
                <rect x={-width / 2} y={-depth / 2} width={width} height={depth}
                  transform={`rotate(${-piece.rotation[1] * 180 / Math.PI})`}
                  fill={piece.color ?? '#8d795e'} fillOpacity={active ? .72 : .48}
                  stroke={active ? '#c8482d' : '#76634e'} strokeWidth={active ? 4 : 2}
                  strokeDasharray={piece.kind === 'gltf' ? '6 4' : undefined} />
                {piece.appearance === 'bench' && <line x1={-width * .4} x2={width * .4} y1={-depth * .28} y2={-depth * .28}
                  stroke="#382b22" strokeWidth="5" pointerEvents="none" />}
                {piece.appearance === 'door' && <circle cx={width * .23} cy="0" r="4"
                  fill="#f1d999" pointerEvents="none" />}
                {piece.appearance === 'suitcase' && <path d={`M ${-width * .15} ${-depth * .5} v -7 h ${width * .3} v 7`}
                  fill="none" stroke="#382b22" strokeWidth="3" pointerEvents="none" />}
                {piece.appearance === 'table' && <rect x={-width * .38} y={-depth * .34}
                  width={width * .76} height={depth * .68} rx="3" fill="none"
                  stroke="#382b22" strokeWidth="3" pointerEvents="none" />}
                {piece.appearance === 'bookshelf' && [-.25, 0, .25].map(offset => <line key={offset}
                  x1={-width * .43} x2={width * .43} y1={depth * offset} y2={depth * offset}
                  stroke="#2f2522" strokeWidth="3" pointerEvents="none" />)}
                {piece.appearance === 'window' && <path d={`M 0 ${-depth * .5} V ${depth * .5} M ${-width * .5} 0 H ${width * .5}`}
                  fill="none" stroke="#d7e7ed" strokeWidth="3" pointerEvents="none" />}
                <text y={depth / 2 + 20} textAnchor="middle" fill="#332820" fontSize="16" fontWeight="700"
                  paintOrder="stroke" stroke="#fffdf8" strokeWidth="5" pointerEvents="none">{label}</text>
              </g>
            })}
            {showDirections && directions.map(direction => <line key={direction.id}
              x1={mapX(direction.from[0])} y1={mapY(direction.from[1])}
              x2={mapX(direction.to[0])} y2={mapY(direction.to[1])}
              stroke={pathColors[direction.kind]}
              strokeWidth={direction.performerId === selectedPerformer?.id ? 6 : 4}
              strokeDasharray={direction.performerId === selectedPerformer?.id ? undefined : '8 5'}
              markerEnd={'url(#plan-arrow-' + direction.kind + ')'} />)}
            {showDirections && directions.filter(direction => direction.kind !== 'entrance').map(direction => <g key={'previous-' + direction.id} pointerEvents="none">
              <circle cx={mapX(direction.from[0])} cy={mapY(direction.from[1])} r="22"
                fill="#fffdf8" fillOpacity=".65" stroke={pathColors[direction.kind]}
                strokeWidth="3" strokeDasharray="5 4" />
              <text x={mapX(direction.from[0])} y={mapY(direction.from[1]) + 5}
                textAnchor="middle" fill="#665b4c" fontSize="13" fontWeight="700">前</text>
            </g>)}
            {showFixtures && targetChanges.map(({ fixture, from }) => <g key={'light-move-' + fixture.id} pointerEvents="none">
              <line x1={mapX(from[0])} y1={mapY(from[2])}
                x2={mapX(fixture.target[0])} y2={mapY(fixture.target[2])}
                stroke="#5b88a0" strokeWidth={fixture.id === selectedFixture?.id ? 5 : 3}
                strokeDasharray="8 6" markerEnd="url(#plan-arrow-light)" />
              {fixture.id === selectedFixture?.id && <text x={mapX(from[0])} y={mapY(from[2]) - 17}
                textAnchor="middle" fill="#42677a" fontSize="14" fontWeight="700"
                paintOrder="stroke" stroke="#fffdf8" strokeWidth="4">前の狙い</text>}
            </g>)}
            {showFixtures && fixtures.map((fixture, index) => {
              const active = selectedFixture?.id === fixture.id
              return <g key={fixture.id} opacity={fixture.enabled ? 1 : .45}>
                <line x1={mapX(fixture.position[0])} y1={mapY(fixture.position[2])}
                  x2={mapX(fixture.target[0])} y2={mapY(fixture.target[2])}
                  stroke={active ? '#c8482d' : '#a29179'} strokeWidth={active ? 4 : 2}
                  strokeDasharray={active ? undefined : '7 5'} pointerEvents="none" />
                <circle cx={mapX(fixture.target[0])} cy={mapY(fixture.target[2])} r={active ? 19 : 15}
                  fill={colorToHex(fixture.color)} fillOpacity=".3" stroke={active ? '#c8482d' : '#7b6b5a'}
                  strokeWidth={active ? 5 : 3} style={{ cursor: 'grab', touchAction: 'none' }}
                  role="button" tabIndex={0} aria-label={fixture.name + 'の狙う位置を移動'}
                  onPointerDown={event => beginDrag(event, 'target', fixture.id, [fixture.target[0], fixture.target[2]])}
                  onKeyDown={event => {
                    const delta = event.key === 'ArrowLeft' ? [-.5, 0] : event.key === 'ArrowRight' ? [.5, 0]
                      : event.key === 'ArrowUp' ? [0, -.5] : event.key === 'ArrowDown' ? [0, .5] : null
                    if (!delta) return
                    event.preventDefault()
                    selectFixture(fixture.id, 'target')
                    setLastMove({ kind: 'target', id: fixture.id, sceneId: scene.id, from: [fixture.target[0], fixture.target[2]] })
                    updateFixture(fixture.id, { target: [
                      clamp(fixture.target[0] + delta[0], -7.8, 7.8), fixture.target[1],
                      clamp(fixture.target[2] + delta[1], -7.8, 1.8),
                    ] })
                  }} />
                <g role="button" tabIndex={0} aria-label={fixture.name + 'の設置位置を移動'}
                  style={{ cursor: 'grab', touchAction: 'none' }}
                  onPointerDown={event => beginDrag(event, 'fixture', fixture.id, [fixture.position[0], fixture.position[2]])}
                  onKeyDown={event => {
                    const delta = event.key === 'ArrowLeft' ? [-.5, 0] : event.key === 'ArrowRight' ? [.5, 0]
                      : event.key === 'ArrowUp' ? [0, -.5] : event.key === 'ArrowDown' ? [0, .5] : null
                    if (event.key === 'Enter' || event.key === ' ') {
                      event.preventDefault()
                      selectFixture(fixture.id)
                      return
                    }
                    if (!delta) return
                    event.preventDefault()
                    selectFixture(fixture.id)
                    setLastMove({ kind: 'fixture', id: fixture.id, sceneId: scene.id, from: [fixture.position[0], fixture.position[2]] })
                    updateFixture(fixture.id, { position: [
                      clamp(fixture.position[0] + delta[0], -7, 7), fixture.position[1],
                      clamp(fixture.position[2] + delta[1], -7.5, 24),
                    ] })
                  }}>
                  <title>{fixture.name}{fixture.position[2] > 2 ? `・舞台前から ${(fixture.position[2] - 2).toFixed(1)}m` : ''}</title>
                  <circle cx={mapX(fixture.position[0])} cy={mapY(fixture.position[2])} r="21"
                    fill={active ? '#c8482d' : '#322c29'} stroke="#fffdf8" strokeWidth="3" />
                  <text x={mapX(fixture.position[0])} y={mapY(fixture.position[2]) + 6}
                    textAnchor="middle" fill="#fffdf8" fontSize="17" fontWeight="700"
                    pointerEvents="none">{index + 1}</text>
                </g>
              </g>
            })}
            {performers.map((performer, index) => {
              if (performer.onStage === false) return null
              const point: StagePoint = [performer.position[0], performer.position[2]]
              const active = performer.id === selectedPerformer?.id
              return <g key={performer.id}>
                <circle cx={mapX(point[0])} cy={mapY(point[1])} r="27"
                  fill={actorColors[index % actorColors.length]} stroke={active ? '#181519' : '#fffdf8'}
                  strokeWidth={active ? 6 : 4} style={{ cursor: 'grab', touchAction: 'none' }}
                  role="button" tabIndex={0} aria-label={performer.name + 'の立ち位置を移動'}
                  onPointerDown={event => beginDrag(event, 'performer', performer.id, point)}
                  onKeyDown={event => {
                    const delta = event.key === 'ArrowLeft' ? [-.5, 0] : event.key === 'ArrowRight' ? [.5, 0]
                      : event.key === 'ArrowUp' ? [0, -.5] : event.key === 'ArrowDown' ? [0, .5] : null
                    if (!delta) return
                    event.preventDefault()
                    selectActor(performer.id)
                    setLastMove({ kind: 'performer', id: performer.id, sceneId: scene.id, from: point })
                    updatePerformer(performer.id, { position: [
                      Math.round(clamp(point[0] + delta[0], -9.2, 9.2) * 10) / 10,
                      performer.position[1],
                      Math.round(clamp(point[1] + delta[1], -7.8, 1.8) * 10) / 10,
                    ] })
                  }} />
                <text x={mapX(point[0])} y={mapY(point[1]) + 6} textAnchor="middle"
                  fill="#fffdf8" fontSize="19" fontWeight="700" pointerEvents="none">{index + 1}</text>
                <text x={mapX(point[0])} y={mapY(point[1]) - 34} textAnchor="middle"
                  fill="#322b25" fontSize="17" fontWeight="700" paintOrder="stroke"
                  stroke="#fffdf8" strokeWidth="4" pointerEvents="none">{performer.name}</text>
              </g>
            })}
          </svg>
        </div>
        <div className="plan-map-footer">
          <div className="plan-actor-key">{performers.map((actor, index) => <div className="plan-actor-entry" key={actor.id}>
            <button className={'plan-actor-select' + (actor.id === selectedPerformer?.id ? ' active' : '')}
              onClick={() => selectActor(actor.id)}>
              <span style={{ background: actorColors[index % actorColors.length] }}>{index + 1}</span>{actor.name}
              <small>{actor.onStage === false ? '舞台外' : '舞台上'}</small>
            </button>
            <button className={'plan-presence-toggle' + (actor.onStage === false ? '' : ' active')}
              aria-label={`${actor.name}を${actor.onStage === false ? '舞台に出す' : '舞台から外す'}`}
              onClick={() => {
                const enters = actor.onStage === false
                updatePerformer(actor.id, { onStage: enters })
                setFeedback(`${actor.name}を${enters ? '舞台に出しました' : '舞台から外しました'}`)
              }}>
              {actor.onStage === false ? '舞台に出す' : '舞台から外す'}
            </button>
          </div>)}</div>
          <button onClick={saveDiagram}>平面図をSVGで保存</button>
        </div>
      </div>
      {!persistent && <div className="plan-fields">
        {(selectedPerformer || selectedFixture || selectedSetPiece) && <div className="plan-selected-object">
          <span>選択中：{selectedName || '名称未設定'}</span>
          {selectedPath && <small>{placeName(selectedPath.from)} → {placeName(selectedPath.to)}</small>}
          {selectedPerformer && <label className="plan-actor-presence">
            <input type="checkbox" checked={selectedPerformer.onStage !== false}
              onChange={event => updatePerformer(selectedPerformer.id, { onStage: event.target.checked })} />
            このシーンで舞台上
          </label>}
          {selectedFixture && <div className="plan-light-controls">
            <label className="plan-light-toggle">
              <input type="checkbox" checked={selectedFixture.enabled}
                onChange={event => updateFixture(selectedFixture.id, { enabled: event.target.checked })} />
              このシーンで点灯
            </label>
            <label>明るさ <output>{Math.round(selectedFixture.intensity / 1.5 * 100)}%</output>
              <input type="range" min="0" max="1.5" step="0.01" value={selectedFixture.intensity}
                onChange={event => updateFixture(selectedFixture.id, { intensity: Number(event.target.value) })} />
            </label>
            <label>狙いの左右 <output>{selectedFixture.target[0] < 0 ? '下手' : selectedFixture.target[0] > 0 ? '上手' : '中央'} {Math.abs(selectedFixture.target[0]).toFixed(1)}m</output>
              <input type="range" min="-7.8" max="7.8" step="0.1" value={selectedFixture.target[0]}
                onChange={event => updateFixture(selectedFixture.id, {
                  target: [Number(event.target.value), selectedFixture.target[1], selectedFixture.target[2]],
                })} />
            </label>
            <label className="plan-light-color">光の色
              <input type="color" value={colorToHex(selectedFixture.color)}
                onChange={event => updateFixture(selectedFixture.id, { color: hexToRgb(event.target.value), gelEnabled: true })} />
            </label>
          </div>}
          {selectedSetPiece?.kind === 'gltf' && <small>3D モデルの平面上の大きさは目安です</small>}
          {selectedSetPiece && <label className="plan-object-name">装置の名前
            <input value={selectedSetPiece.name} maxLength={60} placeholder="例：中央の扉"
              onChange={event => updateSetPiece(selectedSetPiece.id, { name: event.target.value })} />
          </label>}
          <button onClick={() => {
            onClose()
            updateSettings({ uiTab: selectedTab, panelOpen: true })
          }}>詳細を編集</button>
        </div>}
        <label>シーン名<input value={scene.title} maxLength={60} placeholder="例：A 登場後"
          onChange={event => updateScene(scene.id, { title: event.target.value })} /></label>
        <small className="plan-field-hint">次のシーンには、今の役者・照明・装置をコピーします。</small>
        <label>切り替えのきっかけ<input value={scene.trigger} maxLength={160} placeholder="例：台詞『行こう』で登場"
          onChange={event => updateScene(scene.id, { trigger: event.target.value })} /></label>
        <details><summary>メモを追加</summary>
          <textarea value={scene.note} maxLength={1000} rows={3} placeholder="演出や明かりの意図、確認事項"
            onChange={event => updateScene(scene.id, { note: event.target.value })} />
        </details>
        <div className="plan-field-actions">
          <button className="plan-add-actor" onClick={() => addPerformer()}
            disabled={performers.length >= LIMITS.performers}>＋ 役者を追加</button>
          <button onClick={undoMove} disabled={!lastMove}>移動を戻す</button>
          {plan.scenes.length > 1 && <button onClick={() => {
            if (window.confirm('このシーンを削除しますか？')) {
              removeScene(scene.id)
              setLastMove(null)
            }
          }}>シーンを削除</button>}
        </div>
      </div>}
    </div>
    </div>
    <AudienceLayoutEditor open={audienceEditorOpen} onClose={() => setAudienceEditorOpen(false)} />
  </section>
}
