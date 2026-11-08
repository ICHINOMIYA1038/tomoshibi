import { useEffect, useState, useRef, type ReactNode } from 'react'
import { useStore, type Fixture, type Performer } from '../store'
import { FIXTURE_PROFILES, FIXTURE_PRESETS_BY_KIND, KIND_LABELS, type FixtureKind } from '../lighting/fixtureTypes'
import type { SetPiece, SetPieceAppearance } from '../types'
import { useDraggablePanel } from './useDraggablePanel'
import { MEASURED_FRESNEL_KEY } from '../photometric/measuredFresnel'
import { MEASURED_CYC_KEY } from '../photometric/measuredCyc'
import { PERFORMER_POSES } from '../performerPoses'

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

export function ControlPanel({ planOpen = false }: { planOpen?: boolean }) {
  const settings = useStore(s => s.settings)
  const update = useStore(s => s.updateSettings)
  const tab = settings.uiTab
  const open = settings.panelOpen
  const selection = useStore(s => s.selection)
  const previousSelection = useRef({ kind: selection.kind, id: selection.id })
  const dragStartY = useRef<number | null>(null)
  const dragDelta = useRef(0)
  const isMobile = typeof window !== 'undefined' && window.innerWidth <= 960
  const isMockPreview = typeof location !== 'undefined' &&
    (location.protocol === 'file:' || location.pathname === '/mock' || location.pathname.startsWith('/mock/'))

  // PC のみドラッグ可能、モバイルは下からのボトムシート挙動を維持
  const { panelProps, handleProps } = useDraggablePanel('object', {
    x: typeof window !== 'undefined' ? window.innerWidth - 372 : 600,
    y: 12,
  })

  useEffect(() => {
    if (selection.kind === previousSelection.current.kind && selection.id === previousSelection.current.id) return
    previousSelection.current = { kind: selection.kind, id: selection.id }
    const nextTab = selection.kind === 'fixture' ? 'fixtures'
      : selection.kind === 'performer' ? 'performers'
      : selection.kind === 'setpiece' ? 'props' : null
    if (nextTab && nextTab !== useStore.getState().settings.uiTab) update({ uiTab: nextTab })
    if (isMockPreview && nextTab) requestAnimationFrame(() => {
      document.querySelector('.object-panel .panel-body')?.scrollTo({ top: 0, behavior: 'instant' })
    })
  }, [selection.kind, selection.id, update, isMockPreview])

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
          <span>{selection.kind ? '選択中のものをここで編集できます' : '種類を選んで舞台に追加できます'}</span>
          <button type="button" onClick={() => update({ panelOpen: false })}>平面図に戻る</button>
        </div>}
        <div className="panel-tabs">
          <TabButton id="fixtures" label={isMockPreview ? '照明' : '器具'} />
          <TabButton id="performers" label="役者" />
          <TabButton id="props" label={isMockPreview ? '舞台セット' : '装置'} />
        </div>

        {tab === 'fixtures' && <FixturesPanel planOpen={planOpen} />}
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

// ============ 一括選択: チェックボックス + 上部アクションバー ============
function useBulkSelection(ids: string[]) {
  const [picked, setPicked] = useState<Set<string>>(new Set())
  // 一覧から消えた id をクリーンアップ
  const valid = new Set(ids)
  for (const p of picked) if (!valid.has(p)) picked.delete(p)

  const toggle = (id: string) => {
    setPicked(prev => {
      const n = new Set(prev)
      if (n.has(id)) n.delete(id); else n.add(id)
      return n
    })
  }
  const clear = () => setPicked(new Set())
  const allOn = ids.length > 0 && picked.size === ids.length
  const toggleAll = () => setPicked(allOn ? new Set() : new Set(ids))
  return { picked, toggle, clear, allOn, toggleAll, count: picked.size }
}

function BulkBar({ count, allOn, onToggleAll, onClear, children }: {
  count: number; allOn: boolean; onToggleAll: () => void; onClear: () => void;
  children?: ReactNode
}) {
  return (
    <div className={'bulk-bar' + (count > 0 ? ' active' : '')}>
      <label className="bulk-checkall" onClick={e => e.stopPropagation()}>
        <input type="checkbox" checked={allOn} onChange={onToggleAll} />
        <span>{count > 0 ? `${count} 件選択中` : '一括選択'}</span>
      </label>
      {count > 0 && (
        <div className="bulk-actions">
          {children}
          <button className="small" onClick={onClear}>解除</button>
        </div>
      )}
    </div>
  )
}

