// IES LM-63 (1986/1991/1995/2002) パーサ
// 仕様: https://www.ies.org/standards/
//
// 主要な使い方:
//   const data = parseIES(textContent)
//   data.candela[angleVIdx][angleHIdx] で光度値 (cd)
//   data.fluxLumens 全光束 (推定)
//   data.beamAngleDeg 等角プロファイル抽出は computeBeamAngles で

export interface IESData {
  keywords: Record<string, string>
  tilt: 'NONE' | 'INCLUDE'
  numLamps: number
  lumensPerLamp: number
  candelaMultiplier: number
  numVerticalAngles: number
  numHorizontalAngles: number
  photometricType: 1 | 2 | 3       // 1=type C, 2=type B, 3=type A
  unitsType: 1 | 2                 // 1=feet, 2=meters
  width: number
  length: number
  height: number
  ballastFactor: number
  inputWatts: number
  verticalAngles: number[]         // degrees
  horizontalAngles: number[]
  candela: number[][]              // [vIdx][hIdx]
  // 派生値
  peakCandela: number
  fluxLumens: number               // numLamps * lumensPerLamp
}

export function parseIES(text: string): IESData {
  // 行ごとに分割し、コメントや IES 識別行をスキップ
  const lines = text.split(/\r?\n/).map(l => l.trim())
  let i = 0

  // フォーマット識別行を飛ばす (IESNA:LM-63-... など)
  if (lines[0]?.startsWith('IESNA') || lines[0]?.startsWith('IES:')) i++

  // キーワード [TAG]=value
  const keywords: Record<string, string> = {}
  while (i < lines.length) {
    const l = lines[i]
    if (l.startsWith('[')) {
      const m = l.match(/^\[([^\]]+)\]\s*(.*)$/)
      if (m) keywords[m[1]] = m[2]
      i++
    } else if (l.toUpperCase().startsWith('TILT=')) {
      break
    } else if (l === '') {
      i++
    } else {
      i++
    }
  }

  // TILT=
  if (!lines[i]?.toUpperCase().startsWith('TILT=')) {
    throw new Error('Invalid IES: TILT line not found')
  }
  const tilt = lines[i].split('=')[1]?.trim().toUpperCase() as 'NONE' | 'INCLUDE'
  i++
  if (tilt === 'INCLUDE') {
    // tilt block (4+N行): スキップ
    // line1: lamp_to_luminaire_geometry
    // line2: num_tilt_angles
    // line3: tilt_angles (N values)
    // line4: multiplying_factors (N values)
    // 簡略: 3行スキップ ... 厳密ではないが多くのファイルで足りる
    i += 4
  }

  // 全数値トークンを一気に読む
  const tokens: number[] = []
  for (; i < lines.length; i++) {
    const parts = lines[i].split(/\s+/).filter(Boolean)
    for (const p of parts) {
      const n = parseFloat(p)
      if (!isNaN(n)) tokens.push(n)
    }
  }

  let p = 0
  const read = () => tokens[p++]

  const numLamps = read()
  const lumensPerLamp = read()
  const candelaMultiplier = read()
  const numVerticalAngles = read()
  const numHorizontalAngles = read()
  const photometricType = read() as 1 | 2 | 3
  const unitsType = read() as 1 | 2
  const width = read()
  const length = read()
  const height = read()
  const ballastFactor = read()
  const _futureUse = read()  // 仕様上 1.0 固定
  const inputWatts = read()

  const verticalAngles: number[] = []
  for (let v = 0; v < numVerticalAngles; v++) verticalAngles.push(read())
  const horizontalAngles: number[] = []
  for (let h = 0; h < numHorizontalAngles; h++) horizontalAngles.push(read())

  // candela [v][h]
  const candela: number[][] = []
  let peak = 0
  for (let v = 0; v < numVerticalAngles; v++) {
    const row: number[] = []
    for (let h = 0; h < numHorizontalAngles; h++) {
      const c = read() * candelaMultiplier * ballastFactor
      row.push(c)
      if (c > peak) peak = c
    }
    candela.push(row)
  }

  return {
    keywords,
    tilt,
    numLamps,
    lumensPerLamp,
    candelaMultiplier,
    numVerticalAngles,
    numHorizontalAngles,
    photometricType,
    unitsType,
    width, length, height,
    ballastFactor,
    inputWatts,
    verticalAngles,
    horizontalAngles,
    candela,
    peakCandela: peak,
    fluxLumens: numLamps * lumensPerLamp,
  }
}

// IES データからビーム角 (50%) とフィールド角 (10%) を求める (vertical=0が中心軸の場合)
// 軸対称 (numHorizontalAngles=1) の単純ケースに対応
export function computeBeamAngles(ies: IESData): { beam: number; field: number; peak: number } {
  // 中心軸の光度 = peakCandela と仮定 (vertical=0 を含めば)
  const peak = ies.peakCandela
  if (peak <= 0) return { beam: 0, field: 0, peak: 0 }
  // 水平方向は平均
  const intensityAtV = (v: number): number => {
    let sum = 0
    for (let h = 0; h < ies.numHorizontalAngles; h++) sum += ies.candela[v][h]
    return sum / ies.numHorizontalAngles
  }
  const find = (ratio: number): number => {
    for (let v = 0; v < ies.numVerticalAngles; v++) {
      const I = intensityAtV(v)
      if (I < peak * ratio) {
        // 線形補間
        if (v === 0) return ies.verticalAngles[0]
        const prevI = intensityAtV(v - 1)
        const t = (peak * ratio - I) / (prevI - I + 1e-9)
        return ies.verticalAngles[v] + t * (ies.verticalAngles[v - 1] - ies.verticalAngles[v])
      }
    }
    return ies.verticalAngles[ies.verticalAngles.length - 1]
  }
  return { peak, beam: 2 * find(0.5), field: 2 * find(0.1) }
}
