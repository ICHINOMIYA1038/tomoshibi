import { useEffect, useState } from 'react'
import { useStore, type QualityPreset, QUALITY_PRESETS, LIMITS } from '../store'
import {
  listSavedScenes, saveSceneLS, loadSceneLS, deleteSceneLS,
  downloadSceneJSON, uploadSceneJSON, makeShareURL,
} from '../io/sceneIO'
import {
  getSession, loginUrl, logoutUrl,
  listCloudScenes, saveCloudSceneNew, updateCloudScene, loadCloudScene, deleteCloudScene,
  type CloudUser, type CloudSceneMeta, CloudError,
} from '../io/cloud'
import { unzipGDTF, parseGDTFXML, gdtfToProfile, type GDTFInfo } from '../io/gdtfParser'
import { importGLTFFile } from '../scene/SetPieces'
import {
  isWebSerialSupported, connectDMX, disconnectDMX, getFixtureDMXAddress,
} from '../io/dmxBridge'
import { IESPanel } from './IESViewer'
import {
  rgbToXy, xyToCCT,
} from '../photometric/colorScience'
import { luxToFc } from '../photometric/illuminance'

// 設定モーダル — TOPを軽く保つため詳細項目はすべてここに
// タブ: シーン管理 / 表現 / 高度ツール

export function SettingsModal() {
  const open = useStore(s => s.settings.settingsOpen)
  const tab = useStore(s => s.settings.settingsTab)
  const update = useStore(s => s.updateSettings)
  if (!open) return null
  return (
    <div className="settings-overlay" onClick={() => update({ settingsOpen: false })}>
      <div className="settings-card" onClick={e => e.stopPropagation()}>
        <button className="settings-close" onClick={() => update({ settingsOpen: false })}>×</button>
        <div className="settings-header">
          <h1>設定</h1>
          <div className="settings-tabs">
            <SetTab id="scene" label="シーン管理" />
            <SetTab id="look" label="表現" />
            <SetTab id="advanced" label="高度ツール (準備中)" />
          </div>
        </div>
        <div className="settings-body">
          {tab === 'scene' && <SceneSection />}
          {tab === 'look' && <LookSection />}
          {tab === 'advanced' && <AdvancedPlaceholder />}
        </div>
      </div>
    </div>
  )
}

function SetTab({ id, label }: { id: 'scene' | 'look' | 'advanced'; label: string }) {
  const cur = useStore(s => s.settings.settingsTab)
  const update = useStore(s => s.updateSettings)
  return (
    <button
      className={'set-tab' + (cur === id ? ' active' : '')}
      onClick={() => update({ settingsTab: id })}
    >{label}</button>
  )
}

