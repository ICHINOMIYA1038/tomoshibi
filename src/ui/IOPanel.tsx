import { useState } from 'react'
import { useStore } from '../store'
import {
  listSavedScenes, saveSceneLS, loadSceneLS, deleteSceneLS,
  downloadSceneJSON, uploadSceneJSON, makeShareURL,
} from '../io/sceneIO'
import { unzipGDTF, parseGDTFXML, gdtfToProfile, type GDTFInfo } from '../io/gdtfParser'
import { importGLTFFile } from '../scene/SetPieces'
import {
  isWebSerialSupported, connectDMX, disconnectDMX, getLastDmxFrame, getFixtureDMXAddress,
} from '../io/dmxBridge'

export function IOPanel() {
  const [sceneName, setSceneName] = useState('myshow')
  const [gdtfPreview, setGdtfPreview] = useState<GDTFInfo | null>(null)
  const [dmxStatus, setDmxStatus] = useState<'idle' | 'connected' | 'error'>('idle')
  const [dmxError, setDmxError] = useState('')
  const [shareURL, setShareURL] = useState<string>('')

  const addSetPiece = useStore(s => s.addSetPiece)
  const setPieces = useStore(s => s.setPieces)
  const removeSetPiece = useStore(s => s.removeSetPiece)
  const saved = listSavedScenes()
  const fixtures = useStore(s => s.fixtures)

  return (
    <div className="panel-body">
      <h2>IO / 入出力</h2>

      <h3>シーン保存・読込</h3>
      <div className="row">
        <label>名前</label>
        <input type="text" value={sceneName} onChange={e => setSceneName(e.target.value)} />
      </div>
      <div className="row">
        <button className="primary" onClick={() => { saveSceneLS(sceneName); alert('保存しました') }}>保存</button>
        <button onClick={() => downloadSceneJSON(sceneName)}>JSON書出</button>
        <label className="file-btn">
          JSON読込
          <input type="file" accept=".json" hidden onChange={async e => {
            const f = e.target.files?.[0]; if (f) { await uploadSceneJSON(f) }
          }} />
        </label>
      </div>
      <div className="row">
        <button onClick={() => setShareURL(makeShareURL())} style={{ flex: 1 }}>URL共有リンク生成</button>
      </div>
      {shareURL && (
        <textarea className="share-url" readOnly value={shareURL} onClick={e => (e.target as HTMLTextAreaElement).select()} />
      )}
      <div className="list" style={{ marginTop: 6 }}>
        {saved.map(s => (
          <div key={s.name} className="fixture-row">
            <span className="name">{s.name}</span>
            <span style={{ fontSize: 10, color: '#778' }}>{new Date(s.savedAt).toLocaleString()}</span>
            <button className="small" onClick={() => loadSceneLS(s.name)}>読込</button>
            <button className="small danger" onClick={() => { deleteSceneLS(s.name); location.reload() }}>×</button>
          </div>
        ))}
        {saved.length === 0 && <div className="empty-hint">ローカルに保存されたシーンはありません</div>}
      </div>

      <h3>GLTF セットピース取込</h3>
      <label className="file-btn">
        GLTF/GLB ファイル選択
        <input type="file" accept=".gltf,.glb" hidden onChange={async e => {
          const f = e.target.files?.[0]; if (f) { await importGLTFFile(f, addSetPiece) }
        }} />
      </label>
      <div className="list" style={{ marginTop: 6 }}>
        {setPieces.map(sp => (
          <div key={sp.id} className="fixture-row">
            <span className="name">{sp.name}</span>
            <button className="small danger" onClick={() => removeSetPiece(sp.id)}>×</button>
          </div>
        ))}
      </div>

      <h3>GDTF フィクスチャ取込</h3>
      <label className="file-btn">
        .gdtf ファイル選択
        <input type="file" accept=".gdtf" hidden onChange={async e => {
          const f = e.target.files?.[0]; if (!f) return
          try {
            const xml = await unzipGDTF(f)
            const info = parseGDTFXML(xml)
            setGdtfPreview(info)
          } catch (err: any) {
            alert('GDTF取込エラー: ' + err.message)
          }
        }} />
      </label>
      {gdtfPreview && (
        <div className="info-block" style={{ marginTop: 6, fontSize: 11 }}>
          <b>{gdtfPreview.manufacturer} {gdtfPreview.model}</b><br/>
          ビーム角: {gdtfPreview.beamAngleDeg.toFixed(1)}° / フィールド: {gdtfPreview.fieldAngleDeg.toFixed(1)}°<br/>
          全光束: {gdtfPreview.fluxLumens.toFixed(0)} lm / 色温度: {gdtfPreview.colorTemperatureK} K<br/>
          <button className="primary" style={{ marginTop: 4 }} onClick={() => {
            // 動的にプロファイル追加
            const profile = gdtfToProfile(gdtfPreview)
            const key = `gdtf_${Date.now()}`
            ;(window as any).__addGDTFProfile?.(key, profile)
            alert('プロファイルを追加しました (フィクスチャタブから配置可)')
          }}>ライブラリへ追加</button>
        </div>
      )}

      <h3>DMX 出力 (WebSerial)</h3>
      {!isWebSerialSupported() ? (
        <div className="info-block" style={{ color: '#fa6' }}>
          このブラウザは WebSerial 非対応。Chrome/Edge をご使用ください。
        </div>
      ) : (
        <>
          <div className="row">
            <button
              className={dmxStatus === 'connected' ? 'danger' : 'primary'}
              onClick={async () => {
                if (dmxStatus === 'connected') {
                  await disconnectDMX()
                  setDmxStatus('idle')
                } else {
                  const r = await connectDMX()
                  if (r.ok) setDmxStatus('connected')
                  else { setDmxStatus('error'); setDmxError(r.error || '') }
                }
              }}
              style={{ flex: 1 }}
            >{dmxStatus === 'connected' ? 'DMX 切断' : 'DMX 接続 (Enttec OpenDMX)'}</button>
          </div>
          {dmxStatus === 'error' && <div className="info-block" style={{ color: '#f88', marginTop: 4 }}>{dmxError}</div>}
          {dmxStatus === 'connected' && (
            <div className="info-block" style={{ fontSize: 10, marginTop: 4 }}>
              30Hz で送信中 ({fixtures.length} 灯 × 4ch)。<br/>
              アサイン: 各フィクスチャ INT/R/G/B の 4ch
              <table className="contrib-table" style={{ marginTop: 4 }}>
                <thead><tr><th>器具</th><th>DMXアドレス</th></tr></thead>
                <tbody>
                  {fixtures.slice(0, 8).map((f, i) => {
                    const a = getFixtureDMXAddress(i)
                    return <tr key={f.id}><td>{f.name}</td><td>{a.start}〜{a.end}</td></tr>
                  })}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}
    </div>
  )
}
