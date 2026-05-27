import { useState, useRef } from 'react'
import { useStore, type Fixture, type Performer } from '../store'
import { FIXTURE_PROFILES, FIXTURE_PRESETS_BY_KIND, KIND_LABELS, type FixtureKind } from '../lighting/fixtureTypes'
import { useDraggablePanel } from './useDraggablePanel'

// 演劇関係者向け TOP パネル
// タブ: 器具 / 役者 のみ。設定は ⚙ から SettingsModal で開く

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

export function ControlPanel() {
  const settings = useStore(s => s.settings)
  const update = useStore(s => s.updateSettings)
  const tab = settings.uiTab
  const open = settings.panelOpen
  const dragStartY = useRef<number | null>(null)
  const dragDelta = useRef(0)
  const isMobile = typeof window !== 'undefined' && window.matchMedia('(max-width: 768px)').matches

  // PC のみドラッグ可能、モバイルは下からのボトムシート挙動を維持
  const { panelProps, handleProps } = useDraggablePanel('object', {
    x: typeof window !== 'undefined' ? window.innerWidth - 372 : 600,
    y: 12,
  })

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
        aria-label="パネル開閉"
      >
        <span className={'fab-icon ' + (open ? 'fab-close' : 'fab-burger')} aria-hidden="true" />
      </button>
      <div
        className={'panel object-panel' + (open ? ' open' : ' closed')}
        {...(isMobile ? {} : panelProps)}
      >
        <div
          className="panel-header"
          {...(isMobile
            ? { onTouchStart: onHeaderTouchStart, onTouchMove: onHeaderTouchMove, onTouchEnd: onHeaderTouchEnd }
            : handleProps)}
        >
          <div className="panel-title">オブジェクト</div>
          <div className="panel-actions">
            {!isMobile && (
              <button className="icon-btn" title="シーン管理" onClick={() => update({ scenePanelOpen: true })}>📁</button>
            )}
            <button className="icon-btn" title="設定" onClick={() => update({ settingsOpen: true })}>⚙</button>
            <button className="icon-btn" title="ヘルプ" onClick={() => update({ showHelp: true })}>?</button>
          </div>
        </div>
        <div className="panel-tabs">
          <TabButton id="fixtures" label="器具" />
          <TabButton id="performers" label="役者" />
          <TabButton id="props" label="装置" />
        </div>

        {tab === 'fixtures' && <FixturesPanel />}
        {tab === 'performers' && <PerformersPanel />}
        {tab === 'props' && <PropsPanel />}
      </div>
    </>
  )
}

function TabButton({ id, label }: { id: 'fixtures' | 'performers' | 'props'; label: string }) {
  const cur = useStore(s => s.settings.uiTab)
  const update = useStore(s => s.updateSettings)
  return (
    <button
      className={'tab-btn' + (cur === id ? ' active' : '')}
      onClick={() => update({ uiTab: id })}
    >{label}</button>
  )
}

