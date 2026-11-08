import { useEffect, useRef, useState } from 'react'
import { Canvas, useThree } from '@react-three/fiber'
import { OrbitControls, PerspectiveCamera } from '@react-three/drei'
import * as THREE from 'three'
import { Stage } from './scene/Stage'
import { PerformerMeshes } from './scene/PerformerMesh'
import { FixtureMeshes } from './scene/FixtureMesh'
import { Beams } from './scene/Beams'
import { SelectionGizmo } from './scene/SelectionGizmo'
import { PhotometricProbe, useProbeClickHandler } from './scene/PhotometricProbe'
import { SetPieces } from './scene/SetPieces'
import { XRButton, XRGLBinder } from './scene/XRSupport'
import { ControlPanel } from './ui/ControlPanel'
import { HelpOverlay } from './ui/HelpOverlay'
import { SettingsModal } from './ui/SettingsModal'
import { sceneDisplayTitle, useStore } from './store'
import { useCloudSession } from './io/cloudSession'
import { loginUrl, signupUrl, logoutUrl, createBillingPortal, CloudError } from './io/cloud'
import { ScenePanel } from './ui/ScenePanel'
import { PlanBoard } from './ui/PlanBoard'
import { ProjectLibrary } from './ui/ProjectLibrary'
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
import { createRainLibraryPlan } from './demo/createRainLibraryPlan'
import { createRainLibraryLightingStudyPlan } from './demo/createRainLibraryLightingStudyPlan'
import { createAkaoniPlan } from './demo/createAkaoniPlan'
import { createAkaoniWashPlan } from './demo/createAkaoniWashPlan'
import { createAkaoniLightingStudyPlan } from './demo/createAkaoniLightingStudyPlan'
import { createVenueStudyPlan, VENUE_STUDY_LINKS } from './demo/createVenueStudyPlans'
import { AudienceSeating } from './scene/AudienceSeating'
import { isWorkspaceLibraryPath, isWorkspacePath, workspaceBasePath } from './io/workspacePath'

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
  const [outlineVisible, setOutlineVisible] = useState(window.innerWidth > 960)
  const [showSceneDirections, setShowSceneDirections] = useState(!isMockPreview)
  const [displayMenuOpen, setDisplayMenuOpen] = useState(false)
  const [displayMenuPosition, setDisplayMenuPosition] = useState({ left: 14, top: 104 })
  const [sceneEditorOpen, setSceneEditorOpen] = useState(false)
  const displayMenuRef = useRef<HTMLDivElement>(null)
  const displayMenuPanelRef = useRef<HTMLDivElement>(null)
  const [workspaceFeedback, setWorkspaceFeedback] = useState('')
  const [playbackOpen, setPlaybackOpen] = useState(false)
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
    const wantsDemo = demo === '1' || demo === '2' || demo === 'rain-library-study' || demo === 'akaoni' || demo === 'akaoni-wash' || demo === 'akaoni-study' || !!venueStudy
    const loadDemo = wantsDemo && preserveMockDraftBeforeDemo()
    if (wantsDemo && !loadDemo) setWorkspaceFeedback('前のプランを保存できなかったため、デモを開きませんでした。')
    if (loadDemo && demo === '1') createShowcasePlan()
    else if (loadDemo && demo === '2') createRainLibraryPlan()
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
        case 'escape': if (planOpen) setPlanOpen(false); else s.select(null, null); break
        case '?': case '/': up({ showHelp: !s.settings.showHelp }); break
        case 'h': up({ showHelp: !s.settings.showHelp }); break
        case 'p': up({ probeMode: !s.settings.probeMode }); break
        case 'g': if (s.selection.kind === 'fixture') up({ transformMode: 'translate' }); break
        case 'r': if (s.selection.kind === 'fixture') up({ transformMode: 'rotate' }); break
        case 'delete': case 'backspace': {
          if (s.selection.kind === 'fixture' && s.selection.id) s.removeFixture(s.selection.id)
          else if (s.selection.kind === 'performer' && s.selection.id) s.removePerformer(s.selection.id)
          break
        }
        case 'd': {
          // Cmd/Ctrl+D で複製
          if ((e.metaKey || e.ctrlKey) && s.selection.kind === 'fixture' && s.selection.id) {
            e.preventDefault()
            s.duplicateFixture(s.selection.id)
          }
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

  if (isMockPreview && mockPage === 'projects') {
    return <ProjectLibrary onOpenEditor={() => navigateMock('editor')} />
  }

  return (
    <div className={'unified-shell' + (planOpen ? ' plan-open' : '') + (settings.panelOpen ? ' panel-open' : '') + (playbackOpen ? ' playback-open' : '') + (isMockPreview ? ' workspace-layout' : '') + (mapVisible ? '' : ' map-hidden') + (outlineVisible ? ' outline-visible' : '')}>
      {isMockPreview && <CloudProjectAutosave />}
      <div className="canvas-wrap">
       <WebGLErrorBoundary>
        <Canvas
          gl={{
            antialias: true,
            powerPreference: 'high-performance',
            preserveDrawingBuffer: false,
          }}
          dpr={[1, 1.5]}
          shadows="soft"
          onCreated={({ gl }) => {
            gl.toneMapping = THREE.ACESFilmicToneMapping
            gl.toneMappingExposure = EXPOSURE_SCALE * (settings.exposure ?? 1.0)
          }}
          onPointerMissed={() => select(null, null)}
        >
          <ExposureSync exposure={settings.exposure ?? 1.0} />
          <PerspectiveCamera key={`cam-${settings.cameraView}`} makeDefault position={view.pos} fov={BASE_FOV} near={0.1} far={100} />
          <ResponsiveFov />
          <OrbitControls
            key={`ctl-${settings.cameraView}`}
            makeDefault
            target={view.target}
            enableDamping
            dampingFactor={0.16}
            rotateSpeed={0.6}
            zoomSpeed={0.9}
            panSpeed={0.8}
            minDistance={1.5}
            maxDistance={100}
            maxPolarAngle={Math.PI * 0.49}
            enablePan
          />
          {!playbackOpen && <CameraKeyboardPan />}

          <ambientLight intensity={settings.ambient ?? 0.05} color={'#3a2a20'} />
          <hemisphereLight args={['#3a2a20', '#1a1208', 0.2]} />
          {settings.showHouseLights && (
            <>
              <ambientLight intensity={0.55} color={'#fde0b8'} />
              <directionalLight position={[0, 8, 6]} intensity={0.7} color={'#fde0b8'} />
            </>
          )}

          {settings.showStage && <Stage onMaterialsReady={noopMaterials} />}
          <AudienceSeating />
          {settings.showPerformers && <PerformerMeshes onMaterialsReady={noopMaterials} />}
          {settings.showFixtureMeshes && <FixtureMeshes />}
          <SetPieces />
          <Beams />
          {!playbackOpen && <SelectionGizmo />}
          <DirectionPaths visible={planOpen && !playbackOpen && showSceneDirections} />
          <PhotometricProbe />
          <ProbeClickCatcher />

          <XRGLBinder />
        </Canvas>
       </WebGLErrorBoundary>
        {isMockPreview && !playbackOpen && <MockSceneIndicator />}
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
          <button onClick={() => useStore.getState().updateSettings({ settingsOpen: true })} aria-label="設定">⚙</button>
          {!isMockPreview && <button onClick={() => useStore.getState().updateSettings({ showHelp: true })} aria-label="ヘルプ">?</button>}
        </div>
      </header>
      {isMockPreview && workspaceFeedback && <div className="workspace-feedback" role="status" aria-live="polite"><span aria-hidden="true">✓</span>{workspaceFeedback}</div>}
      {!isEmbed && <LegalFooter />}
      {!isEmbed && !isMockPreview && <AccountMenu />}

      <div className="toolbar">
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
        <span className="toolbar-label">視点</span>
        <ViewButton view="audience" label="客席" hint="1" />
        <ViewButton view="aerial" label="上から" hint="2" />
        <ViewButton view="sidewing" label="袖" hint="3" />
        <ViewButton view="free" label="自由" hint="4" />
        {hasAudienceBlocks && <ViewButton view="house" label="客席全体" hint="5" />}
        <HouseLightsToggle />
        {!isMockPreview && <XRButton />}
      </div>
      {isMockPreview && displayMenuOpen && <div className="workspace-display-menu" ref={displayMenuPanelRef}
        aria-label="表示するもの" style={displayMenuPosition}>
        <strong>表示するもの</strong>
        <button type="button" aria-pressed={outlineVisible} onClick={() => { setOutlineVisible(value => !value); setDisplayMenuOpen(false) }}>
          <span aria-hidden="true">{outlineVisible ? '✓' : ''}</span>シーン一覧</button>
        <button type="button" aria-pressed={mapVisible} onClick={() => { setMapVisible(value => !value); setDisplayMenuOpen(false) }}>
          <span aria-hidden="true">{mapVisible ? '✓' : ''}</span>平面図</button>
        <button type="button" aria-pressed={showSceneDirections} onClick={() => { setShowSceneDirections(value => !value); setDisplayMenuOpen(false) }}>
          <span aria-hidden="true">{showSceneDirections ? '✓' : ''}</span>役者の動きの矢印</button>
      </div>}

      {!playbackOpen && <ControlPanel planOpen={planOpen} />}
      {!playbackOpen && <ScenePanel />}
      {!playbackOpen && <SettingsModal />}
      {!playbackOpen && <PlanBoard open={planOpen} persistent={isMockPreview}
        onClose={() => setPlanOpen(false)} onPlay={startPlayback}
        onCloseOutline={() => setOutlineVisible(false)} onCloseMap={() => setMapVisible(false)}
        showDirections={showSceneDirections} onToggleDirections={() => setShowSceneDirections(value => !value)}
        sceneEditorOpen={sceneEditorOpen} onOpenSceneEditor={() => setSceneEditorOpen(true)}
        onCloseSceneEditor={() => setSceneEditorOpen(false)}
      />}
      {playbackOpen && <StagePlayback onClose={() => setPlaybackOpen(false)} simplified={isMockPreview} />}
      {!playbackOpen && <HelpOverlay />}

      {!playbackOpen && <FixtureGizmoToolbar />}
      {!playbackOpen && <SelectionStatusHint />}
      {!isEmbed && <KeyHint />}
    </div>
  )
}