// ============ 器具 タブ ============
function FixturesPanel({ planOpen }: { planOpen: boolean }) {
  const fixtures = useStore(s => s.fixtures)
  const selection = useStore(s => s.selection)
  const selected = fixtures.find(f => f.id === selection.id && selection.kind === 'fixture')
  const select = useStore(s => s.select)
  const add = useStore(s => s.addFixture)
  const bulk = useBulkSelection(fixtures.map(f => f.id))

  const [addKind, setAddKind] = useState<FixtureKind>('Fresnel')
  const [addPreset, setAddPreset] = useState<string>('Fresnel8')

  const bulkDelete = () => {
    if (bulk.count === 0) return
    if (!confirm(`${bulk.count} 件の器具を削除しますか?`)) return
    for (const id of bulk.picked) useStore.getState().removeFixture(id)
    bulk.clear()
  }
  const bulkToggle = (enabled: boolean) => {
    for (const id of bulk.picked) useStore.getState().updateFixture(id, { enabled })
  }

  return (
    <div className="panel-body">
      {planOpen && <p className="fixture-scope-note">照明の変更は現在のシーンに反映されます。</p>}
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
      <BulkBar count={bulk.count} allOn={bulk.allOn} onToggleAll={bulk.toggleAll} onClear={bulk.clear}>
        <button className="small" onClick={() => bulkToggle(true)}>点灯</button>
        <button className="small" onClick={() => bulkToggle(false)}>消灯</button>
        <button className="small danger" onClick={bulkDelete}>削除</button>
      </BulkBar>
      <div className="list">
        {fixtures.map(f => (
          <div
            key={f.id}
            className={'fixture-row' + (selection.kind === 'fixture' && selection.id === f.id ? ' selected' : '') + (bulk.picked.has(f.id) ? ' picked' : '')}
            onClick={() => select('fixture', f.id, 'position')}
          >
            <input
              type="checkbox"
              className="row-check"
              checked={bulk.picked.has(f.id)}
              onClick={e => e.stopPropagation()}
              onChange={() => bulk.toggle(f.id)}
              title="一括選択"
            />
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
            <button
              className="danger small"
              onClick={(e) => { e.stopPropagation(); useStore.getState().removeFixture(f.id) }}
              title="削除"
            >×</button>
          </div>
        ))}
        {fixtures.length === 0 && <div className="empty-hint">「+ 追加」で配置してください</div>}
      </div>

      {selected && <div className="selected-editor"><FixtureEditor fixture={selected} /></div>}
    </div>
  )
}

