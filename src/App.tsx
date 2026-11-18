import { canEditProject, loseProjectEditor, useProjectEditor, getProjectEditorEpoch } from './io/projectEditor'
import { canvasPointerDown, canvasPointerUp } from './objectMenu'
import { ObjectContextMenu } from './ui/ObjectContextMenu'
import { OnlineWorkspace } from './ui/OnlineWorkspace'
import { WorkspaceNotice, WorkspaceNotices } from './ui/WorkspaceNotice'
import { UpdateNotice } from './ui/UpdateNotice'
import { hasDeviceStorage } from './io/workspaceStorage'
import { useEffect, useRef, useState } from 'react'
import { ToolButtons } from './ui/ToolButtons'
import { canDelete, deleteSelection, duplicateSelection } from './objectActions'
import { Canvas, useThree } from '@react-three/fiber'
import { OrbitControls, PerspectiveCamera } from '@react-three/drei'
import * as THREE from 'three'
import { Stage } from './scene/Stage'
import { PerformerMeshes } from './scene/PerformerMesh'
import { FixtureMeshes } from './scene/FixtureMesh'
import { Beams } from './scene/Beams'
import { SelectionGizmo, isGizmoEngaged } from './scene/SelectionGizmo'
import { PhotometricProbe, useProbeClickHandler } from './scene/PhotometricProbe'
import { SetPieces } from './scene/SetPieces'
import { AdSlot, useShowAds } from './ui/Ads'
import { FloorPicker, pickDropPoint } from './scene/FloorPicker'
import { ADD_DRAG_TYPE, addItem, parseAddItem } from './objectActions'
import { XRButton, XRGLBinder } from './scene/XRSupport'
import { PhoneChrome } from './ui/PhoneChrome'
import { ChangeScopeBar } from './ui/ChangeScopeBar'
import { ControlPanel } from './ui/ControlPanel'
import { HelpOverlay } from './ui/HelpOverlay'
import { ConsoleDesk } from './ui/ConsoleDesk'
import { SettingsModal } from './ui/SettingsModal'
import { QUALITY_PRESETS, sceneDisplayTitle, useStore } from './store'
import { refreshSession, useCloudSession } from './io/cloudSession'
import { CloudError } from './io/cloud'
import { ScenePanel } from './ui/ScenePanel'
import { PlanBoard } from './ui/PlanBoard'
import { ProjectLibrary } from './ui/ProjectLibrary'
import { useReportAdsToApp } from './ui/Ads'
import { DoubleTapFocus } from './scene/DoubleTapFocus'
import { ProjectTitleEdit } from './ui/ProjectTitleEdit'
import { AccountMenu } from './ui/AccountMenu'
import { getActiveCloudProject, getActiveSavedProjectName, setActiveCloudProject } from './io/mockProjectSession'
import { consumeWorkspaceHandoff, currentWorkspaceSnapshot, flushMockAutosave, initMockWorkspace, markCloudSaved, markMockDemoBaseline, preserveMockDraftBeforeDemo, redoMockWorkspace, undoMockWorkspace, useMockWorkspaceState } from './io/mockWorkspace'
import { exportScene } from './io/sceneIO'
import { updateCloudProject } from './io/cloud'
import { StagePlayback } from './ui/StagePlayback'
import { DirectionPaths } from './scene/DirectionPaths'
import { WebGLErrorBoundary } from './ui/WebGLErrorBoundary'

import { FIXTURE_PROFILES, type FixtureProfile } from './lighting/fixtureTypes'
import { tryLoadFromHash } from './io/sceneIO'
import { createShowcasePlan } from './demo/createShowcasePlan'
import { createRainLibraryLightingStudyPlan } from './demo/createRainLibraryLightingStudyPlan'
import { createAkaoniPlan } from './demo/createAkaoniPlan'
import { createAkaoniWashPlan } from './demo/createAkaoniWashPlan'
import { createAkaoniLightingStudyPlan } from './demo/createAkaoniLightingStudyPlan'
import { createVenueStudyPlan, VENUE_STUDY_LINKS } from './demo/createVenueStudyPlans'
import { AudienceSeating } from './scene/AudienceSeating'
import { isWorkspaceLibraryPath, isWorkspacePath, workspaceBasePath } from './io/workspacePath'
import { LanternMark } from './ui/LanternMark'
import { createSampleProduction } from './demo/createSampleProduction'

const CAMERA_VIEWS: Record<string, { pos: [number, number, number]; target: [number, number, number] }> = {
  audience: { pos: [0, 2.5, 10], target: [0, 2.5, -2] },
  // 吊り位置と当たりの範囲を仕込み図のように見るための俯瞰。
  aerial: { pos: [0, 13, 4], target: [0, 0.6, -3] },
  // 下手袖に立った人の目線。サイドウォール (x=-8) の内側、かつプロセニアム袖枠
  // (x=-6.5, z=2.5) より奥に置く。以前は pos=[-9,3,4] と壁の外側にあったため、
  // 壁の裏面が画面のほとんどを黒く覆って何も見えなかった。
  sidewing: { pos: [-6.8, 1.7, 1.4], target: [1.6, 1.5, -3.2] },
  free: { pos: [4, 4, 8], target: [0, 2, -2] },
  house: { pos: [0, 24, 27], target: [0, 0.5, 2] },
}

// 基準の垂直画角。横長画面ではこの値をそのまま使う。
const BASE_FOV = 45
// 縦画面で広げるときの上限。これ以上広げるとパースの歪みが目立つ。
const MAX_FOV = 70

/**
 * 縦長画面 (スマホを縦に持った状態) では、垂直fovを45°のまま使うと水平画角が
 * 極端に狭くなり、幅12mのプロセニアム開口のうち中央数メートルしか映らない。
 * アスペクト比が1未満のときは、横長時と同じ水平画角を保てるところまで垂直fovを
 * 広げる (歪みが出ないよう MAX_FOV で頭打ち)。横長では何もしない。
 */
function ResponsiveFov() {
  const camera = useThree(s => s.camera)
  const width = useThree(s => s.size.width)
  const height = useThree(s => s.size.height)

  useEffect(() => {
    const cam = camera as THREE.PerspectiveCamera
    if (!cam.isPerspectiveCamera) return
    const aspect = width / Math.max(height, 1)
    const fov =
      aspect >= 1
        ? BASE_FOV
        : Math.min(
            THREE.MathUtils.radToDeg(
              2 * Math.atan(Math.tan(THREE.MathUtils.degToRad(BASE_FOV) / 2) / aspect),
            ),
            MAX_FOV,
          )
    if (Math.abs(cam.fov - fov) > 0.01) {
      cam.fov = fov
      cam.updateProjectionMatrix()
    }
  }, [camera, width, height])

  return null
}