function CloudProjectAutosave() {
  const { user } = useCloudSession()
  const { cloudDirty, saveStatus } = useMockWorkspaceState()
  const [attempt, setAttempt] = useState(0)
  const [error, setError] = useState('')
  const failedSnapshot = useRef('')
  useEffect(() => {
    const active = getActiveCloudProject()
    if (!user || !active || !cloudDirty || saveStatus !== 'saved') return
    const snapshot = currentWorkspaceSnapshot()
    if (snapshot === failedSnapshot.current) return
    const timer = window.setTimeout(async () => {
      const current = getActiveCloudProject()
      if (!current || current.id !== active.id) return
      const name = useStore.getState().productionPlan.projectTitle?.trim() || current.name
      try {
        const updated = await updateCloudProject(current.id, current.revision, name, exportScene(name))
        if (getActiveCloudProject()?.id !== current.id) return
        setActiveCloudProject({ id: current.id, name: updated.name, revision: updated.revision })
        markCloudSaved(snapshot)
        setError('')
        failedSnapshot.current = ''
        setAttempt(value => value + 1)
      } catch (cause) {
        failedSnapshot.current = snapshot
        setError(cause instanceof CloudError && cause.status === 409
          ? '別の端末で更新されています。この端末の変更は残っています。ページを開き直して内容を確認してください。'
          : 'クラウドに保存できませんでした。この端末には保存されています。')
      }
    }, 2200)
    return () => window.clearTimeout(timer)
  }, [user?.id, cloudDirty, saveStatus, attempt])
  return error ? <div className="project-library-feedback" role="alert" style={{ position: 'fixed', right: 16, bottom: 16, zIndex: 1000, maxWidth: 340 }}>{error}</div> : null
}