// ============ 器具 タブ ============
function FixturesPanel() {
  const fixtures = useStore(s => s.fixtures)
  const selection = useStore(s => s.selection)
  const selected = fixtures.find(f => f.id === selection.id && selection.kind === 'fixture')
  const select = useStore(s => s.select)
  const add = useStore(s => s.addFixture)

  const [addKind, setAddKind] = useState<FixtureKind>('Fresnel')
  const [addPreset, setAddPreset] = useState<string>('Fresnel8')

  return (
    <div className="panel-body">
      <h3>器具を追加</h3>
      <div className="row">
        <label>種別</label>
        <select value={addKind} onChange={e => {
          const k = e.target.value as FixtureKind
          setAddKind(k)
          setAddPreset(FIXTURE_PRESETS_BY_KIND[k][0])
        }}>
          {(Object.keys(KIND_LABELS) as FixtureKind[]).map(k => (
            <option key={k} value={k}>{KIND_LABELS[k]}</option>
          ))}
        </select>
      </div>
      <div className="row">
        <label>モデル</label>
        <select value={addPreset} onChange={e => setAddPreset(e.target.value)}>
          {FIXTURE_PRESETS_BY_KIND[addKind].map(k => {
            const p = FIXTURE_PROFILES[k]
            return <option key={k} value={k}>{p.brand ? `${p.brand} — ${p.model || k}` : (p.model || k)}</option>
          })}
        </select>
      </div>
      <div className="row">
        <button className="primary" onClick={() => add(addPreset)} style={{ flex: 1 }}>+ 追加</button>
      </div>

      <h3>一覧 ({fixtures.length})</h3>
      <div className="list">
        {fixtures.map(f => (
          <div
            key={f.id}
            className={'fixture-row' + (selection.kind === 'fixture' && selection.id === f.id ? ' selected' : '')}
            onClick={() => select('fixture', f.id, 'position')}
          >
            <div className="dot" style={{ background: f.enabled ? colorToHex(f.color) : '#444' }} />
            <span className="name">{f.name}</span>
            <span className="kind">{FIXTURE_PROFILES[f.presetKey].kind}</span>
            <input
              type="checkbox"
              checked={f.enabled}
              onClick={e => e.stopPropagation()}
              onChange={e => useStore.getState().updateFixture(f.id, { enabled: e.target.checked })}
              title="点灯"
            />
          </div>
        ))}
        {fixtures.length === 0 && <div className="empty-hint">「+ 追加」で配置してください</div>}
      </div>

      {selected && <FixtureEditor fixture={selected} />}
    </div>
  )
}

function FixtureEditor({ fixture }: { fixture: Fixture }) {
  const profile = FIXTURE_PROFILES[fixture.presetKey]
  const update = (patch: Partial<Fixture>) => useStore.getState().updateFixture(fixture.id, patch)
  const remove = useStore(s => s.removeFixture)
  const dup = useStore(s => s.duplicateFixture)
  const isLED = profile.source !== 'tungsten'

  return (
    <>
      <h3>選択中</h3>
      <div className="callout">
        <b>{fixture.name}</b>
        <div style={{ fontSize: 10, color: '#998468', marginTop: 2, fontFamily: 'var(--font-sans)' }}>
          {KIND_LABELS[profile.kind]} / {profile.fluxLumens.toLocaleString()} lm
        </div>
      </div>

      <div className="row">
        <label>名前</label>
        <input type="text" value={fixture.name} onChange={e => update({ name: e.target.value })} />
      </div>

      <Slider label="調光" value={fixture.intensity} min={0} max={1.5}
        onChange={v => update({ intensity: v })}
        fmt={v => Math.round((v / 1.5) * 100).toString()} unit="%" />

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
            {profile.beamAngleDeg}° (固定)
          </span>
        </div>
      )}

      {profile.kind === 'PAR' && (
        <Slider label="器具回転" value={fixture.rotationZDeg} min={-180} max={180}
          onChange={v => update({ rotationZDeg: v })} unit="°" fmt={v => v.toFixed(0)} />
      )}

      <h3>{isLED ? '色 (LED)' : 'ジェル'}</h3>
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
          onChange={e => update({ color: hexToRgb(e.target.value), gelEnabled: true })}
        />
        <span className="numval" style={{ flex: 1, textAlign: 'left' }}>{colorToHex(fixture.color)}</span>
      </div>
      {isLED && (
        <Slider label="白ミックス" value={fixture.whiteMix} min={0} max={1} step={0.01}
          onChange={v => update({ whiteMix: v })}
          fmt={v => `${Math.round(v * 100)}%`} />
      )}

      <h3>位置 / 狙い</h3>
      <div className="row">
        <button
          className={selection_isPos(fixture.id) ? 'active' : ''}
          onClick={() => useStore.getState().select('fixture', fixture.id, 'position')}
          style={{ flex: 1 }}
        >光源</button>
        <button
          className={selection_isTgt(fixture.id) ? 'active' : ''}
          onClick={() => useStore.getState().select('fixture', fixture.id, 'target')}
          style={{ flex: 1 }}
        >狙い</button>
      </div>
      {selection_isPos(fixture.id) && (
        <div className="row" style={{ marginTop: 4 }}>
          <button
            className={useStore.getState().settings.transformMode === 'translate' ? 'active' : ''}
            onClick={() => useStore.getState().updateSettings({ transformMode: 'translate' })}
            style={{ flex: 1 }}
          >移動</button>
          <button
            className={useStore.getState().settings.transformMode === 'rotate' ? 'active' : ''}
            onClick={() => useStore.getState().updateSettings({ transformMode: 'rotate' })}
            style={{ flex: 1 }}
          >回転</button>
        </div>
      )}
      <div className="info-block" style={{ fontSize: 10, marginTop: 4 }}>
        3D上の矢印/リングハンドルで掴んで操作
      </div>

      <PositionTrio label="光源" value={fixture.position} onChange={v => update({ position: v })} ranges={[[-7, 7], [0.3, 9], [-7.5, 3]]} />
      <PositionTrio label="狙い" value={fixture.target} onChange={v => update({ target: v })} ranges={[[-7, 7], [0, 7], [-7.5, 3]]} />

      <div className="row" style={{ marginTop: 12 }}>
        <button onClick={() => dup(fixture.id)} style={{ flex: 1 }}>複製</button>
        <button className="danger" onClick={() => remove(fixture.id)} style={{ flex: 1 }}>削除</button>
      </div>
    </>
  )
}

