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
import { useStore } from './store'
import { useCloudSession } from './io/cloudSession'
import { loginUrl, signupUrl, logoutUrl, createBillingPortal, CloudError } from './io/cloud'
import { ScenePanel } from './ui/ScenePanel'
import { WebGLErrorBoundary } from './ui/WebGLErrorBoundary'

const isMobile = typeof window !== 'undefined' && window.matchMedia('(max-width: 768px)').matches
import { FIXTURE_PROFILES, type FixtureProfile } from './lighting/fixtureTypes'
import { tryLoadFromHash } from './io/sceneIO'

const CAMERA_VIEWS: Record<string, { pos: [number, number, number]; target: [number, number, number] }> = {
  audience: { pos: [0, 2.5, 10], target: [0, 2.5, -2] },
  aerial: { pos: [0, 12, 8], target: [0, 1.5, -3] },
  sidewing: { pos: [-9, 3, 4], target: [1, 2, -2] },
  free: { pos: [4, 4, 8], target: [0, 2, -2] },
}

const isEmbed = new URLSearchParams(location.search).has('embed')

export default function App() {
  const settings = useStore(s => s.settings)
  const select = useStore(s => s.select)
  const view = CAMERA_VIEWS[settings.cameraView] ?? CAMERA_VIEWS.audience
  const noopMaterials = () => {}

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
  }, [])

  return (
    <>
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
            gl.toneMappingExposure = 0.45 * (settings.exposure ?? 1.0)
          }}
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

          <ambientLight intensity={settings.ambient ?? 0.05} color={'#3a2a20'} />
          <hemisphereLight args={['#3a2a20', '#1a1208', 0.2]} />
          {settings.showHouseLights && (
            <>
              <ambientLight intensity={0.55} color={'#fde0b8'} />
              <directionalLight position={[0, 8, 6]} intensity={0.7} color={'#fde0b8'} />
            </>
          )}

          {settings.showStage && <Stage onMaterialsReady={noopMaterials} />}
          {settings.showPerformers && <PerformerMeshes onMaterialsReady={noopMaterials} />}
          {settings.showFixtureMeshes && <FixtureMeshes />}
          <SetPieces />
          <Beams />
          <SelectionGizmo />
          <PhotometricProbe />
          <ProbeClickCatcher />

          <XRGLBinder />
        </Canvas>
       </WebGLErrorBoundary>
      </div>

      {!isEmbed && <BrandStrip />}
      {!isEmbed && <LegalFooter />}
      {!isEmbed && <AccountMenu />}

      <div className="toolbar">
        <ViewButton view="audience" label="客席" hint="1" />
        <ViewButton view="aerial" label="俯瞰" hint="2" />
        <ViewButton view="sidewing" label="袖" hint="3" />
        <ViewButton view="free" label="自由" hint="4" />
        <HouseLightsToggle />
        <XRButton />
      </div>

      <ControlPanel />
      {!isMobile && <ScenePanel />}
      <SettingsModal />
      <HelpOverlay />

      <FixtureGizmoToolbar />
      <SelectionStatusHint />
      {!isEmbed && <KeyHint />}
    </>
  )
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