function MockProjectTitle({ title }: { title?: string }) {
  const { saveStatus, cloudDirty } = useMockWorkspaceState()
  const cloud = getActiveCloudProject()
  return <>
    <strong className="workspace-project-title" title={title?.trim() || '名称未設定のプロジェクト'}>
      {title?.trim() || '名称未設定'}</strong>
    <span className={'workspace-save-state' + (saveStatus !== 'saved' ? ' changed' : '')} role="status">
      {saveStatus === 'saving' ? '自動保存中…' : saveStatus === 'error' ? '保存できません' : cloud ? cloudDirty ? '端末に保存済み・クラウド同期待ち' : 'クラウドに保存済み' : 'この端末に保存済み'}</span>
  </>
}

function MockSaveButton() {
  const { saveStatus } = useMockWorkspaceState()
  const label = getActiveSavedProjectName() ? '別名で保存' : '名前をつけて保存'
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

function MockSceneIndicator() {
  const plan = useStore(state => state.productionPlan)
  const selectScene = useStore(state => state.selectScene)
  const { saveStatus } = useMockWorkspaceState()
  const index = plan.scenes.findIndex(item => item.id === plan.activeSceneId)
  const scene = plan.scenes[index]
  if (!scene) return null
  return <div className="workspace-current-scene" aria-label="現在のシーン">
    <button type="button" aria-label="前のシーン" disabled={index <= 0}
      onClick={() => selectScene(plan.scenes[index - 1].id)}>←</button>
    <div aria-live="polite"><small>現在のシーン</small>
      <strong>{sceneDisplayTitle(plan, scene.id)}</strong>
      <span className="workspace-current-save">{saveStatus === 'saving' ? '自動保存中…' : saveStatus === 'error' ? '保存できません' : 'この端末に保存済み'}</span></div>
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
        <span className="brand-flame" aria-hidden="true">✦</span>
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

function AccountMenu() {
  const { user, proAvailable, loading } = useCloudSession()
  const [open, setOpen] = useState(false)
  const [portalBusy, setPortalBusy] = useState(false)
  const [portalErr, setPortalErr] = useState('')

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false) }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open])

  const openPortal = async () => {
    setPortalBusy(true); setPortalErr('')
    try {
      const { url } = await createBillingPortal()
      window.location.href = url
    } catch (e) {
      setPortalErr(e instanceof CloudError ? e.message : String(e))
      setPortalBusy(false)
    }
  }

  if (loading) return <div className="account-menu-trigger loading" aria-hidden>…</div>

  if (!user) {
    return (
      <div className="account-menu-root">
        <a className="account-menu-trigger login" href={loginUrl()} title="ログイン">
          <span className="account-menu-avatar-fallback">👤</span>
          <span className="account-menu-trigger-label">ログイン</span>
        </a>
      </div>
    )
  }

  const isPro = user.plan === 'pro'
  const renewLabel = user.planExpiresAt
    ? new Date(user.planExpiresAt).toLocaleDateString('ja-JP', { year: 'numeric', month: 'long', day: 'numeric' })
    : null

  return (
    <div className="account-menu-root">
      <button
        className={`account-menu-trigger${open ? ' open' : ''}${isPro ? ' pro' : ''}`}
        onClick={() => setOpen(v => !v)}
        aria-expanded={open}
        aria-haspopup="menu"
        title={user.name ?? 'アカウント'}
      >
        {user.image
          ? <img src={user.image} alt="" className="account-menu-avatar" />
          : <span className="account-menu-avatar-fallback">👤</span>}
        {isPro && <span className="account-menu-pro-dot" aria-label="Pro プラン" />}
      </button>

      {open && (
        <>
          <div className="account-menu-backdrop" onClick={() => setOpen(false)} />
          <div className="account-menu-panel" role="menu">
            <header className="account-menu-header">
              {user.image && <img src={user.image} alt="" />}
              <div className="account-menu-header-body">
                <div className="account-menu-name">{user.name ?? 'ログイン中'}</div>
                <div className="account-menu-plan">
                  {isPro
                    ? <><span className="pro-badge">Pro</span>{renewLabel && <span className="account-menu-renew">〜 {renewLabel}</span>}</>
                    : <span className="account-menu-free">Free プラン</span>}
                </div>
              </div>
            </header>

            <div className="account-menu-section">
              {isPro ? (
                <>
                  <button className="account-menu-item" onClick={openPortal} disabled={portalBusy}>
                    <span className="account-menu-icon" aria-hidden>📄</span>
                    領収書・請求履歴
                  </button>
                  <button className="account-menu-item" onClick={openPortal} disabled={portalBusy}>
                    <span className="account-menu-icon" aria-hidden>💳</span>
                    支払い方法を変更
                  </button>
                  <button className="account-menu-item danger" onClick={openPortal} disabled={portalBusy}>
                    <span className="account-menu-icon" aria-hidden>✕</span>
                    Pro プランを解約
                  </button>
                  {portalBusy && <div className="account-menu-note">Stripe ポータルへ移動中…</div>}
                  {portalErr && <div className="account-menu-err">{portalErr}</div>}
                </>
              ) : proAvailable ? (
                <a className="account-menu-item upsell" href="/pro">
                  <span className="account-menu-icon" aria-hidden>✦</span>
                  Pro プランにアップグレード
                  <span className="account-menu-tail">¥300/月</span>
                </a>
              ) : (
                <a className="account-menu-item" href="/pro" style={{ opacity: 0.7 }}>
                  <span className="account-menu-icon" aria-hidden>✦</span>
                  Pro プラン(準備中)
                </a>
              )}
            </div>

            <div className="account-menu-section">
              <a className="account-menu-item" href="/pro" onClick={() => setOpen(false)}>
                <span className="account-menu-icon" aria-hidden>⚙</span>
                プラン詳細
              </a>
              <a className="account-menu-item" href="/contact" onClick={() => setOpen(false)}>
                <span className="account-menu-icon" aria-hidden>✉</span>
                お問い合わせ
              </a>
              <a className="account-menu-item" href={logoutUrl()}>
                <span className="account-menu-icon" aria-hidden>↩</span>
                ログアウト
              </a>
            </div>
          </div>
        </>
      )}
    </div>
  )
}

