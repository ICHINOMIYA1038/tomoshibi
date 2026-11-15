import { useEffect, useRef } from 'react'
import { useStore, type Fixture } from '../store'
import { FIXTURE_PROFILES, KIND_LABELS } from '../lighting/fixtureTypes'
import { useDraggablePanel } from './useDraggablePanel'
import { MEASURED_FRESNEL_KEY } from '../photometric/measuredFresnel'
import { MEASURED_CYC_KEY } from '../photometric/measuredCyc'
import { isWorkspacePath } from '../io/workspacePath'
import { HierarchyPanel } from './HierarchyPanel'
import { Inspector } from './Inspector'

// 演劇関係者向け TOP パネル
// 上: 舞台にある物の一覧（HierarchyPanel）、下: 選んだ物の設定（Inspector）。設定は ⚙ から SettingsModal で開く

function Slider({ label, value, min, max, step, onChange, unit, fmt }: {
  label: string; value: number; min: number; max: number; step?: number;
  onChange: (v: number) => void; unit?: string; fmt?: (v: number) => string;
}) {
  return (
    <div className="row">
      <label>{label}</label>
      <input type="range" min={min} max={max} step={step ?? 0.01} value={value} onChange={e => onChange(parseFloat(e.target.value))} />
      <span className="numval">{fmt ? fmt(value) : value.toFixed(2)}{unit ?? ''}</span>
    </div>
  )
}

type BarnDoorSide = 'top' | 'right' | 'bottom' | 'left'
const BARN_DOOR_SIDES: { key: BarnDoorSide; label: string }[] = [
  { key: 'top', label: '上側' }, { key: 'right', label: '右側' },
  { key: 'bottom', label: '下側' }, { key: 'left', label: '左側' },
]

function BarnDoorEditor({ fixture, onChange }: { fixture: Fixture; onChange: (patch: Partial<Fixture>) => void }) {
  const active = fixture.barnDoorAngles !== undefined || fixture.upstageCutDeg !== undefined
  const cuts = fixture.barnDoorAngles ?? (fixture.upstageCutDeg === undefined ? {} : { top: fixture.upstageCutDeg })
  const halfField = 45 * Math.max(7, Math.min(55, fixture.beamAngleDeg)) / 28
  const amount = (side: BarnDoorSide) => cuts[side] === undefined ? 0
    : Math.max(0, Math.min(75, Math.round((halfField - cuts[side]) / (2 * halfField) * 100)))
  const setAmount = (side: BarnDoorSide, value: number) => {
    const next = { ...cuts }
    if (value === 0) delete next[side]
    else next[side] = halfField * (1 - value / 50)
    onChange({ barnDoorAngles: next, upstageCutDeg: undefined })
  }
  const left = 26 + amount('left') * 1.28
  const top = 26 + amount('top') * 1.28
  const width = 128 - (amount('left') + amount('right')) * 1.28
  const height = 128 - (amount('top') + amount('bottom')) * 1.28
  return <section className="barn-door-editor">
    <div className="barn-door-heading">
      <strong>バンドアで光を切る</strong>
      <button type="button" className={active ? 'active' : ''} aria-pressed={active}
        onClick={() => onChange({ barnDoorAngles: active ? undefined : { top: 5 }, upstageCutDeg: undefined })}>
        {active ? '使用中' : '使う'}
      </button>
    </div>
    {active && <>
      <div className="barn-door-preview" aria-label="照射範囲の形の目安">
        <svg viewBox="0 0 180 180" role="img" aria-label="中央の光を四辺から遮る図">
          <defs><clipPath id="barn-door-preview-clip"><rect x={left} y={top} width={Math.max(0, width)} height={Math.max(0, height)} /></clipPath></defs>
          <circle cx="90" cy="90" r="64" fill="#8a7860" opacity=".26" />
          <circle cx="90" cy="90" r="64" fill="#f9d39b" clipPath="url(#barn-door-preview-clip)" />
          <circle cx="90" cy="90" r="3" fill="#5e432a" />
        </svg>
        <span>光の形の目安</span>
      </div>
      <div className="barn-door-actions">
        <button type="button" onClick={() => onChange({ barnDoorAngles: { top: 2.5 }, upstageCutDeg: undefined })}>奥壁側を切る</button>
        <button type="button" onClick={() => onChange({ barnDoorAngles: {}, upstageCutDeg: undefined })}>全開に戻す</button>
      </div>
      {BARN_DOOR_SIDES.map(({ key, label }) => <div className="barn-door-slider" key={key}>
        <label htmlFor={`barn-${fixture.id}-${key}`}>{label}</label>
        <input id={`barn-${fixture.id}-${key}`} type="range" min="0" max="75" step="1" value={amount(key)}
          onChange={event => setAmount(key, Number(event.target.value))} />
        <output>{amount(key)}%</output>
      </div>)}
      <p>数値を上げると、その方向から光を切ります。照度計にも反映します。</p>
    </>}
  </section>
}