const isEmbed = new URLSearchParams(location.search).has('embed')
const isMockPreview = isWorkspacePath()
const isProjectLibraryPath = isWorkspaceLibraryPath
const requestedDemo = () => isMockPreview ? new URLSearchParams(location.search).get('demo') : null
const EXPOSURE_SCALE = 0.45

function ExposureSync({ exposure }: { exposure: number }) {
  const { gl, invalidate } = useThree()
  useEffect(() => {
    gl.toneMappingExposure = EXPOSURE_SCALE * exposure
    invalidate()
  }, [gl, exposure, invalidate])
  return null
}

export default function App() {
  useReportAdsToApp()
  const settings = useStore(s => s.settings)
  const hasAudienceBlocks = useStore(s => (s.productionPlan.audienceBlocks?.length ?? 0) > 0)
  const audienceBlocks = useStore(s => s.productionPlan.audienceBlocks ?? [])
  const venueLayout = useStore(s => s.productionPlan.venueLayout)
  const select = useStore(s => s.select)
  const scenePath = useStore(s => {
    const plan = s.productionPlan
    const scene = plan.scenes.find(item => item.id === plan.activeSceneId)
    if (!scene) return '舞台プラン'
    const sequence = plan.sequences?.find(item => item.id === scene.sequenceId)
    const chapter = plan.chapters?.find(item => item.id === sequence?.chapterId)
    return [chapter?.title, sequence?.title, scene.title].filter(Boolean).join(' › ')
  })
  const projectTitle = useStore(s => s.productionPlan.projectTitle)
  const [mockPage, setMockPage] = useState<'projects' | 'editor'>(() => isProjectLibraryPath() ? 'projects' : 'editor')
  const [planOpen, setPlanOpen] = useState(isMockPreview)
  const [mapVisible, setMapVisible] = useState(true)
  // PC の見え方。3D だけ・平面図だけ（どちらも画面いっぱい）・上下に並べる（2026-11-17 オーナーの提案）。覚えておく
  // 'side' は左右に並べる（2026-11-18 オーナー「横に並べたい時あるかも」）
  const [deskView, setDeskViewState] = useState<'3d' | 'plan' | 'both' | 'side'>(() => {
    try { const value = localStorage.getItem('tomoshibi.deskView'); return value === 'plan' || value === 'both' || value === 'side' ? value : '3d' } catch { return '3d' }
  })
  // PC の右の「舞台の編集」の欄を閉じておく（2026-11-18 オーナー「閉じたい時あるかも」）。欄の × で閉じ、右端のつまみか「表示」で開く
  const [inspectorHidden, setInspectorHiddenState] = useState(() => { try { return localStorage.getItem('tomoshibi.inspectorHidden') === '1' } catch { return false } })
  const setInspectorHidden = (next: boolean) => {
    setInspectorHiddenState(next)
    try { localStorage.setItem('tomoshibi.inspectorHidden', next ? '1' : '0') } catch { /* 覚えられなくても使える */ }
  }
  useEffect(() => {
    const hide = () => setInspectorHidden(true)
    const show = () => setInspectorHidden(false)
    window.addEventListener('tomoshibi-inspector-hide', hide)
    window.addEventListener('tomoshibi-inspector-show', show)
    return () => { window.removeEventListener('tomoshibi-inspector-hide', hide); window.removeEventListener('tomoshibi-inspector-show', show) }
  }, [])
  const setDeskView = (next: '3d' | 'plan' | 'both' | 'side') => {
    setDeskViewState(next)
    setMapVisible(next !== '3d')
    try { localStorage.setItem('tomoshibi.deskView', next) } catch { /* 覚えられなくても使える */ }
  }
  const [mobileView, setMobileView] = useState<'stage' | 'plan'>('stage')
  const [outlineVisible, setOutlineVisible] = useState(window.innerWidth > 960)
  /** 追加の一覧から物をドラッグして、3D の画面の上にいる間 */
  const [addDropActive, setAddDropActive] = useState(false)
  const [showSceneDirections, setShowSceneDirections] = useState(!isMockPreview)
  const [displayMenuOpen, setDisplayMenuOpen] = useState(false)
  // 卓（試作）。PC の「表示」から開く（2026-11-19）
  const [consoleOpen, setConsoleOpen] = useState(false)
  const [displayMenuPosition, setDisplayMenuPosition] = useState({ left: 14, top: 104 })
  const [sceneEditorOpen, setSceneEditorOpen] = useState(false)
  const displayMenuRef = useRef<HTMLDivElement>(null)
  const displayMenuPanelRef = useRef<HTMLDivElement>(null)
  const [workspaceFeedback, setWorkspaceFeedback] = useState('')
  const [playbackOpen, setPlaybackOpen] = useState(false)
  // 無料プランの広告の帯（編集画面の下）。画面に固定する広告は PC だけ（AdSense の決まり）。通しで見るのあいだは隠す
  const showAds = useShowAds()
  const wideScreen = useWideScreen()
  const phone = usePhone()
  const phoneLayout = phone && isMockPreview && !isEmbed
  const coarsePointer = typeof window !== 'undefined' && window.matchMedia('(pointer: coarse)').matches
  const deskLayout = isMockPreview && !phone
  useEffect(() => { if (deskLayout) setMapVisible(deskView !== '3d') }, [deskLayout])
  const adFooter = showAds && wideScreen && isMockPreview && mockPage !== 'projects' && !playbackOpen && !isEmbed
  useEffect(() => {
    const close = () => setPlaybackOpen(false)
    window.addEventListener('tomoshibi-end-preview', close)
    return () => window.removeEventListener('tomoshibi-end-preview', close)
  }, [])
  const [, setViewportWidth] = useState(window.innerWidth)
  const wasMobile = useRef(window.innerWidth <= 960)
  const maxSeatZ = Math.max(3, ...audienceBlocks.map(block =>
    block.position[1] + block.rows * block.rowSpacing / 2))
  const minSeatZ = Math.min(-9, ...audienceBlocks.map(block =>
    block.position[1] - block.rows * block.rowSpacing / 2))
  const maxSeatX = Math.max(8, ...audienceBlocks.map(block => {
    const angle = block.rotationDeg * Math.PI / 180
    const halfWidth = (block.seatsPerRow * block.seatSpacing) / 2
    const halfDepth = (block.rows * block.rowSpacing) / 2
    return Math.abs(block.position[0]) + Math.abs(Math.cos(angle)) * halfWidth + Math.abs(Math.sin(angle)) * halfDepth
  }))
  const houseSpan = maxSeatZ - minSeatZ
  const [stageDx, stageDz] = venueLayout?.stageOffset ?? [0, 0]
  const baseView = CAMERA_VIEWS[settings.cameraView] ?? CAMERA_VIEWS.audience
  const view = settings.cameraView === 'house' && (maxSeatZ > 15 || minSeatZ < -10 || maxSeatX > 10)
    ? { pos: [0, Math.max(24, houseSpan * .85, maxSeatX * 1.5),
        Math.max(27, maxSeatZ + 14, maxSeatX * 1.5)] as [number, number, number],
      target: [stageDx / 2, .5, (maxSeatZ + minSeatZ + stageDz) / 2] as [number, number, number] }
    : { pos: [baseView.pos[0] + stageDx, baseView.pos[1], baseView.pos[2] + stageDz] as [number, number, number],
      target: [baseView.target[0] + stageDx, baseView.target[1], baseView.target[2] + stageDz] as [number, number, number] }
  // 視点は、視点を選んだときの舞台・客席の位置に向けて、そのあとは固定する（オーナー指示、2026-11-15）。
  // 舞台や客席を動かすたびに視点が付いてくると、3D で舞台を引っぱったときに視点ごとずれて止まらなくなる
  // いま選んでいる視点のボタンをもう一度押すと、いまの舞台に向け直す
  const [reaim, setReaim] = useState(0)
  useEffect(() => {
    const onReaim = () => setReaim(n => n + 1)
    window.addEventListener('tomoshibi-reaim-camera', onReaim)
    return () => window.removeEventListener('tomoshibi-reaim-camera', onReaim)
  }, [])
  const viewKey = `${settings.cameraView}-${reaim}`
  const frozenView = useRef<{ key: string; view: typeof view } | null>(null)
  if (frozenView.current?.key !== viewKey) frozenView.current = { key: viewKey, view }
  const cameraPose = frozenView.current.view
  const noopMaterials = () => {}

  useEffect(() => {
    if (!workspaceFeedback) return
    const timer = window.setTimeout(() => setWorkspaceFeedback(''), 6000)
    return () => window.clearTimeout(timer)
  }, [workspaceFeedback])

  useEffect(() => {
    if (!displayMenuOpen) return
    const closeOutside = (event: PointerEvent) => {
      const target = event.target as Node
      if (!displayMenuRef.current?.contains(target) && !displayMenuPanelRef.current?.contains(target))
        setDisplayMenuOpen(false)
    }
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return
      event.preventDefault()
      event.stopPropagation()
      setDisplayMenuOpen(false)
    }
    document.addEventListener('pointerdown', closeOutside)
    window.addEventListener('keydown', closeOnEscape, true)
    return () => {
      document.removeEventListener('pointerdown', closeOutside)
      window.removeEventListener('keydown', closeOnEscape, true)
    }
  }, [displayMenuOpen])

  useEffect(() => {
    if (!isMockPreview) return
    const onPopState = () => setMockPage(isProjectLibraryPath() ? 'projects' : 'editor')
    window.addEventListener('popstate', onPopState)
    return () => window.removeEventListener('popstate', onPopState)
  }, [])

  useEffect(() => {
    const onResize = () => {
      const mobile = window.innerWidth <= 960
      setViewportWidth(window.innerWidth)
      if (mobile !== wasMobile.current) setOutlineVisible(!mobile)
      if (isMockPreview && mobile && !wasMobile.current) useStore.getState().updateSettings({ panelOpen: false })
      wasMobile.current = mobile
    }
    window.addEventListener('resize', onResize)
    if (isMockPreview && window.innerWidth <= 960) useStore.getState().updateSettings({ panelOpen: false })
    return () => window.removeEventListener('resize', onResize)
  }, [])

  // embed クラス付与
  useEffect(() => {
    if (isEmbed) document.body.classList.add('embed')
    else document.body.classList.remove('embed')
  }, [])

  // 初回: URL hashからシーン読込 / GDTF動的プロファイル登録窓口
  useEffect(() => {
    const handoff = isMockPreview ? consumeWorkspaceHandoff() : 'none'
    const loadedFromHash = handoff !== 'imported' && tryLoadFromHash()
    const demo = !loadedFromHash ? requestedDemo() : null
    const venueStudy = VENUE_STUDY_LINKS.find(item => demo === `venue-${item.kind}`)
    const wantsDemo = demo === '1' || demo === '2' || demo === 'sample' || demo === 'rain-library-study' || demo === 'akaoni' || demo === 'akaoni-wash' || demo === 'akaoni-study' || !!venueStudy
    const loadDemo = wantsDemo && preserveMockDraftBeforeDemo()
    if (wantsDemo && !loadDemo) setWorkspaceFeedback('前のプランを保存できなかったため、デモを開きませんでした。')
    if (loadDemo && demo === '1') createShowcasePlan()
    // 見本の公演。2026-11-18 から作り直した createSampleProduction（'sample' は同じものの別名）
    else if (loadDemo && (demo === '2' || demo === 'sample')) createSampleProduction()
    else if (loadDemo && demo === 'rain-library-study') createRainLibraryLightingStudyPlan()
    else if (loadDemo && demo === 'akaoni') createAkaoniPlan()
    else if (loadDemo && demo === 'akaoni-wash') createAkaoniWashPlan()
    else if (loadDemo && demo === 'akaoni-study') createAkaoniLightingStudyPlan()
    else if (loadDemo && venueStudy) createVenueStudyPlan(venueStudy.kind)
    else if (isMockPreview && !isProjectLibraryPath() && !loadedFromHash && handoff !== 'imported') useStore.getState().ensureScenes()
    if (isMockPreview) initMockWorkspace(!loadedFromHash && !loadDemo && handoff !== 'imported')
    if (handoff === 'imported') {
      flushMockAutosave()
      const url = new URL(location.href)
      url.searchParams.delete('copy')
      history.replaceState(null, '', url.pathname + url.search + url.hash)
      setWorkspaceFeedback('現在の舞台プランをコピーしました。元の画面の保存データはそのままです。')
    } else if (handoff === 'error') setWorkspaceFeedback('現在の舞台プランをコピーできませんでした。')
    if (loadDemo) {
      markMockDemoBaseline()
      flushMockAutosave()
      const url = new URL(location.href)
      url.searchParams.delete('demo')
      history.replaceState(null, '', url.pathname + url.search + url.hash)
    }
    if (isMockPreview && useStore.getState().savedSnapshot === null) {
      useStore.getState().markSavedSnapshot()
    }
    ;(window as any).__addGDTFProfile = (key: string, profile: FixtureProfile) => {
      ;(FIXTURE_PROFILES as any)[key] = profile
    }
  }, [])

  // キーボードショートカット
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement
      const k = e.key.toLowerCase()
      if (isMockPreview && (e.metaKey || e.ctrlKey) && !e.altKey &&
          t.tagName !== 'INPUT' && t.tagName !== 'TEXTAREA' && t.tagName !== 'SELECT') {
        if (k === 'z') { e.preventDefault(); if (e.shiftKey) redoMockWorkspace(); else undoMockWorkspace(); return }
        if (k === 'y') { e.preventDefault(); redoMockWorkspace(); return }
      }
      if ((t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT') && k !== 'escape') return
      if (playbackOpen) {
        if (k === 'escape') setPlaybackOpen(false)
        return
      }
      const s = useStore.getState()
      const up = s.updateSettings
      switch (k) {
        case '1': up({ cameraView: 'audience' }); break
        case '2': up({ cameraView: 'aerial' }); break
        case '3': up({ cameraView: 'sidewing' }); break
        case '4': up({ cameraView: 'free' }); break
        case '5': if (s.productionPlan.audienceBlocks?.length) up({ cameraView: 'house' }); break
        // 作業画面（isMockPreview）では平面図は閉じるものではなく、表示の切り替えで出し入れする。Esc で閉じると「平面図」を押しても何も出なくなっていた（2026-11-18）
        case 'escape': if (planOpen && !isMockPreview) setPlanOpen(false); else s.select(null, null); break
        // 作業画面では、古い説明の重ね画面ではなく操作説明のページ（/help）を新しいタブで開く（2026-11-19。重ね画面は内容が古かった）
        case '?': case '/': case 'h': if (isMockPreview) window.open('/help', '_blank', 'noopener'); else up({ showHelp: !s.settings.showHelp }); break
        case 'p': up({ probeMode: !s.settings.probeMode }); break
        // 道具は Unity と同じ Q/W/E/R。右ボタンで視点を動かしている間は、WASD・QE の視点移動に使う
        case 'q': if (!cameraFlying) up({ transformMode: 'select' }); break
        case 'w': if (!cameraFlying) up({ transformMode: 'translate' }); break
        case 'e': if (!cameraFlying) up({ transformMode: 'rotate' }); break
        case 'r': if (!cameraFlying) up({ transformMode: 'scale' }); break
        case 'delete': case 'backspace': {
          if (canDelete(s.selection.kind)) { e.preventDefault(); deleteSelection() }
          break
        }
        case 'd': {
          // Cmd/Ctrl+D で複製（どの種類でも）
          if (e.metaKey || e.ctrlKey) { e.preventDefault(); duplicateSelection() }
          break
        }
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [planOpen, playbackOpen])

  const startPlayback = () => {
    if (!isMockPreview) setPlanOpen(false)
    if (window.innerWidth <= 960) setOutlineVisible(false)
    useStore.getState().updateSettings({ scenePanelOpen: false, settingsOpen: false, showHelp: false })
    setPlaybackOpen(true)
  }

  const navigateMock = (page: 'projects' | 'editor') => {
    if (isMockPreview) flushMockAutosave()
    if (location.protocol !== 'file:') {
      const path = page === 'projects' ? `${workspaceBasePath()}/projects/` : `${workspaceBasePath()}/`
      if (location.pathname !== path) history.pushState(null, '', path)
    }
    setMockPage(page)
    setPlaybackOpen(false)
    setSceneEditorOpen(false)
    setDisplayMenuOpen(false)
    useStore.getState().updateSettings({ scenePanelOpen: false, settingsOpen: false, showHelp: false })
  }

  return (
    <OnlineWorkspace enabled={isMockPreview} editorVisible={mockPage !== 'projects'} onProjects={() => navigateMock('projects')}>
      {isMockPreview && <><WorkspaceNotices /><UpdateNotice /><CloudProjectAutosave /></>}
      {isMockPreview && mockPage === 'projects'
        ? <ProjectLibrary onOpenEditor={() => navigateMock('editor')} />
        : <div className={'unified-shell' + (planOpen ? ' plan-open' : '') + (settings.panelOpen ? ' panel-open' : '') + (playbackOpen ? ' playback-open' : '') + (isMockPreview ? ' workspace-layout mobile-view-' + mobileView : '') + (mapVisible ? '' : ' map-hidden') + (outlineVisible ? ' outline-visible' : '') + (adFooter ? ' has-ad-footer' : '') + (phoneLayout ? ' phone-layout' : '') + (deskLayout && deskView === 'plan' && mapVisible ? ' desk-plan-full' : '') + (deskLayout && deskView === 'side' && mapVisible ? ' desk-split-side' : '') + (deskLayout && inspectorHidden ? ' inspector-hidden' : '') + (deskLayout && consoleOpen && !playbackOpen ? ' console-open' : '')}>
      {/* 右ボタンを押して離しただけのときに、右クリックのメニューを出す（ドラッグは視点の移動。objectMenu.ts） */}
      <div className={'canvas-wrap' + (addDropActive ? ' add-drop-active' : '')} onContextMenu={event => event.preventDefault()}
        onPointerDownCapture={canvasPointerDown} onPointerUpCapture={canvasPointerUp}
        // 追加の一覧からドラッグしてきた物を、落とした所の床に置く
        onDragOver={event => {
          if (!event.dataTransfer.types.includes(ADD_DRAG_TYPE)) return
          event.preventDefault()
          event.dataTransfer.dropEffect = 'copy'
          if (!addDropActive) setAddDropActive(true)
        }}
        onDragLeave={event => { if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setAddDropActive(false) }}
        onDrop={event => {
          setAddDropActive(false)
          const item = parseAddItem(event.dataTransfer.getData(ADD_DRAG_TYPE))
          if (!item) return
          event.preventDefault()
          const hit = pickDropPoint(event.clientX, event.clientY)
          addItem(item, hit?.floor ?? undefined, hit?.ray)
        }}>
       <WebGLErrorBoundary>
        <Canvas
          gl={{
            antialias: true,
            powerPreference: 'high-performance',
            preserveDrawingBuffer: false,
          }}
          // 描く細かさの上限は品質に合わせる（最高なら 2 倍。録画の 4K に使う）。2026-11-19
          dpr={[1, QUALITY_PRESETS[settings.quality].pixelRatio]}
          shadows="soft"
          onCreated={({ gl }) => {
            gl.toneMapping = THREE.ACESFilmicToneMapping
            gl.toneMappingExposure = EXPOSURE_SCALE * (settings.exposure ?? 1.0)
          }}
          onPointerMissed={(event) => { if (event.button !== 2 && !isGizmoEngaged()) select(null, null) }}
        >
          <ExposureSync exposure={settings.exposure ?? 1.0} />
          <PerspectiveCamera key={`cam-${viewKey}`} makeDefault position={cameraPose.pos} fov={BASE_FOV} near={0.1} far={600} />
          <ResponsiveFov />
          <DoubleTapFocus />
          <OrbitControls
            key={`ctl-${viewKey}`}
            makeDefault
            target={cameraPose.target}
            enableDamping
            dampingFactor={0.16}
            rotateSpeed={0.6}
            zoomSpeed={0.9}
            panSpeed={0.8}
            minDistance={1.5}
            maxDistance={100}
            maxPolarAngle={Math.PI * 0.49}
            enablePan
            // 指（マウス）のある所へ向かって拡大する。舞台の真ん中ではなく、役者などに寄れる（2026-11-17）
            zoomToCursor
            // 指は地図アプリと同じ: 1 本指で床と平行に動かし、2 本指で拡大・回転（ひねりは TouchTwist）。マウスはこれまでどおり
            touches={{ ONE: THREE.TOUCH.PAN, TWO: THREE.TOUCH.DOLLY_ROTATE }}
            screenSpacePanning={!coarsePointer}
          />
          {!playbackOpen && <CameraKeyboardPan />}
          <TouchTwist />

          <ambientLight intensity={settings.ambient ?? 0.05} color={'#3a2a20'} />
          <hemisphereLight args={['#3a2a20', '#1a1208', 0.2]} />
          {settings.showHouseLights && (
            <>
              {/* 客電の明かりは客席の真上から当てる（AudienceSeating）。ここは舞台に回り込む分だけ */}
              <ambientLight intensity={0.18} color={'#fde0b8'} />
              {/* 客席を置いていないときは、これまでどおり正面から当てる */}
              {!hasAudienceBlocks && <directionalLight position={[0, 8, 6]} intensity={0.7} color={'#fde0b8'} />}
            </>
          )}

          {settings.showStage && <Stage onMaterialsReady={noopMaterials} />}
          <AudienceSeating />
          {settings.showPerformers && <PerformerMeshes onMaterialsReady={noopMaterials} />}
          <FixtureMeshes />
          <SetPieces />
          <Beams />
          {!playbackOpen && <SelectionGizmo />}
          <DirectionPaths visible={planOpen && !playbackOpen && showSceneDirections} />
          <PhotometricProbe />
          <ProbeClickCatcher />
          <FloorPicker />

          <XRGLBinder />
        </Canvas>
       </WebGLErrorBoundary>
        {addDropActive && <div className="canvas-drop-hint" aria-hidden="true">ここで離すと、指した床の位置に置きます</div>}
        {isMockPreview && !playbackOpen && <MockSceneIndicator outlineVisible={outlineVisible}
          onToggleOutline={() => {
            setOutlineVisible(value => !value)
            setDisplayMenuOpen(false)
            if (window.innerWidth <= 960) useStore.getState().updateSettings({ panelOpen: false })
          }} />}
      </div>

      <header className="workspace-header">
        {!isEmbed && <BrandStrip />}
        {isMockPreview ? <>
          <button className="workspace-project-back" onClick={() => navigateMock('projects')}
            aria-label="プロジェクト一覧へ戻る">← <span>一覧</span></button>
          <MockProjectTitle title={projectTitle} />
        </> : <button className="workspace-project-button" title="プロジェクトを保存・切り替える"
          aria-label={`${projectTitle?.trim() || '新規プロジェクト'}。保存・切り替えを開く`}
          onClick={() => useStore.getState().updateSettings({ scenePanelOpen: true, panelOpen: false })}>
          {projectTitle?.trim() || '新規プロジェクト'} ▾
        </button>}
        {!isMockPreview && <span className="workspace-scene-name" title={[projectTitle, scenePath].filter(Boolean).join(' › ')}>{scenePath}</span>}
        <div className="workspace-header-actions">
          {isMockPreview && <MockHistoryButtons />}
          {isMockPreview && <MockSaveButton />}
          {!isMockPreview && <button className={'plan-board-toggle' + (planOpen ? ' active' : '')}
            aria-expanded={planOpen} aria-controls="plan-board"
            onClick={() => {
              setPlanOpen(open => !open)
              if (window.innerWidth <= 960) useStore.getState().updateSettings({ panelOpen: false })
            }}>{planOpen ? '演出プランを閉じる' : '平面図・演出プラン'}</button>}
          {isMockPreview && <button className="workspace-play-button" onClick={startPlayback}>▶ 通しで見る</button>}
          {/* 設定は、アカウントのアイコンのメニューに入れた（AccountMenu）。アイコンが無い埋め込みと旧画面だけここに出す */}
          {(isEmbed || !isMockPreview) && <button onClick={() => useStore.getState().updateSettings({ settingsOpen: true })} aria-label="設定">⚙</button>}
          {!isMockPreview && <button onClick={() => useStore.getState().updateSettings({ showHelp: true })} aria-label="ヘルプ">?</button>}
        </div>
        {isMockPreview && !isEmbed && <AccountMenu onOpenSettings={() => useStore.getState().updateSettings({ settingsOpen: true })} />}
      </header>
      {isMockPreview && !playbackOpen && <nav className="mobile-workspace-views" aria-label="編集画面の切り替え">
        <button aria-pressed={mobileView === 'stage'} onClick={() => { setMobileView('stage'); setDisplayMenuOpen(false) }}>3Dで確認</button>
        <button aria-pressed={mobileView === 'plan'} onClick={() => { setMobileView('plan'); setMapVisible(true); setDisplayMenuOpen(false) }}>平面図で配置</button>
      </nav>}
      {isMockPreview && workspaceFeedback && <WorkspaceNotice>{workspaceFeedback}</WorkspaceNotice>}
      {!isEmbed && <LegalFooter />}
      {!isEmbed && !isMockPreview && <AccountMenu floating />}

      <div className="toolbar">
        {deskLayout && <div className="desk-view-switch" role="group" aria-label="見え方">
          {([['3d', '3D', '3D だけ'], ['plan', '平面図', '平面図だけ'], ['both', '上下', '3D と平面図を上下に並べる'], ['side', '左右', '3D と平面図を左右に並べる']] as const).map(([key, label, title]) =>
            <button key={key} type="button" aria-pressed={(mapVisible ? deskView : '3d') === key} title={title} aria-label={title}
              onClick={() => setDeskView(key)}>{label}</button>)}
        </div>}
        {isMockPreview && <>
          <div className="workspace-display-menu-wrap" ref={displayMenuRef}>
            <button className={'workspace-display-trigger' + (displayMenuOpen ? ' active' : '')}
              aria-expanded={displayMenuOpen} aria-haspopup="true"
              onClick={event => {
                const rect = event.currentTarget.getBoundingClientRect()
                setDisplayMenuPosition({ left: Math.max(8, Math.min(rect.left, window.innerWidth - 230)), top: rect.bottom + 8 })
                setDisplayMenuOpen(value => !value)
              }}>表示 <span aria-hidden="true">⌄</span></button>
          </div>
          <span className="toolbar-divider" aria-hidden="true" />
        </>}
        {/* 上の帯は「見え方・表示・道具・視点」だけにする（2026-11-18 オーナー「メニューも増えすぎてよくわからん」）。
            照明の本体／狙いの切り替えは、右の設定欄と 3D の球で行う */}
        <ToolButtons />
        <span className="toolbar-divider" aria-hidden="true" />
        <ViewSelect hasHouse={hasAudienceBlocks} />
        <HouseLightsToggle />
        {!isMockPreview && <XRButton />}
      </div>
      {isMockPreview && displayMenuOpen && <div className="workspace-display-menu" ref={displayMenuPanelRef}
        aria-label="表示するもの" style={displayMenuPosition}>
        <strong>表示するもの</strong>
        <button type="button" aria-pressed={outlineVisible} onClick={() => { setOutlineVisible(value => !value); setDisplayMenuOpen(false) }}>
          <span aria-hidden="true">{outlineVisible ? '✓' : ''}</span>シーン一覧</button>
        <button type="button" aria-pressed={mapVisible} onClick={() => { if (deskLayout) setDeskView(mapVisible ? '3d' : 'both'); else setMapVisible(value => !value); setDisplayMenuOpen(false) }}>
          <span aria-hidden="true">{mapVisible ? '✓' : ''}</span>平面図</button>
        {deskLayout && <button type="button" aria-pressed={!inspectorHidden} onClick={() => { setInspectorHidden(!inspectorHidden); setDisplayMenuOpen(false) }}>
          <span aria-hidden="true">{inspectorHidden ? '' : '✓'}</span>舞台の編集（右の欄）</button>}
        {deskLayout && <button type="button" aria-pressed={consoleOpen} onClick={() => { setConsoleOpen(!consoleOpen); setDisplayMenuOpen(false) }}>
          <span aria-hidden="true">{consoleOpen ? '✓' : ''}</span>卓（試作）</button>}
        <button type="button" aria-pressed={showSceneDirections} onClick={() => { setShowSceneDirections(value => !value); setDisplayMenuOpen(false) }}>
          <span aria-hidden="true">{showSceneDirections ? '✓' : ''}</span>前の場面からの矢印</button>
      </div>}

      {phoneLayout && !playbackOpen && <PhoneChrome title={projectTitle ?? ''} view={mobileView}
        onView={next => { setMobileView(next); if (next === 'plan') setMapVisible(true) }}
        onBack={() => navigateMock('projects')} onPlay={startPlayback} />}
      {!playbackOpen && <ControlPanel planOpen={planOpen} />}
      {deskLayout && consoleOpen && !playbackOpen && <ConsoleDesk onClose={() => setConsoleOpen(false)} />}
      {deskLayout && !outlineVisible && !playbackOpen && <button type="button" className="outline-reopen" onClick={() => setOutlineVisible(true)}
        title="左の「公演の流れ」（章と場面の一覧）を開く">公演の流れ ›</button>}
      {deskLayout && inspectorHidden && !playbackOpen && <button type="button" className="inspector-reopen" onClick={() => setInspectorHidden(false)}
        title="右の「舞台の編集」の欄を開く">舞台の編集 ‹</button>}
      {!playbackOpen && <ScenePanel />}
      {!playbackOpen && <ObjectContextMenu />}
      {!playbackOpen && <SettingsModal />}
      {!playbackOpen && <PlanBoard open={planOpen} persistent={isMockPreview}
        onClose={() => setPlanOpen(false)} onPlay={startPlayback}
        onCloseOutline={() => setOutlineVisible(false)} onCloseMap={() => { setMapVisible(false); setMobileView('stage'); if (deskLayout) setDeskView('3d') }}
        showDirections={showSceneDirections} onToggleDirections={() => setShowSceneDirections(value => !value)}
        sceneEditorOpen={sceneEditorOpen} onOpenSceneEditor={() => setSceneEditorOpen(true)}
        onCloseSceneEditor={() => setSceneEditorOpen(false)}
      />}
      {playbackOpen && <StagePlayback onClose={() => setPlaybackOpen(false)} simplified={isMockPreview} />}
      {!playbackOpen && <HelpOverlay />}

      {!playbackOpen && <SelectionStatusHint />}
      {/* 右のパネルを開いているときは、パネルの中に出す（3D の画面に重ねない）。閉じているときだけ画面の下に出す */}
      {!phoneLayout && !playbackOpen && <ChangeScopeBar />}
      {!isEmbed && <KeyHint />}
    </div>}
    {adFooter && <footer className="ad-footer" aria-label="広告">
      <AdSlot width={300} height={50} />
      <a href="/pro">Pro プランにすると、広告が出なくなります</a>
    </footer>}
    </OnlineWorkspace>
  )
}

function CloudProjectAutosave() {
  const editor = useProjectEditor()
  const { user, connectionError } = useCloudSession()
  const { cloudDirty, saveStatus } = useMockWorkspaceState()
  const [attempt, setAttempt] = useState(0)
  const [error, setError] = useState('')
  const failedSnapshot = useRef('')
  const inFlight = useRef(false)
  const serverRetries = useRef(0)
  const generation = useRef(0)
  const activeId = getActiveCloudProject()?.id
  useEffect(() => { if (!connectionError) failedSnapshot.current = '' }, [connectionError])
  useEffect(() => {
    generation.current += 1
    failedSnapshot.current = ''
    setError('')
  }, [activeId, user?.id, editor.epoch])
  useEffect(() => {
    const active = getActiveCloudProject()
    if (!user || !active || !cloudDirty || !canEditProject(active.id) || saveStatus !== 'saved' || connectionError || !navigator.onLine) return
    if (currentWorkspaceSnapshot() === failedSnapshot.current || inFlight.current) return
    const startedGeneration = generation.current
    const timer = window.setTimeout(async () => {
      const current = getActiveCloudProject()
      if (!current || current.id !== active.id || !canEditProject(current.id) || inFlight.current || !navigator.onLine) return
      const editorEpoch = getProjectEditorEpoch()
      const snapshot = currentWorkspaceSnapshot()
      inFlight.current = true
      const name = useStore.getState().productionPlan.projectTitle?.trim() || current.name
      try {
        const updated = await updateCloudProject(current.id, current.revision, name, exportScene(name))
        if (getActiveCloudProject()?.id !== current.id || generation.current !== startedGeneration || getProjectEditorEpoch() !== editorEpoch) return
        setActiveCloudProject({ id: current.id, name: updated.name, revision: updated.revision })
        markCloudSaved(snapshot)
        setError('')
        failedSnapshot.current = ''
        serverRetries.current = 0
      } catch (cause) {
        if (getActiveCloudProject()?.id !== current.id || generation.current !== startedGeneration || getProjectEditorEpoch() !== editorEpoch) return
        if (cause instanceof CloudError && (cause.status === 423 || cause.status === 409)) { void loseProjectEditor(); return }
        // サーバーの一時的な失敗（500 など）は、知らせずに 2 回までやり直す（finally で attempt が進み、2.2 秒後にもう一度保存する）
        if (cause instanceof CloudError && cause.status >= 500 && serverRetries.current < 2) { serverRetries.current += 1; return }
        serverRetries.current = 0
        failedSnapshot.current = snapshot
        void refreshSession()
        setError('クラウドに保存できませんでした。現在の編集内容はこのブラウザ／アプリに保持しています。')
      } finally {
        inFlight.current = false
        setAttempt(value => value + 1)
      }
    }, 2200)
    return () => window.clearTimeout(timer)
  }, [user?.id, activeId, cloudDirty, saveStatus, attempt, connectionError, editor.status, editor.epoch, editor.deadline])
  return error ? <WorkspaceNotice kind="alert">{error}</WorkspaceNotice> : null
}

function MockProjectTitle({ title }: { title?: string }) {
  const { saveStatus, cloudDirty } = useMockWorkspaceState()
  const cloud = getActiveCloudProject()
  return <>
    <ProjectTitleEdit className="workspace-project-title" fallback="名称未設定" />
    <span className={'workspace-save-state' + (saveStatus !== 'saved' ? ' changed' : '')} role="status">
      {saveStatus === 'saving' ? '自動保存中…' : saveStatus === 'error' ? '保存できません' : cloud ? cloudDirty ? 'アカウントへの保存待ち' : 'アカウントに保存済み' : hasDeviceStorage() ? '' : 'ブラウザに一時保存'}</span>
  </>
}

function MockSaveButton() {
  const { saveStatus } = useMockWorkspaceState()
  const { user } = useCloudSession()
  // ブラウザでは、押して意味があるときだけ出す: ログインしていて、まだアカウントに入れていないプロジェクト。
  // ログインしていないときや、アカウントに保存済み（以後は自動保存）のときは、押しても保存するものが無い
  if (!hasDeviceStorage() && (!user || getActiveCloudProject())) return null
  const label = hasDeviceStorage() ? getActiveSavedProjectName() ? '別名で保存' : '名前をつけて保存' : 'アカウントに保存'
  return <button className={'workspace-save-button' + (saveStatus === 'error' ? ' has-changes' : '')}
    aria-label={label} onClick={() => useStore.getState().updateSettings({ scenePanelOpen: true, panelOpen: false })}>
    <span>{label}</span></button>
}

function MockHistoryButtons() {
  const { canUndo, canRedo } = useMockWorkspaceState()
  return <div className="workspace-history" role="group" aria-label="編集履歴">
    <button type="button" disabled={!canUndo} title="元に戻す（⌘/Ctrl+Z）"
      aria-label="元に戻す" onClick={undoMockWorkspace}>↶</button>
    <button type="button" disabled={!canRedo} title="やり直す（⌘/Ctrl+Shift+Z）"
      aria-label="やり直す" onClick={redoMockWorkspace}>↷</button>
  </div>
}

function MockSceneIndicator({ outlineVisible, onToggleOutline }: { outlineVisible: boolean, onToggleOutline: () => void }) {
  const plan = useStore(state => state.productionPlan)
  const selectScene = useStore(state => state.selectScene)
  const { saveStatus, cloudDirty } = useMockWorkspaceState()
  const index = plan.scenes.findIndex(item => item.id === plan.activeSceneId)
  const scene = plan.scenes[index]
  if (!scene) return null
  return <div className="workspace-current-scene" aria-label="現在のシーン">
    <button type="button" aria-label="前のシーン" disabled={index <= 0}
      onClick={() => selectScene(plan.scenes[index - 1].id)}>←</button>
    <button type="button" className="workspace-current-scene-picker" aria-expanded={outlineVisible}
      aria-controls="plan-outline" aria-label={`${sceneDisplayTitle(plan, scene.id)}。シーン一覧を${outlineVisible ? '閉じる' : '開く'}`}
      onClick={onToggleOutline}><small>シーン一覧 <span aria-hidden="true">▾</span></small>
      <strong aria-live="polite">{sceneDisplayTitle(plan, scene.id)}</strong>
      <span className="workspace-current-save">{saveStatus === 'saving' ? '自動保存中…' : saveStatus === 'error' ? '保存できません' : getActiveCloudProject() ? cloudDirty ? 'アカウントへの保存待ち' : 'アカウントに保存済み' : hasDeviceStorage() ? '' : 'ブラウザに一時保存'}</span></button>
    <button type="button" aria-label="次のシーン" disabled={index >= plan.scenes.length - 1}
      onClick={() => selectScene(plan.scenes[index + 1].id)}>→</button>
  </div>
}

function LegalFooter() {
  return (
    <div className="legal-footer-mini" aria-label="法務情報">
      <a href="/pro">Pro</a>
      <span>・</span>
      <a href="/contact">お問い合わせ</a>
      <span>・</span>
      <a href="/terms">利用規約</a>
      <span>・</span>
      <a href="/privacy">プライバシー</a>
      <span>・</span>
      <a href="/tokushoho">特商法表記</a>
    </div>
  )
}

function BrandStrip() {
  return (
    <div className="brand-strip">
      <a href="/" className="brand-link" title="TOMOSHIBI小屋 トップへ">
        <LanternMark className="brand-lantern" size={16} />
        <span className="brand-mark">TOMOSHIBI<span className="brand-jp">小屋</span></span>
      </a>
      <span className="brand-sep" />
      <a
        href="https://gikyokutosyokan.com/"
        className="brand-sub-link"
        target="_blank"
        rel="noopener"
        title="戯曲図書館を開く"
      >
        by 戯曲図書館 <span className="brand-arrow">↗</span>
      </a>
    </div>
  )
}

function KeyHint() {
  return (
    <div className="keyhint">
      <span className="keyhint-item"><kbd>Q W E R</kbd>選択・移動・回転・拡大</span>
      <span className="keyhint-item"><kbd>1-4</kbd>視点</span>
      <span className="keyhint-item"><kbd>P</kbd>照度計測</span>
      <span className="keyhint-item"><kbd>H</kbd>ヘルプ</span>
      <span className="keyhint-item"><kbd>Esc</kbd>選択解除</span>
      <span className="keyhint-item"><kbd>Del</kbd>削除</span>
    </div>
  )
}

/** 右ボタンを押している間（Unity と同じ）。この間だけ WASD・QE で視点を動かし、Q/W/E/R の道具の切り替えはしない */
let cameraFlying = false

// 矢印キーで OrbitControls をパン。右ボタンを押している間は WASD・QE も使う
function CameraKeyboardPan() {
  const { camera, controls } = useThree() as any
  const pressed = useRef<Set<string>>(new Set())
  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement
      if (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT') return
      pressed.current.add(e.key.toLowerCase())
    }
    const up = (e: KeyboardEvent) => pressed.current.delete(e.key.toLowerCase())
    const press = (e: PointerEvent) => { if (e.button === 2) cameraFlying = true }
    const release = (e: PointerEvent) => { if (e.button === 2) cameraFlying = false }
    const blur = () => { cameraFlying = false; pressed.current.clear() }
    window.addEventListener('keydown', down)
    window.addEventListener('keyup', up)
    window.addEventListener('pointerdown', press)
    window.addEventListener('pointerup', release)
    window.addEventListener('blur', blur)
    return () => {
      window.removeEventListener('keydown', down); window.removeEventListener('keyup', up)
      window.removeEventListener('pointerdown', press); window.removeEventListener('pointerup', release)
      window.removeEventListener('blur', blur)
    }
  }, [])
  useEffect(() => {
    if (!controls) return
    let raf: number
    const tick = () => {
      const ks = pressed.current
      const ctl: any = controls
      const speed = 0.06
      let mx = 0, my = 0, mz = 0
      const fly = cameraFlying
      if ((fly && ks.has('w')) || ks.has('arrowup')) mz -= speed
      if ((fly && ks.has('s')) || ks.has('arrowdown')) mz += speed
      if ((fly && ks.has('a')) || ks.has('arrowleft')) mx -= speed
      if ((fly && ks.has('d')) || ks.has('arrowright')) mx += speed
      if (fly && ks.has('q')) my -= speed
      if (fly && ks.has('e')) my += speed
      if (mx || my || mz) {
        const forward = new THREE.Vector3()
        camera.getWorldDirection(forward)
        forward.y = 0; forward.normalize()
        const right = new THREE.Vector3().crossVectors(forward, new THREE.Vector3(0, 1, 0)).normalize()
        const delta = new THREE.Vector3()
          .addScaledVector(forward, -mz)
          .addScaledVector(right, mx)
          .addScaledVector(new THREE.Vector3(0, 1, 0), my)
        camera.position.add(delta)
        ctl.target.add(delta)
        ctl.update()
      }
      raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [controls, camera])
  return null
}

// プローブモード時のクリック捕捉
function ProbeClickCatcher() {
  const probe = useStore(s => s.settings.probeMode)
  const onClick = useProbeClickHandler()
  if (!probe) return null
  return (
    <mesh
      rotation={[-Math.PI / 2, 0, 0]}
      position={[0, 0.001, 0]}
      onClick={onClick as any}
    >
      <planeGeometry args={[40, 40]} />
      <meshBasicMaterial transparent opacity={0} />
    </mesh>
  )
}

function HouseLightsToggle() {
  const on = useStore(s => s.settings.showHouseLights)
  const update = useStore(s => s.updateSettings)
  return (
    <button
      onClick={() => update({ showHouseLights: !on })}
      style={{ background: on ? 'rgba(212, 175, 111, 0.25)' : undefined }}
      title="客電 (house lights) のON/OFF"
    >
      客電 {on ? 'ON' : 'OFF'}
    </button>
  )
}

const VIEW_CHOICES = [
  ['audience', '客席', '1'], ['aerial', '上から', '2'], ['sidewing', '袖', '3'], ['free', '自由', '4'], ['house', '客席全体', '5'],
] as const

/** 視点の選択。5 つのボタンを並べず、1 つの選択欄にする。数字キー 1〜5 でも切り替えられる */
function ViewSelect({ hasHouse }: { hasHouse: boolean }) {
  const cur = useStore(s => s.settings.cameraView)
  const update = useStore(s => s.updateSettings)
  return <label className="toolbar-view-select" title="視点（キー 1〜5）">
    <span>視点</span>
    <select value={cur} onChange={event => update({ cameraView: event.target.value as any })}>
      {VIEW_CHOICES.filter(([view]) => view !== 'house' || hasHouse || cur === 'house').map(([view, label, key]) =>
        <option key={view} value={view}>{label}（{key}）</option>)}
    </select>
  </label>
}

function SelectionStatusHint() {
  const selection = useStore(s => s.selection)
  const probeMode = useStore(s => s.settings.probeMode)
  if (probeMode) {
    return <div className="empty-selection-hint">照度計測モード — 舞台上をクリックして lux 値を測定</div>
  }
  if (selection.kind) return null
  return (
    <div className="empty-selection-hint">
      右パネルから器具/役者を追加、または 3D シーン内をクリックして選択
    </div>
  )
}

/** PC の幅か（画面に固定する広告は PC だけに出す） */
/** スマホの幅（600px 以下）。編集画面を PC とは別の作り（PhoneChrome）にする */
function usePhone() {
  const query = '(max-width: 600px)'
  const [phone, setPhone] = useState(() => window.matchMedia(query).matches)
  useEffect(() => {
    const list = window.matchMedia(query)
    const change = () => setPhone(list.matches)
    list.addEventListener('change', change)
    return () => list.removeEventListener('change', change)
  }, [])
  return phone
}

function useWideScreen() {
  const query = '(min-width: 961px)'
  const [wide, setWide] = useState(() => typeof window !== 'undefined' && window.matchMedia(query).matches)
  useEffect(() => {
    const media = window.matchMedia(query)
    const change = () => setWide(media.matches)
    media.addEventListener('change', change)
    return () => media.removeEventListener('change', change)
  }, [])
  return wide
}

/**
 * スマホ・タブレットで、2 本指をひねると舞台を中心に視点を回す（2026-11-17 オーナー指摘）。
 * 広げる・つまむ（ズーム）と 2 本指の移動は OrbitControls のまま。ひねった角度だけ、狙う点のまわりで回す
 */
function TouchTwist() {
  const gl = useThree(state => state.gl)
  const camera = useThree(state => state.camera)
  const controls = useThree(state => state.controls) as unknown as { target: THREE.Vector3; update: () => void } | null
  useEffect(() => {
    const element = gl.domElement
    let last: number | null = null
    const angle = (touches: TouchList) => Math.atan2(touches[1].clientY - touches[0].clientY, touches[1].clientX - touches[0].clientX)
    const start = (event: TouchEvent) => { last = event.touches.length === 2 ? angle(event.touches) : null }
    const move = (event: TouchEvent) => {
      if (event.touches.length !== 2 || last === null || !controls) return
      const now = angle(event.touches)
      let delta = now - last
      if (delta > Math.PI) delta -= Math.PI * 2
      if (delta < -Math.PI) delta += Math.PI * 2
      last = now
      // 指を時計回りにひねると、舞台も時計回りに回って見える（カメラは逆向きに回る）
      const offset = camera.position.clone().sub(controls.target)
      offset.applyAxisAngle(new THREE.Vector3(0, 1, 0), delta)
      camera.position.copy(controls.target).add(offset)
      camera.lookAt(controls.target)
      controls.update()
    }
    const end = (event: TouchEvent) => { if (event.touches.length < 2) last = null }
    element.addEventListener('touchstart', start, { passive: true })
    element.addEventListener('touchmove', move, { passive: true })
    element.addEventListener('touchend', end)
    element.addEventListener('touchcancel', end)
    return () => {
      element.removeEventListener('touchstart', start)
      element.removeEventListener('touchmove', move)
      element.removeEventListener('touchend', end)
      element.removeEventListener('touchcancel', end)
    }
  }, [gl, camera, controls])
  return null
}