function KeyHint() {
  return (
    <div className="keyhint">
      <span className="keyhint-item"><kbd>1-4</kbd>視点</span>
      <span className="keyhint-item"><kbd>P</kbd>照度計測</span>
      <span className="keyhint-item"><kbd>H</kbd>ヘルプ</span>
      <span className="keyhint-item"><kbd>Esc</kbd>選択解除</span>
      <span className="keyhint-item"><kbd>Del</kbd>削除</span>
    </div>
  )
}

// WASD/矢印キーで OrbitControls をパン
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
    window.addEventListener('keydown', down)
    window.addEventListener('keyup', up)
    return () => {
      window.removeEventListener('keydown', down); window.removeEventListener('keyup', up)
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
      if (ks.has('w') || ks.has('arrowup')) mz -= speed
      if (ks.has('s') || ks.has('arrowdown')) mz += speed
      if (ks.has('a') || ks.has('arrowleft')) mx -= speed
      if (ks.has('d') || ks.has('arrowright')) mx += speed
      if (ks.has('q')) my -= speed
      if (ks.has('e')) my += speed
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

function FixtureGizmoToolbar() {
  const selection = useStore(s => s.selection)
  const mode = useStore(s => s.settings.transformMode)
  const handle = selection.fixtureHandle ?? 'position'
  const update = useStore(s => s.updateSettings)
  const select = useStore(s => s.select)
  if (selection.kind !== 'fixture' || !selection.id) return null
  return (
    <div className="gizmo-toolbar">
      <button
        className={handle === 'position' ? 'active' : ''}
        onClick={() => select('fixture', selection.id!, 'position')}
        title="光源を操作 (P)"
      >光源</button>
      <button
        className={handle === 'target' ? 'active' : ''}
        onClick={() => select('fixture', selection.id!, 'target')}
        title="狙いを操作 (T)"
      >狙い</button>
      <span className="gizmo-sep" />
      <button
        className={mode === 'translate' ? 'active' : ''}
        onClick={() => update({ transformMode: 'translate' })}
        disabled={handle === 'target'}
        title="移動 (G)"
      >移動</button>
      <button
        className={mode === 'rotate' ? 'active' : ''}
        onClick={() => update({ transformMode: 'rotate' })}
        disabled={handle === 'target'}
        title="回転 (R)"
      >回転</button>
    </div>
  )
}

function ViewButton({ view, label, hint }: { view: string; label: string; hint?: string }) {
  const cur = useStore(s => s.settings.cameraView)
  const update = useStore(s => s.updateSettings)
  return (
    <button
      onClick={() => update({ cameraView: view as any })}
      style={{ background: cur === view ? 'rgba(50, 90, 160, 0.8)' : undefined }}
      title={hint ? `キー ${hint}` : undefined}
    >
      {label}
    </button>
  )
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