// ============ クラウド (戯曲図書館アカウントで共有保存) ============
function CloudSection() {
  const [user, setUser] = useState<CloudUser | null | undefined>(undefined) // undefined=確認中
  const [scenes, setScenes] = useState<CloudSceneMeta[]>([])
  const [loading, setLoading] = useState(false)
  const [err, setErr] = useState('')
  const [name, setName] = useState('')

  const refreshScenes = async () => {
    try { setScenes(await listCloudScenes()); setErr('') }
    catch (e) { if (e instanceof CloudError) setErr(e.message) }
  }

  useEffect(() => {
    let alive = true
    getSession().then(u => {
      if (!alive) return
      setUser(u)
      if (u) refreshScenes()
    })
    return () => { alive = false }
  }, [])

  if (user === undefined) {
    return (<>
      <h3>クラウド保存</h3>
      <div className="info-block" style={{ fontSize: 11 }}>接続を確認中…</div>
    </>)
  }
  if (user === null) {
    return (<>
      <h3>クラウド保存</h3>
      <div className="info-block" style={{ fontSize: 11, lineHeight: 1.6 }}>
        戯曲図書館アカウントでログインすると、シーンをサーバーに保存して別端末からも開けます。<br />
        <span style={{ color: '#998468' }}>ログインは新規タブで戯曲図書館に遷移し、Google認証後この画面に戻ります。</span>
      </div>
      <div className="row" style={{ marginTop: 6 }}>
        <button className="primary" onClick={() => { location.href = loginUrl() }}>戯曲図書館でログイン</button>
      </div>
    </>)
  }

  const doSave = async () => {
    const n = name.trim() || `シーン ${new Date().toLocaleString('ja-JP')}`
    setLoading(true); setErr('')
    try { await saveCloudSceneNew(n); setName(''); await refreshScenes() }
    catch (e) { if (e instanceof CloudError) setErr(e.message) }
    finally { setLoading(false) }
  }
  const doUpdate = async (s: CloudSceneMeta) => {
    if (!confirm(`「${s.name}」を現在の状態で上書きしますか？`)) return
    setLoading(true); setErr('')
    try { await updateCloudScene(s.id, s.name); await refreshScenes() }
    catch (e) { if (e instanceof CloudError) setErr(e.message) }
    finally { setLoading(false) }
  }
  const doLoad = async (s: CloudSceneMeta) => {
    setLoading(true); setErr('')
    try { await loadCloudScene(s.id) }
    catch (e) { if (e instanceof CloudError) setErr(e.message) }
    finally { setLoading(false) }
  }
  const doDelete = async (s: CloudSceneMeta) => {
    if (!confirm(`「${s.name}」をクラウドから削除しますか？`)) return
    setLoading(true); setErr('')
    try { await deleteCloudScene(s.id); await refreshScenes() }
    catch (e) { if (e instanceof CloudError) setErr(e.message) }
    finally { setLoading(false) }
  }

  return (<>
    <h3>クラウド保存 ({user.name ?? 'ログイン中'})</h3>
    <div className="row">
      <input
        type="text"
        placeholder="新しい名前で保存…"
        value={name}
        onChange={e => setName(e.target.value)}
        maxLength={60}
        style={{ flex: 1 }}
      />
      <button className="primary" disabled={loading} onClick={doSave}>保存</button>
    </div>
    {err && <div className="info-block" style={{ color: '#e07a6a', fontSize: 11 }}>{err}</div>}
    <div className="list" style={{ marginTop: 6 }}>
      {scenes.map(s => (
        <div key={s.id} className="fixture-row">
          <span className="name">{s.name}</span>
          <span style={{ fontSize: 10, color: '#998468' }}>{new Date(s.updatedAt).toLocaleDateString('ja-JP')}</span>
          <button className="small" disabled={loading} onClick={() => doLoad(s)}>読込</button>
          <button className="small" disabled={loading} onClick={() => doUpdate(s)}>上書</button>
          <button className="small danger" disabled={loading} onClick={() => doDelete(s)}>×</button>
        </div>
      ))}
      {scenes.length === 0 && <div className="empty-hint">クラウドに保存されたシーンはありません</div>}
    </div>
    <div className="row" style={{ marginTop: 6 }}>
      <a href={logoutUrl()} style={{ fontSize: 10, color: '#998468' }}>ログアウト</a>
    </div>
  </>)
}

