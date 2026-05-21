import { useState } from 'react'
import { useStore } from '../store'
import { IESPanel } from './IESViewer'
import {
  rgbToXy, xyToCCT, xyToDuv, estimateCRI,
  classifyIlluminance, STAGE_ILLUMINANCE_REFERENCES,
} from '../photometric/colorScience'
import { luxToFc, luxToEV100 } from '../photometric/illuminance'

// Pro タブ: 測光プローブ、CIE色情報、IES取込、JIS照度基準

export function ProPanel() {
  const settings = useStore(s => s.settings)
  const update = useStore(s => s.updateSettings)
  const measurement = useStore(s => s.probeMeasurement)
  const selection = useStore(s => s.selection)
  const selectedFixture = useStore(s => s.fixtures.find(f => f.id === selection.id && selection.kind === 'fixture'))

  return (
    <div className="panel-body">
      <h2>Pro 計測 / 色科学</h2>

      <h3>照度プローブ</h3>
      <div className="row">
        <label>プローブモード</label>
        <input type="checkbox" checked={settings.probeMode} onChange={e => update({ probeMode: e.target.checked })} />
        <span style={{ flex: 1, fontSize: 10, color: '#889' }}>
          {settings.probeMode ? '3D空間をクリックで計測' : 'ONにしてクリック'}
        </span>
      </div>
      {measurement && <MeasurementCard />}

      <h3>選択中フィクスチャの色科学</h3>
      {selectedFixture ? <ColorScienceCard color={selectedFixture.color} whiteMix={selectedFixture.whiteMix} /> :
        <div className="empty-hint">フィクスチャを選択してください</div>}

      <IESPanel />

      <h3>JIS 舞台照度参考</h3>
      <table className="ref-table">
        <thead><tr><th>レベル</th><th>lux</th><th>用途</th></tr></thead>
        <tbody>
          {STAGE_ILLUMINANCE_REFERENCES.map(r => (
            <tr key={r.level}>
              <td><b>{r.level}</b></td>
              <td>{r.min}〜{r.max}</td>
              <td style={{ color: '#aac' }}>{r.description}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function MeasurementCard() {
  const m = useStore(s => s.probeMeasurement)!
  const cls = classifyIlluminance(m.totalLux)
  const [x, y] = rgbToXy(...m.blendedColor)
  const cct = xyToCCT(x, y)
  const duv = xyToDuv(x, y)
  return (
    <div className="measure-card">
      <div className="big-num">{m.totalLux.toFixed(1)} <span className="unit">lux</span></div>
      <div className="sub-num">
        {luxToFc(m.totalLux).toFixed(2)} fc / EV {luxToEV100(m.totalLux).toFixed(1)} / {m.totalCdM2Approx.toFixed(2)} cd/m² 近似
      </div>
      <div className="ref-label">分類: <b>{cls.level}</b> ({cls.description})</div>
      <div style={{ marginTop: 6, fontSize: 10, color: '#aac' }}>
        合成色 CIE xy = ({x.toFixed(3)}, {y.toFixed(3)}) / CCT ≈ {cct > 0 ? cct.toFixed(0) + ' K' : '—'} / Duv {duv.toFixed(4)}
      </div>
      <h4 style={{ margin: '8px 0 4px', fontSize: 10, color: '#889' }}>寄与の大きい光源</h4>
      <table className="contrib-table">
        <thead><tr><th>器具</th><th>lux</th><th>cd</th><th>距離</th></tr></thead>
        <tbody>
          {m.contributions.slice(0, 6).map(c => (
            <tr key={c.fixtureId} style={{ opacity: c.withinBeam ? 1 : 0.6 }}>
              <td>{c.fixtureName}</td>
              <td>{c.illuminanceLux.toFixed(1)}</td>
              <td>{Math.round(c.intensityCandela).toLocaleString()}</td>
              <td>{c.distanceM.toFixed(1)}m</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function ColorScienceCard({ color, whiteMix }: { color: [number, number, number]; whiteMix: number }) {
  const [x, y] = rgbToXy(...color)
  const cct = xyToCCT(x, y)
  const duv = xyToDuv(x, y)
  const cri = estimateCRI(...color, whiteMix)
  // CIE 1931 diagram 描画 (簡易)
  return (
    <div className="measure-card">
      <CIEDiagram x={x} y={y} />
      <div style={{ marginTop: 4 }}>
        <div>CIE xy = ({x.toFixed(3)}, {y.toFixed(3)})</div>
        <div>CCT (相関色温度) ≈ {isFinite(cct) && cct > 0 ? `${cct.toFixed(0)} K` : '—'}</div>
        <div>Duv (黒体軌跡からの偏差) = {duv.toFixed(4)}</div>
        <div>CRI (Ra) 推定 ≈ {cri.toFixed(0)}</div>
      </div>
    </div>
  )
}

// CIE 1931 色度図 (簡易)
function CIEDiagram({ x, y }: { x: number; y: number }) {
  const W = 200, H = 200
  // CIE スペクトラル軌跡 (代表点 380nm..700nm)
  const locus = [
    [0.174, 0.005], [0.155, 0.020], [0.140, 0.045], [0.108, 0.084], [0.069, 0.200], [0.039, 0.380],
    [0.022, 0.570], [0.043, 0.750], [0.130, 0.825], [0.270, 0.755], [0.360, 0.625],
    [0.430, 0.555], [0.512, 0.488], [0.580, 0.420], [0.660, 0.340], [0.735, 0.265],
  ]
  const px = (xx: number) => 8 + xx * (W - 16) / 0.8
  const py = (yy: number) => H - 8 - yy * (H - 16) / 0.9
  const locusPath = locus.map((p, i) => `${i === 0 ? 'M' : 'L'}${px(p[0])},${py(p[1])}`).join(' ')
  return (
    <svg width={W} height={H} className="cie-svg">
      <rect x={0} y={0} width={W} height={H} fill="#0f0f14" />
      {/* 軸 */}
      <line x1={px(0)} y1={py(0)} x2={px(0.8)} y2={py(0)} stroke="#444" />
      <line x1={px(0)} y1={py(0)} x2={px(0)} y2={py(0.9)} stroke="#444" />
      {/* スペクトラル軌跡 */}
      <path d={locusPath + ' Z'} fill="rgba(150, 200, 255, 0.08)" stroke="#6cf" strokeWidth="0.8" />
      {/* D65 (white point) */}
      <circle cx={px(0.3127)} cy={py(0.3290)} r={2.5} fill="#fff" />
      {/* 入力色 */}
      <circle cx={px(x)} cy={py(y)} r={4} fill="#ffeb3b" stroke="#000" strokeWidth="1" />
    </svg>
  )
}