function colorToHex(rgb: [number, number, number]): string {
  const c = (v: number) => Math.round(Math.max(0, Math.min(1, v)) * 255).toString(16).padStart(2, '0')
  return '#' + c(rgb[0]) + c(rgb[1]) + c(rgb[2])
}
function hexToRgb(hex: string): [number, number, number] {
  const m = hex.replace('#', '')
  return [
    parseInt(m.slice(0, 2), 16) / 255,
    parseInt(m.slice(2, 4), 16) / 255,
    parseInt(m.slice(4, 6), 16) / 255,
  ]
}

export function ControlPanel({ planOpen = false }: { planOpen?: boolean }) {
  const settings = useStore(s => s.settings)
  const update = useStore(s => s.updateSettings)
  const open = settings.panelOpen
  const selection = useStore(s => s.selection)
  const dragStartY = useRef<number | null>(null)
  const dragDelta = useRef(0)
  const isMobile = typeof window !== 'undefined' && window.innerWidth <= 960
  const isMockPreview = isWorkspacePath()

  // PC のみドラッグ可能、モバイルは下からのボトムシート挙動を維持
  const { panelProps, handleProps } = useDraggablePanel('object', {
    x: typeof window !== 'undefined' ? window.innerWidth - 372 : 600,
    y: 12,
  })

  // 選び直したら、設定（インスペクター）が見えるところまでスクロールする
  useEffect(() => {
    if (!selection.kind) return
    requestAnimationFrame(() => document.querySelector('.object-panel .inspector')?.scrollIntoView({ block: 'nearest', behavior: 'smooth' }))
  }, [selection.kind, selection.id])

  const onHeaderTouchStart = (e: React.TouchEvent) => {
    dragStartY.current = e.touches[0].clientY
    dragDelta.current = 0
  }
  const onHeaderTouchMove = (e: React.TouchEvent) => {
    if (dragStartY.current == null) return
    dragDelta.current = e.touches[0].clientY - dragStartY.current
  }
  const onHeaderTouchEnd = () => {
    if (dragDelta.current > 60) update({ panelOpen: false })
    dragStartY.current = null
    dragDelta.current = 0
  }

  return (
    <>
      {/* モバイル用パネル開閉トグル (右下) */}
      <button
        className={'panel-fab' + (open ? ' open' : '')}
        onClick={() => update({ panelOpen: !open })}
        title="パネル表示/非表示"
        aria-label={open ? '編集パネルを閉じる' : '役者・照明・セットを編集'}
      >
        <span className={'fab-icon ' + (open ? 'fab-close' : 'fab-burger')} aria-hidden="true" /><span className="mobile-panel-label">{open ? '閉じる' : '追加・編集'}</span>
      </button>
      <div
        className={'panel object-panel' + (open ? ' open' : ' closed')}
        {...(isMobile || isMockPreview ? {} : panelProps)}
      >
        <div
          className="panel-header"
          {...(isMobile
            ? { onTouchStart: onHeaderTouchStart, onTouchMove: onHeaderTouchMove, onTouchEnd: onHeaderTouchEnd }
            : isMockPreview ? {} : handleProps)}
        >
          <div className="panel-title">舞台の編集</div>
          <div className="panel-actions">
            <button className="icon-btn" title="シーンの保存・読込" aria-label="シーンの保存・読込"
              onClick={() => update({ scenePanelOpen: true, panelOpen: false })}>保存</button>
            <button className="icon-btn" title="設定" onClick={() => update({ settingsOpen: true })}>⚙</button>
            <button className="icon-btn" title="ヘルプ" onClick={() => update({ showHelp: true })}>?</button>
          </div>
        </div>
        {isMockPreview && <div className="panel-purpose">
          <span>{selection.kind ? '動かすときは、上の道具で「移動・回転・拡大」を選びます' : '一覧から選ぶか、「＋ 追加」で足します'}</span>
          <button type="button" onClick={() => update({ panelOpen: false })}>平面図に戻る</button>
        </div>}
        <div className="panel-body unity-panel">
          {planOpen && <p className="fixture-scope-note">照明・役者・セットの変更は、いまのシーンに入ります。舞台と客席は全シーン共通です。</p>}
          <HierarchyPanel />
          <Inspector />
        </div>
      </div>
    </>
  )
}