function selection_isPos(id: string): boolean {
  const sel = useStore.getState().selection
  return sel.kind === 'fixture' && sel.id === id && (sel.fixtureHandle ?? 'position') === 'position'
}
function selection_isTgt(id: string): boolean {
  const sel = useStore.getState().selection
  return sel.kind === 'fixture' && sel.id === id && sel.fixtureHandle === 'target'
}

function PositionTrio({ label, value, onChange, ranges }: {
  label: string;
  value: [number, number, number];
  onChange: (v: [number, number, number]) => void;
  ranges: Array<[number, number]>;
}) {
  const axes = ['X', 'Y', 'Z'] as const
  return (
    <>
      {axes.map((a, i) => (
        <div className="row" key={a}>
          <label>{label} {a}</label>
          <input type="range" min={ranges[i][0]} max={ranges[i][1]} step={0.1} value={value[i]}
            onChange={e => {
              const nv = [...value] as [number, number, number]
              nv[i] = parseFloat(e.target.value)
              onChange(nv)
            }} />
          <span className="numval">{value[i].toFixed(1)}m</span>
        </div>
      ))}
    </>
  )
}

// ============ 役者 タブ ============
function PerformersPanel() {
  const performers = useStore(s => s.performers)
  const add = useStore(s => s.addPerformer)
  const remove = useStore(s => s.removePerformer)
  const select = useStore(s => s.select)
  const selection = useStore(s => s.selection)
  const selected = performers.find(p => p.id === selection.id && selection.kind === 'performer')
  const update = (id: string, patch: Partial<Performer>) => useStore.getState().updatePerformer(id, patch)

  return (
    <div className="panel-body">
      <div className="row">
        <button className="primary" onClick={() => add()} style={{ flex: 1 }}>+ 役者を追加</button>
      </div>

      <h3>一覧 ({performers.length})</h3>
      <div className="list">
        {performers.map(p => (
          <div
            key={p.id}
            className={'fixture-row' + (selection.kind === 'performer' && selection.id === p.id ? ' selected' : '')}
            onClick={() => select('performer', p.id)}
          >
            <div className="dot" style={{ background: p.color }} />
            <span className="name">{p.name}</span>
            <button
              className="danger small"
              onClick={(e) => { e.stopPropagation(); remove(p.id) }}
            >×</button>
          </div>
        ))}
        {performers.length === 0 && <div className="empty-hint">舞台上に役者がいません</div>}
      </div>

      {selected && (
        <>
          <h3>選択中</h3>
          <div className="row">
            <label>名前</label>
            <input type="text" value={selected.name} onChange={e => update(selected.id, { name: e.target.value })} />
          </div>
          <div className="row">
            <label>服色</label>
            <input type="color" value={selected.color} onChange={e => update(selected.id, { color: e.target.value })} />
          </div>
          <Slider label="身長" value={selected.scale} min={0.6} max={1.3} step={0.01}
            onChange={v => update(selected.id, { scale: v })}
            fmt={v => `${Math.round(v * 170)}cm`} />
          <PositionTrio label="位置" value={selected.position} onChange={v => update(selected.id, { position: [v[0], Math.max(0, v[1]), v[2]] })} ranges={[[-6, 6], [0, 2], [-7, 2]]} />
          <div className="row" style={{ marginTop: 12 }}>
            <button className="danger" onClick={() => remove(selected.id)} style={{ flex: 1 }}>削除</button>
          </div>
        </>
      )}
    </div>
  )
}

