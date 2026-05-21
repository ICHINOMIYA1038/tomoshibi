import { useEffect, useMemo, useState, useRef } from 'react'
import { Canvas, useThree } from '@react-three/fiber'
import { OrbitControls, PerspectiveCamera } from '@react-three/drei'
import * as THREE from 'three'
import { Stage } from './scene/Stage'
import { PerformerMeshes } from './scene/PerformerMesh'
import { FixtureMeshes } from './scene/FixtureMesh'
import { RenderPipeline, type OccluderSpec } from './scene/RenderPipeline'
import { SelectionGizmo } from './scene/SelectionGizmo'
import { PhotometricProbe, useProbeClickHandler } from './scene/PhotometricProbe'
import { SetPieces } from './scene/SetPieces'
import { XRButton, XRGLBinder } from './scene/XRSupport'
import { ControlPanel } from './ui/ControlPanel'
import { HelpOverlay } from './ui/HelpOverlay'
import { SettingsModal } from './ui/SettingsModal'
import { useStore, performerToOccluders } from './store'
import { FIXTURE_PROFILES, type FixtureProfile } from './lighting/fixtureTypes'
import { tryLoadFromHash } from './io/sceneIO'

const CAMERA_VIEWS: Record<string, { pos: [number, number, number]; target: [number, number, number] }> = {
  audience: { pos: [0, 2.5, 10], target: [0, 2.5, -2] },
  aerial: { pos: [0, 12, 8], target: [0, 1.5, -3] },
  sidewing: { pos: [-9, 3, 4], target: [1, 2, -2] },
  free: { pos: [4, 4, 8], target: [0, 2, -2] },
}

const STATIC_OCCLUDERS: OccluderSpec[] = [
  { pos: [-2, 0.3, -3], axis: [0, 1, 0], radius: 1.4, halfHeight: 0 },
  { pos: [2.5, 0.5, -4], axis: [0, 1, 0], radius: 1.3, halfHeight: 0 },
]

const isEmbed = new URLSearchParams(location.search).has('embed')

export default function App() {
  const [stageMaterials, setStageMaterials] = useState<THREE.ShaderMaterial[]>([])
  const [performerMaterials, setPerformerMaterials] = useState<THREE.ShaderMaterial[]>([])
  const settings = useStore(s => s.settings)
  const performers = useStore(s => s.performers)
  const select = useStore(s => s.select)
  const view = CAMERA_VIEWS[settings.cameraView] ?? CAMERA_VIEWS.audience

  // embed クラス付与
  useEffect(() => {
    if (isEmbed) document.body.classList.add('embed')
    else document.body.classList.remove('embed')
  }, [])

  // 初回: URL hashからシーン読込 / GDTF動的プロファイル登録窓口
  useEffect(() => {
    tryLoadFromHash()
    ;(window as any).__addGDTFProfile = (key: string, profile: FixtureProfile) => {
      ;(FIXTURE_PROFILES as any)[key] = profile
    }
  }, [])

  // キーボードショートカット
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement
      if (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT') return
      const k = e.key.toLowerCase()
      const s = useStore.getState()
      const up = s.updateSettings
      switch (k) {
        case '1': up({ cameraView: 'audience' }); break
        case '2': up({ cameraView: 'aerial' }); break
        case '3': up({ cameraView: 'sidewing' }); break
        case '4': up({ cameraView: 'free' }); break
        case 'escape': s.select(null, null); break
        case '?': case '/': up({ showHelp: !s.settings.showHelp }); break
        case 'h': up({ showHelp: !s.settings.showHelp }); break
        case 'p': up({ probeMode: !s.settings.probeMode }); break
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
  }, [])

  const allMaterials = useMemo(
    () => [...stageMaterials, ...performerMaterials],
    [stageMaterials, performerMaterials],
  )
  const dynamicOccluders = useMemo(() => {
    const arr = [...STATIC_OCCLUDERS]
    for (const p of performers) arr.push(...performerToOccluders(p))
    return arr.slice(0, 12)
  }, [performers])

  return (
    <>
      <div className="canvas-wrap">
        <Canvas
          gl={{
            antialias: true,
            powerPreference: 'high-performance',
            preserveDrawingBuffer: false,
          }}
          dpr={[1, 1.5]}
          onPointerMissed={() => select(null, null)}
        >
          <PerspectiveCamera key={`cam-${settings.cameraView}`} makeDefault position={view.pos} fov={45} near={0.1} far={100} />
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
            maxDistance={40}
            maxPolarAngle={Math.PI * 0.49}
            enablePan
          />
          <CameraKeyboardPan />

          <hemisphereLight args={['#3a2a20', '#1a1208', 0.35]} />

          {settings.showStage && <Stage onMaterialsReady={setStageMaterials} />}
          {settings.showPerformers && <PerformerMeshes onMaterialsReady={setPerformerMaterials} />}
          {settings.showFixtureMeshes && <FixtureMeshes />}
          <SetPieces />
          <SelectionGizmo />
          <PhotometricProbe />
          <ProbeClickCatcher />

          <XRGLBinder />
          <RenderPipeline stageMaterials={allMaterials} occluders={dynamicOccluders} />
        </Canvas>
      </div>

      {!isEmbed && <BrandStrip />}

      <div className="toolbar">
        <ViewButton view="audience" label="客席" hint="1" />
        <ViewButton view="aerial" label="俯瞰" hint="2" />
        <ViewButton view="sidewing" label="袖" hint="3" />
        <ViewButton view="free" label="自由" hint="4" />
        <XRButton />
      </div>

      <ControlPanel />
      <SettingsModal />
      <HelpOverlay />

      <SelectionStatusHint />
      {!isEmbed && <KeyHint />}
    </>
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
