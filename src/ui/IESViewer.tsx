import { useMemo, useState } from 'react'
import { parseIES, computeBeamAngles, type IESData } from '../photometric/iesParser'
import { useStore } from '../store'

// IES ファイル取込 + 配光曲線 (極座標) 表示 + ライブラリへ登録

export function IESPanel() {
  const [data, setData] = useState<IESData | null>(null)
  const [fileName, setFileName] = useState<string>('')
  const [error, setError] = useState<string>('')
  const add = useStore(s => s.addFixture)

  const onFile = async (file: File) => {
    setError('')
    setFileName(file.name)
    try {
      const text = await file.text()
      const ies = parseIES(text)
      setData(ies)
    } catch (e: any) {
      setError(String(e.message ?? e))
      setData(null)
    }
  }

  const angles = data ? computeBeamAngles(data) : null

  return (
    <div className="ies-panel">
      <h3>IES ファイル import</h3>
      <div className="row">
        <label>ファイル</label>
        <input
          type="file"
          accept=".ies,.IES,text/plain"
          onChange={e => {
            const f = e.target.files?.[0]
            if (f) onFile(f)
          }}
        />
      </div>
      {error && <div className="info-block" style={{ color: '#f88' }}>エラー: {error}</div>}
      {data && (
        <>
          <div className="info-block" style={{ marginTop: 6, fontSize: 11 }}>
            <div><b>{fileName}</b></div>
            {data.keywords.MANUFAC && <div>製造元: {data.keywords.MANUFAC}</div>}
            {data.keywords.LUMCAT && <div>品番: {data.keywords.LUMCAT}</div>}
            {data.keywords.LAMP && <div>ランプ: {data.keywords.LAMP}</div>}
            <div>全光束: {data.fluxLumens.toLocaleString()} lm</div>
            <div>ピーク光度: {Math.round(data.peakCandela).toLocaleString()} cd</div>
            <div>消費電力: {data.inputWatts} W</div>
            {angles && (
              <div>
                ビーム角 (50%): {angles.beam.toFixed(1)}° / フィールド角 (10%): {angles.field.toFixed(1)}°
              </div>
            )}
          </div>
          <PolarPlot ies={data} />
        </>
      )}
    </div>
  )
}

// 配光曲線の極座標表示 (SVG)
function PolarPlot({ ies }: { ies: IESData }) {
  const W = 280, H = 280
  const cx = W / 2, cy = H / 2
  const maxR = Math.min(W, H) / 2 - 12

  // 軸対称の場合は水平平均、そうでなければ最初の水平面
  const intensities = useMemo(() => {
    const arr: { angle: number; cd: number }[] = []
    for (let v = 0; v < ies.numVerticalAngles; v++) {
      let sum = 0
      for (let h = 0; h < ies.numHorizontalAngles; h++) sum += ies.candela[v][h]
      arr.push({ angle: ies.verticalAngles[v], cd: sum / ies.numHorizontalAngles })
    }
    return arr
  }, [ies])

  const peak = ies.peakCandela || 1
  // 0°=下向き (typical photometric), 上向きにマップ表示するため -90° 回転
  const toXY = (angleDeg: number, cd: number) => {
    const r = (cd / peak) * maxR
    const a = (angleDeg - 90) * Math.PI / 180  // 上が0°, 時計回り
    return [cx + r * Math.cos(a), cy + r * Math.sin(a)]
  }

  // ミラー表示 (左右対称な配光曲線らしく)
  const points = intensities.map(p => toXY(p.angle, p.cd))
  const pointsMirror = intensities.map(p => toXY(-p.angle, p.cd))
  const path = [
    ...pointsMirror.slice().reverse(),
    ...points,
  ].map((p, i) => (i === 0 ? `M${p[0]},${p[1]}` : `L${p[0]},${p[1]}`)).join(' ') + ' Z'

  // 同心円グリッド (0.25, 0.5, 0.75, 1.0)
  const grids = [0.25, 0.5, 0.75, 1.0].map(r => r * maxR)

  return (
    <svg width={W} height={H} className="polar-plot">
      <defs>
        <radialGradient id="polarGrad" cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor="#ffeb3b88" />
          <stop offset="80%" stopColor="#ff980044" />
          <stop offset="100%" stopColor="#ff572200" />
        </radialGradient>
      </defs>
      {/* グリッド */}
      {grids.map((r, i) => (
        <circle key={i} cx={cx} cy={cy} r={r} fill="none" stroke="#333" strokeDasharray="2 2" />
      ))}
      {/* 角度線 (30度刻み) */}
      {[0, 30, 60, 90, 120, 150].map(deg => {
        const a = (deg - 90) * Math.PI / 180
        const x = cx + maxR * Math.cos(a)
        const y = cy + maxR * Math.sin(a)
        return <line key={deg} x1={cx} y1={cy} x2={x} y2={y} stroke="#222" />
      })}
      {[0, 30, 60, 90, 120, 150].map(deg => {
        const a = (deg - 90) * Math.PI / 180
        const x = cx + (maxR + 6) * Math.cos(a)
        const y = cy + (maxR + 6) * Math.sin(a)
        return (
          <text key={`l${deg}`} x={x} y={y} fontSize="9" fill="#778" textAnchor="middle" dy="0.35em">
            {deg}°
          </text>
        )
      })}
      {/* 配光曲線 */}
      <path d={path} fill="url(#polarGrad)" stroke="#ffeb3b" strokeWidth="1.2" />
      {/* 中心マーカー */}
      <circle cx={cx} cy={cy} r="2" fill="#ffeb3b" />
    </svg>
  )
}