// ============ 装置 タブ ============
function PropsPanel() {
  const pieces = useStore(s => s.setPieces)
  const selection = useStore(s => s.selection)
  const selected = pieces.find(p => p.id === selection.id && selection.kind === 'setpiece')
  const select = useStore(s => s.select)
  const addPrim = useStore(s => s.addPrimitiveSetPiece)
  const remove = useStore(s => s.removeSetPiece)
  const update = (id: string, patch: any) => useStore.getState().updateSetPiece(id, patch)

  return (
    <div className="panel-body">
      <h3>装置を追加</h3>
      <div className="row" style={{ gap: 4 }}>
        <button onClick={() => addPrim('box')} style={{ flex: 1 }}>箱馬</button>
        <button onClick={() => addPrim('platform')} style={{ flex: 1 }}>平台</button>
        <button onClick={() => addPrim('riser')} style={{ flex: 1 }}>高台</button>
      </div>

      <h3>一覧 ({pieces.length})</h3>
      <div className="list">
        {pieces.map(p => (
          <div
            key={p.id}
            className={'fixture-row' + (selection.kind === 'setpiece' && selection.id === p.id ? ' selected' : '')}
            onClick={() => select('setpiece', p.id)}
          >
            <div className="dot" style={{ background: p.color ?? '#876040' }} />
            <span className="name">{p.name}</span>
            <span className="kind">{p.kind}</span>
          </div>
        ))}
        {pieces.length === 0 && <div className="empty-hint">「箱馬 / 平台 / 高台」を追加してください</div>}
      </div>

      {selected && selected.kind !== 'gltf' && (
        <>
          <h3>編集</h3>
          <div className="row">
            <label>名前</label>
            <input type="text" value={selected.name} onChange={e => update(selected.id, { name: e.target.value })} />
          </div>
          <div className="row">
            <label>色</label>
            <input type="color" value={selected.color ?? '#876040'} onChange={e => update(selected.id, { color: e.target.value })} />
          </div>
          {selected.size && (
            <>
              <Slider label="幅" value={selected.size[0]} min={0.2} max={4} step={0.05}
                onChange={v => update(selected.id, { size: [v, selected.size![1], selected.size![2]] })}
                fmt={v => `${v.toFixed(2)}m`} />
              <Slider label="高" value={selected.size[1]} min={0.1} max={2} step={0.05}
                onChange={v => update(selected.id, { size: [selected.size![0], v, selected.size![2]] })}
                fmt={v => `${v.toFixed(2)}m`} />
              <Slider label="奥行" value={selected.size[2]} min={0.2} max={4} step={0.05}
                onChange={v => update(selected.id, { size: [selected.size![0], selected.size![1], v] })}
                fmt={v => `${v.toFixed(2)}m`} />
            </>
          )}
          <PositionTrio
            label="位置"
            value={selected.position}
            onChange={v => update(selected.id, { position: v })}
            ranges={[[-7, 7], [0, 5], [-7.5, 3]]}
          />
          <div className="row" style={{ marginTop: 12 }}>
            <button className="danger" onClick={() => remove(selected.id)} style={{ flex: 1 }}>削除</button>
          </div>
        </>
      )}
    </div>
  )
}