function FixtureEditor({ fixture }: { fixture: Fixture }) {
  const profile = FIXTURE_PROFILES[fixture.presetKey]
  const update = (patch: Partial<Fixture>) => useStore.getState().updateFixture(fixture.id, patch)
  const remove = useStore(s => s.removeFixture)
  const dup = useStore(s => s.duplicateFixture)
  const isMeasured = fixture.photometricProfile === MEASURED_FRESNEL_KEY
  const isMeasuredCyc = fixture.photometricProfile === MEASURED_CYC_KEY
  const isLED = profile.source !== 'tungsten' || isMeasured

  return (
    <>
      <h3>選択中</h3>
      <div className="callout">
        <b>{fixture.name}</b>
        <div style={{ fontSize: 10, color: '#998468', marginTop: 2, fontFamily: 'var(--font-sans)' }}>
          {isMeasured ? 'ETC fos/4 Fresnel 10 Mid の配光を使用中（光の色は試作値）'
            : isMeasuredCyc ? 'ETC Source Four LED CYC の配光を使用中（取付角度は試作値）'
            : `${KIND_LABELS[profile.kind]} / ${profile.fluxLumens.toLocaleString()} lm`}
        </div>
      </div>

      <div className="row">
        <label>名前</label>
        <input type="text" value={fixture.name} onChange={e => update({ name: e.target.value })} />
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

      {isMeasured && <div className="row">
        <label>上側バンドア</label>
        <input type="checkbox" checked={fixture.upstageCutDeg !== undefined}
          onChange={e => update({ upstageCutDeg: e.target.checked ? 5 : undefined })} />
      </div>}
      {isMeasured && fixture.upstageCutDeg !== undefined && <Slider
        label="遮光の境界" value={fixture.upstageCutDeg} min={-10} max={25} step={0.5}
        onChange={v => update({ upstageCutDeg: v })} unit="°" fmt={v => v.toFixed(1)} />}
      {isMeasured && fixture.upstageCutDeg !== undefined && <div className="hint">光軸より上側を遮る近似です。奥壁への光漏れを見ながら調整できます。</div>}

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

      <PositionTrio label="光源" value={fixture.position} onChange={v => update({ position: v })} ranges={[[-9, 9], [0.3, 12], [-7.5, 8]]} />
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
  const bulk = useBulkSelection(performers.map(p => p.id))

  const bulkDelete = () => {
    if (bulk.count === 0) return
    if (!confirm(`${bulk.count} 人の役者を削除しますか?`)) return
    for (const id of bulk.picked) remove(id)
    bulk.clear()
  }

  return (
    <div className="panel-body">
      <h3>役者を追加</h3>
      <div className="row">
        <button className="primary" onClick={() => add()} style={{ flex: 1 }}>+ 追加</button>
      </div>

      <h3>一覧 ({performers.length})</h3>
      <BulkBar count={bulk.count} allOn={bulk.allOn} onToggleAll={bulk.toggleAll} onClear={bulk.clear}>
        <button className="small danger" onClick={bulkDelete}>削除</button>
      </BulkBar>
      <div className="list">
        {performers.map(p => (
          <div
            key={p.id}
            className={'fixture-row' + (selection.kind === 'performer' && selection.id === p.id ? ' selected' : '') + (bulk.picked.has(p.id) ? ' picked' : '')}
            onClick={() => select('performer', p.id)}
          >
            <input
              type="checkbox"
              className="row-check"
              checked={bulk.picked.has(p.id)}
              onClick={e => e.stopPropagation()}
              onChange={() => bulk.toggle(p.id)}
              title="一括選択"
            />
            <div className="dot" style={{ background: p.onStage === false ? '#555' : p.color }} />
            <span className="name">{p.name}</span>
            <input type="checkbox" checked={p.onStage !== false}
              onClick={e => e.stopPropagation()}
              onChange={e => update(p.id, { onStage: e.target.checked })}
              title="このシーンで舞台上"
              aria-label={`${p.name}をこのシーンで舞台上に表示`} />
            <button
              className="danger small"
              onClick={(e) => { e.stopPropagation(); remove(p.id) }}
              title="削除"
            >×</button>
          </div>
        ))}
        {performers.length === 0 && <div className="empty-hint">舞台上に役者がいません</div>}
      </div>

      {selected && (
        <div className="selected-editor">
          <h3>選択中</h3>
          <div className="callout">
            <b>{selected.name}</b>
            <div style={{ fontSize: 10, color: '#998468', marginTop: 2, fontFamily: 'var(--font-sans)' }}>
              役者 / {Math.round(selected.scale * 170)}cm
            </div>
          </div>
          <div className="row">
            <label>名前</label>
            <input type="text" value={selected.name} onChange={e => update(selected.id, { name: e.target.value })} />
          </div>
          <div className="row">
            <label>舞台上</label>
            <input type="checkbox" checked={selected.onStage !== false}
              onChange={e => update(selected.id, { onStage: e.target.checked })} />
          </div>
          <div className="pose-presets" role="group" aria-label={`${selected.name}のポーズ`}>
            <span>ポーズ</span>
            <div>
              {PERFORMER_POSES.map(pose => <button key={pose.value} type="button"
                className={(selected.pose ?? 'standing') === pose.value ? 'active' : ''}
                aria-pressed={(selected.pose ?? 'standing') === pose.value}
                onClick={() => update(selected.id, { pose: pose.value })}>{pose.label}</button>)}
            </div>
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
        </div>
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
  const update = (id: string, patch: Partial<SetPiece>) => useStore.getState().updateSetPiece(id, patch)
  const addAppearance = (appearance: Exclude<SetPieceAppearance, 'basic'>) => {
    const presets: Record<Exclude<SetPieceAppearance, 'basic'>, { name: string; size: [number, number, number]; color: string }> = {
      bench: { name: 'ベンチ', size: [2.8, 0.9, 0.85], color: '#765c48' },
      door: { name: '扉', size: [1.45, 2.2, 0.22], color: '#555767' },
      suitcase: { name: '鞄', size: [0.72, 0.48, 0.4], color: '#a86d48' },
      table: { name: '机', size: [2.2, 0.8, 1.1], color: '#75523c' },
      bookshelf: { name: '書架', size: [2.3, 2.7, 0.5], color: '#4c3a35' },
      window: { name: '窓', size: [2.5, 2.8, 0.16], color: '#5c6774' },
    }
    const preset = presets[appearance]
    const id = addPrim('box')
    const position = useStore.getState().setPieces.find(piece => piece.id === id)?.position
    if (position) update(id, {
      ...preset, appearance, position: [position[0], preset.size[1] / 2, position[2]],
    })
  }
  const bulk = useBulkSelection(pieces.map(p => p.id))

  const bulkDelete = () => {
    if (bulk.count === 0) return
    if (!confirm(`${bulk.count} 件の装置を削除しますか?`)) return
    for (const id of bulk.picked) remove(id)
    bulk.clear()
  }

  return (
    <div className="panel-body">
      <h3>装置を追加</h3>
      <div className="row" style={{ gap: 4 }}>
        <button onClick={() => addPrim('box')} style={{ flex: 1 }}>箱馬</button>
        <button onClick={() => addPrim('platform')} style={{ flex: 1 }}>平台</button>
        <button onClick={() => addPrim('riser')} style={{ flex: 1 }}>高台</button>
      </div>
      <div className="row" style={{ gap: 4 }}>
        <button onClick={() => addAppearance('bench')} style={{ flex: 1 }}>ベンチ</button>
        <button onClick={() => addAppearance('door')} style={{ flex: 1 }}>扉</button>
        <button onClick={() => addAppearance('suitcase')} style={{ flex: 1 }}>鞄</button>
      </div>
      <div className="row" style={{ gap: 4 }}>
        <button onClick={() => addAppearance('table')} style={{ flex: 1 }}>机</button>
        <button onClick={() => addAppearance('bookshelf')} style={{ flex: 1 }}>書架</button>
        <button onClick={() => addAppearance('window')} style={{ flex: 1 }}>窓</button>
      </div>

      <h3>一覧 ({pieces.length})</h3>
      <BulkBar count={bulk.count} allOn={bulk.allOn} onToggleAll={bulk.toggleAll} onClear={bulk.clear}>
        <button className="small danger" onClick={bulkDelete}>削除</button>
      </BulkBar>
      <div className="list">
        {pieces.map(p => (
          <div
            key={p.id}
            className={'fixture-row' + (selection.kind === 'setpiece' && selection.id === p.id ? ' selected' : '') + (bulk.picked.has(p.id) ? ' picked' : '')}
            onClick={() => select('setpiece', p.id)}
          >
            <input
              type="checkbox"
              className="row-check"
              checked={bulk.picked.has(p.id)}
              onClick={e => e.stopPropagation()}
              onChange={() => bulk.toggle(p.id)}
              title="一括選択"
            />
            <div className="dot" style={{ background: p.color ?? '#876040' }} />
            <span className="name">{p.name}</span>
            <span className="kind">{p.appearance && p.appearance !== 'basic'
              ? { bench: 'ベンチ', door: '扉', suitcase: '鞄', table: '机', bookshelf: '書架', window: '窓' }[p.appearance] : p.kind}</span>
            <button
              className="danger small"
              onClick={(e) => { e.stopPropagation(); remove(p.id) }}
              title="削除"
            >×</button>
          </div>
        ))}
        {pieces.length === 0 && <div className="empty-hint">「箱馬 / 平台 / 高台」を追加してください</div>}
      </div>

      {selected && (
        <div className="selected-editor">
          <h3>選択中</h3>
          <div className="callout">
            <b>{selected.name}</b>
            <div style={{ fontSize: 10, color: '#998468', marginTop: 2, fontFamily: 'var(--font-sans)' }}>
              装置 / {selected.kind}
            </div>
          </div>
          <div className="row">
            <label>名前</label>
            <input type="text" value={selected.name} onChange={e => update(selected.id, { name: e.target.value })} />
          </div>
          {selected.kind !== 'gltf' && <div className="row">
            <label>色</label>
            <input type="color" value={selected.color ?? '#876040'} onChange={e => update(selected.id, { color: e.target.value })} />
          </div>}
          {selected.kind !== 'gltf' && <div className="row">
            <label>見た目</label>
            <select value={selected.appearance ?? 'basic'} onChange={e => update(selected.id, { appearance: e.target.value as SetPieceAppearance })}>
              <option value="basic">基本形</option>
              <option value="bench">ベンチ</option>
              <option value="door">扉</option>
              <option value="suitcase">鞄</option>
              <option value="table">机</option>
              <option value="bookshelf">書架</option>
              <option value="window">窓</option>
            </select>
          </div>}
          {selected.size && (
            <>
              <Slider label="幅" value={selected.size[0]} min={0.2} max={4} step={0.05}
                onChange={v => update(selected.id, { size: [v, selected.size![1], selected.size![2]] })}
                fmt={v => `${v.toFixed(2)}m`} />
              <Slider label="高" value={selected.size[1]} min={0.1} max={3} step={0.05}
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
        </div>
      )}
    </div>
  )
}