// ============ シーン管理 ============
function SceneSection() {
  const loadPreset = useStore(s => s.loadPreset)
  const settings = useStore(s => s.settings)
  const update = useStore(s => s.updateSettings)
  const fixtureCount = useStore(s => s.fixtures.length)
  const performerCount = useStore(s => s.performers.length)
  const [sceneName, setSceneName] = useState('明かり1')
  const [shareURL, setShareURL] = useState('')
  const saved = listSavedScenes()

  return (
    <>
      <h3>テンプレートを読込</h3>
      <div className="preset-grid">
        <button onClick={() => loadPreset('basic')}>基本明かり</button>
        <button onClick={() => loadPreset('colorful')}>カラフル</button>
        <button onClick={() => loadPreset('empty')}>空</button>
      </div>
      <div className="info-block" style={{ marginTop: 6 }}>
        現在のシーン: フィクスチャ <b>{fixtureCount}</b>/{LIMITS.fixtures} / 役者 <b>{performerCount}</b>/{LIMITS.performers}
      </div>

      <CloudSection />

      <h3>シーンを保存・読込</h3>
      <div className="row">
        <label>名前</label>
        <input type="text" value={sceneName} onChange={e => setSceneName(e.target.value)} />
      </div>
      <div className="row">
        <button className="primary" onClick={() => { saveSceneLS(sceneName); alert('保存しました') }}>保存</button>
        <button onClick={() => downloadSceneJSON(sceneName)}>書出</button>
        <label className="file-btn">
          読込
          <input type="file" accept=".json" hidden onChange={async e => {
            const f = e.target.files?.[0]; if (f) { await uploadSceneJSON(f) }
          }} />
        </label>
      </div>
      <div className="row">
        <button onClick={() => setShareURL(makeShareURL())} style={{ flex: 1 }}>共有URL生成</button>
      </div>
      {shareURL && (
        <textarea className="share-url" readOnly value={shareURL} onClick={e => (e.target as HTMLTextAreaElement).select()} />
      )}
      <div className="list" style={{ marginTop: 6 }}>
        {saved.map(s => (
          <div key={s.name} className="fixture-row">
            <span className="name">{s.name}</span>
            <span style={{ fontSize: 10, color: '#998468' }}>{new Date(s.savedAt).toLocaleDateString('ja-JP')}</span>
            <button className="small" onClick={() => loadSceneLS(s.name)}>読込</button>
            <button className="small danger" onClick={() => { deleteSceneLS(s.name); location.reload() }}>×</button>
          </div>
        ))}
        {saved.length === 0 && <div className="empty-hint">保存されたシーンはありません</div>}
      </div>

      <h3>表示</h3>
      <Toggle label="器具メッシュを表示" value={settings.showFixtureMeshes} onChange={v => update({ showFixtureMeshes: v })} />
      <Toggle label="役者を表示" value={settings.showPerformers} onChange={v => update({ showPerformers: v })} />
      <Toggle label="ステージを表示" value={settings.showStage} onChange={v => update({ showStage: v })} />
      <Toggle label="ビーム円錐ガイド" value={settings.showGizmos} onChange={v => update({ showGizmos: v })} />
      <Toggle label="客電 (ハウスライト)" value={settings.showHouseLights} onChange={v => update({ showHouseLights: v })} />
    </>
  )
}

// ============ 表現 (見た目 + 性能) ============
function LookSection() {
  const settings = useStore(s => s.settings)
  const update = useStore(s => s.updateSettings)
  const q = QUALITY_PRESETS[settings.quality]
  return (
    <>
      <h3>雰囲気</h3>
      <Slider label="ヘイズ濃度" hint="スモークの量。ビームが太く見える" value={settings.hazeDensity} min={0} max={1} onChange={v => update({ hazeDensity: v })} />
      <Slider label="アンビエント" hint="全体に乗る最小光。陰影の硬さに影響" value={settings.ambient} min={0} max={0.1} step={0.001} onChange={v => update({ ambient: v })} />
      <Slider label="露出" hint="カメラのEV補正" value={settings.exposure} min={0.2} max={3} onChange={v => update({ exposure: v })} />
      <Slider label="ブルーム" hint="光のにじみ。劇場っぽい質感" value={settings.bloom} min={0} max={2} onChange={v => update({ bloom: v })} />

      <h3>描画品質</h3>
      <div className="quality-grid">
        {(['low', 'medium', 'high', 'ultra'] as QualityPreset[]).map(qp => (
          <button
            key={qp}
            className={'quality-btn' + (settings.quality === qp ? ' active' : '')}
            onClick={() => update({ quality: qp })}
          >{QUALITY_LABELS[qp]}</button>
        ))}
      </div>
      <div className="info-block" style={{ fontSize: 10, lineHeight: 1.5, marginTop: 6 }}>
        サンプル <b>{q.volumetricSteps}</b> / シャドウ <b>{q.shadowSteps}</b> / 解像度 <b>{Math.round(q.volumetricScale * 100)}%</b> / DPR <b>{q.pixelRatio}</b>
      </div>
      <div className="info-block" style={{ fontSize: 10, marginTop: 4, color: '#998468' }}>
        動作が重い場合は <b>Low</b> へ。古いPC/タブレットで約 10 倍軽量に。
      </div>
    </>
  )
}