export function FixtureEditor({ fixture }: { fixture: Fixture }) {
  const profile = FIXTURE_PROFILES[fixture.presetKey]
  const update = (patch: Partial<Fixture>) => useStore.getState().updateFixture(fixture.id, patch)
  const isMeasured = fixture.photometricProfile === MEASURED_FRESNEL_KEY
  const isMeasuredCyc = fixture.photometricProfile === MEASURED_CYC_KEY
  const isLED = profile.source !== 'tungsten' || isMeasured

  return (
    <>
      <div className="callout">
        <div style={{ fontSize: 10, color: '#998468', marginTop: 2, fontFamily: 'var(--font-sans)' }}>
          {isMeasured ? 'ETC fos/4 Fresnel 10 Mid の配光を使用中（光の色は試作値）'
            : isMeasuredCyc ? 'ETC Source Four LED CYC の配光を使用中（取付角度は試作値）'
            : `${KIND_LABELS[profile.kind]} / ${profile.fluxLumens.toLocaleString()} lm`}
        </div>
        {fixture.position[2] > 2 && <div style={{ fontSize: 11, color: 'var(--kin)', marginTop: 5 }}>
          客席側・舞台前から {(fixture.position[2] - 2).toFixed(1)}m・高さ {fixture.position[1].toFixed(1)}m
        </div>}
      </div>

      <Slider label="調光" value={fixture.intensity} min={0} max={1.5}
        onChange={v => update({ intensity: v })}
        fmt={v => Math.round((v / 1.5) * 100).toString()} unit="%" />

      {fixture.presetKey === 'Fresnel10' && (
        <div className="row">
          <label>配光</label>
          <select
            value={fixture.photometricProfile ?? ''}
            onChange={e => update({ photometricProfile: e.target.value === MEASURED_FRESNEL_KEY ? MEASURED_FRESNEL_KEY : undefined })}
          >
            <option value="">標準の近似</option>
            <option value={MEASURED_FRESNEL_KEY}>ETC Fresnel 10 Mid の配光</option>
          </select>
        </div>
      )}

      {fixture.presetKey === 'CycWashStudy' && (
        <div className="row">
          <label>配光</label>
          <select
            value={isMeasuredCyc ? MEASURED_CYC_KEY : ''}
            onChange={e => update({ photometricProfile: e.target.value === MEASURED_CYC_KEY ? MEASURED_CYC_KEY : undefined })}
          >
            <option value="">標準の近似</option>
            <option value={MEASURED_CYC_KEY}>ETC LED CYC の配光</option>
          </select>
        </div>
      )}

      {profile.beamAdjustable ? (
        <Slider
          label="ズーム"
          value={fixture.beamAngleDeg}
          min={profile.beamAngleMinDeg ?? 5}
          max={profile.beamAngleMaxDeg ?? 60}
          step={0.5}
          onChange={v => update({ beamAngleDeg: v })}
          unit="°"
          fmt={v => v.toFixed(1)}
        />
      ) : (
        <div className="row">
          <label>ビーム角</label>
          <span className="numval" style={{ flex: 1, textAlign: 'left', color: '#998468' }}>
            {isMeasuredCyc ? 'IES 配光データに従う' : `${profile.beamAngleDeg}° (固定)`}
          </span>
        </div>
      )}

      {isMeasured && <BarnDoorEditor fixture={fixture} onChange={update} />}

      {profile.kind === 'PAR' && (
        <Slider label="器具回転" value={fixture.rotationZDeg} min={-180} max={180}
          onChange={v => update({ rotationZDeg: v })} unit="°" fmt={v => v.toFixed(0)} />
      )}

      <h3>{isMeasured ? '光の色（試作）' : isLED ? '色 (LED)' : 'ジェル'}</h3>
      {!isLED && (
        <div className="row">
          <label>ジェル装着</label>
          <input type="checkbox" checked={fixture.gelEnabled} onChange={e => update({ gelEnabled: e.target.checked })} />
        </div>
      )}
      <div className="row">
        <label>色</label>
        <input
          type="color"
          value={colorToHex(fixture.color)}
          onChange={e => update({ color: hexToRgb(e.target.value), gelEnabled: !isMeasured })}
        />
        <span className="numval" style={{ flex: 1, textAlign: 'left' }}>{colorToHex(fixture.color)}</span>
      </div>
      {isLED && (
        <Slider label="白ミックス" value={fixture.whiteMix} min={0} max={1} step={0.01}
          onChange={v => update({ whiteMix: v })}
          fmt={v => `${Math.round(v * 100)}%`} />
      )}

    </>
  )
}