const QUALITY_LABELS: Record<QualityPreset, string> = {
  low: 'Low', medium: 'Medium', high: 'High', ultra: 'Ultra',
}

// ============ 高度ツール (準備中) ============
function AdvancedPlaceholder() {
  return (
    <div className="info-block" style={{ padding: 24, textAlign: 'center', fontSize: 13, lineHeight: 1.7 }}>
      <div style={{ fontSize: 28, marginBottom: 8 }}>🚧</div>
      <b>高度ツールは現在準備中です</b>
      <div style={{ marginTop: 8, opacity: 0.7, fontSize: 12 }}>
        照度プローブ・GDTF/IES取込・DMX出力などを検証中。<br />
        公開までしばらくお待ちください。
      </div>
    </div>
  )
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
function AdvancedSection() {
  const settings = useStore(s => s.settings)
  const update = useStore(s => s.updateSettings)
  const measurement = useStore(s => s.probeMeasurement)
  const selection = useStore(s => s.selection)
  const selectedFixture = useStore(s => s.fixtures.find(f => f.id === selection.id && selection.kind === 'fixture'))
  const addSetPiece = useStore(s => s.addSetPiece)
  const setPieces = useStore(s => s.setPieces)
  const removeSetPiece = useStore(s => s.removeSetPiece)
  const fixtures = useStore(s => s.fixtures)
  const [gdtfPreview, setGdtfPreview] = useState<GDTFInfo | null>(null)
  const [dmxStatus, setDmxStatus] = useState<'idle' | 'connected' | 'error'>('idle')
  const [dmxError, setDmxError] = useState('')

  return (
    <>
      <h3>照度プローブ (lux 計測)</h3>
      <Toggle label="プローブモード" value={settings.probeMode} onChange={v => update({ probeMode: v })} />
      {settings.probeMode && (
        <div className="info-block" style={{ fontSize: 11 }}>
          3D空間をクリックするとその点の照度を計測します
        </div>
      )}
      {measurement && (
        <div className="measure-card">
          <div className="big-num">{measurement.totalLux.toFixed(0)} <span className="unit">lux</span></div>
          <div className="sub-num">
            {luxToFc(measurement.totalLux).toFixed(2)} fc / 寄与 {measurement.contributions.length} 灯
          </div>
          {measurement.contributions.slice(0, 3).map(c => (
            <div key={c.fixtureId} style={{ fontSize: 10, color: '#c9b896' }}>
              {c.fixtureName}: {c.illuminanceLux.toFixed(0)} lux ({c.distanceM.toFixed(1)}m)
            </div>
          ))}
        </div>
      )}

      {selectedFixture && (
        <>
          <h3>選択中フィクスチャの色</h3>
          <FixtureColorInfo color={selectedFixture.color} />
        </>
      )}

      <h3>IES ファイル取込</h3>
      <IESPanel />

      <h3>GDTF フィクスチャ取込</h3>
      <label className="file-btn">
        .gdtf ファイル選択
        <input type="file" accept=".gdtf" hidden onChange={async e => {
          const f = e.target.files?.[0]; if (!f) return
          try {
            const xml = await unzipGDTF(f)
            setGdtfPreview(parseGDTFXML(xml))
          } catch (err: any) {
            alert('GDTF取込エラー: ' + err.message)
          }
        }} />
      </label>
      {gdtfPreview && (
        <div className="info-block" style={{ marginTop: 6, fontSize: 11 }}>
          <b>{gdtfPreview.manufacturer} {gdtfPreview.model}</b><br/>
          ビーム角: {gdtfPreview.beamAngleDeg.toFixed(1)}° / 全光束: {gdtfPreview.fluxLumens.toFixed(0)} lm<br/>
          <button className="primary" style={{ marginTop: 4 }} onClick={() => {
            const profile = gdtfToProfile(gdtfPreview)
            const key = `gdtf_${Date.now()}`
            ;(window as any).__addGDTFProfile?.(key, profile)
            alert('プロファイルを追加しました')
          }}>ライブラリへ追加</button>
        </div>
      )}

      <h3>GLTF セットピース取込</h3>
      <label className="file-btn">
        GLTF/GLB ファイル選択
        <input type="file" accept=".gltf,.glb" hidden onChange={async e => {
          const f = e.target.files?.[0]; if (f) { await importGLTFFile(f, addSetPiece) }
        }} />
      </label>
      {setPieces.length > 0 && (
        <div className="list" style={{ marginTop: 4 }}>
          {setPieces.map(sp => (
            <div key={sp.id} className="fixture-row">
              <span className="name">{sp.name}</span>
              <button className="small danger" onClick={() => removeSetPiece(sp.id)}>×</button>
            </div>
          ))}
        </div>
      )}

      <h3>DMX 出力 (WebSerial / Enttec OpenDMX)</h3>
      {!isWebSerialSupported() ? (
        <div className="info-block" style={{ color: '#d4af6f' }}>
          このブラウザは WebSerial 非対応 (Chrome / Edge 推奨)
        </div>
      ) : (
        <>
          <div className="row">
            <button
              className={dmxStatus === 'connected' ? 'danger' : 'primary'}
              onClick={async () => {
                if (dmxStatus === 'connected') {
                  await disconnectDMX(); setDmxStatus('idle')
                } else {
                  const r = await connectDMX()
                  if (r.ok) setDmxStatus('connected')
                  else { setDmxStatus('error'); setDmxError(r.error || '') }
                }
              }}
              style={{ flex: 1 }}
            >{dmxStatus === 'connected' ? 'DMX 切断' : 'DMX 接続'}</button>
          </div>
          {dmxStatus === 'error' && <div className="info-block" style={{ color: '#c8482d', marginTop: 4 }}>{dmxError}</div>}
          {dmxStatus === 'connected' && fixtures.length > 0 && (
            <div className="info-block" style={{ fontSize: 10, marginTop: 4 }}>
              30Hz で送信中。各フィクスチャ INT/R/G/B の 4ch
              <table className="contrib-table" style={{ marginTop: 4 }}>
                <thead><tr><th>器具</th><th>DMX</th></tr></thead>
                <tbody>
                  {fixtures.slice(0, 6).map((f, i) => {
                    const a = getFixtureDMXAddress(i)
                    return <tr key={f.id}><td>{f.name}</td><td>{a.start}〜{a.end}</td></tr>
                  })}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}
    </>
  )
}

function FixtureColorInfo({ color }: { color: [number, number, number] }) {
  const [x, y] = rgbToXy(...color)
  const cct = xyToCCT(x, y)
  return (
    <div className="info-block" style={{ fontSize: 11 }}>
      色温度 CCT: <b>{cct > 1000 && cct < 15000 ? `${Math.round(cct)} K` : '—'}</b><br/>
      CIE xy: ({x.toFixed(3)}, {y.toFixed(3)})
    </div>
  )
}

function Toggle({ label, value, onChange }: { label: string; value: boolean; onChange: (v: boolean) => void }) {
  return (
    <div className="row">
      <label style={{ flex: 1 }}>{label}</label>
      <input type="checkbox" checked={value} onChange={e => onChange(e.target.checked)} />
    </div>
  )
}

function Slider({ label, hint, value, min, max, step, onChange, unit, fmt }: {
  label: string; hint?: string; value: number; min: number; max: number; step?: number;
  onChange: (v: number) => void; unit?: string; fmt?: (v: number) => string;
}) {
  return (
    <div className="row" title={hint}>
      <label>{label}</label>
      <input type="range" min={min} max={max} step={step ?? 0.01} value={value} onChange={e => onChange(parseFloat(e.target.value))} />
      <span className="numval">{fmt ? fmt(value) : value.toFixed(2)}{unit ?? ''}</span>
    </div>
  )
}
