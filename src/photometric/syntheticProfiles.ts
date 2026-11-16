import type { IESProfile } from '../lighting-lab/photometry'

// メーカーの測光ファイル（IES）を使わず、公称のビーム角と光束から作った近似の配光表。
// 形は IES と同じ（角度の並びと光度の表）なので、配光表から照度を計算する処理はそのまま使える。

function range(from: number, to: number, step: number): number[] {
  const values: number[] = []
  for (let v = from; v <= to + 1e-9; v += step) values.push(Math.round(v * 1000) / 1000)
  return values
}

const rad = (deg: number) => deg * Math.PI / 180

/**
 * フレネル（1 kW 級の LED フレネル、ビーム角 28° の中くらいの絞り）。軸のまわりで同じ形（C-γ 形式）。
 * 中心からビーム角の半分で 50%、そこから外へなだらかに落ちる。光束 10,000 lm を目安にする
 */
export function syntheticFresnelProfile(beamAngleDeg = 28, fluxLumens = 10000): IESProfile {
  const half = beamAngleDeg / 2
  const shape = (gamma: number) => (Math.exp(-Math.LN2 * Math.pow(gamma / half, 2)) + 0.015 * Math.exp(-Math.pow(gamma / (half * 3.2), 2))) / 1.015
  const vertical = range(0, 90, 1)
  // Φ = 2π ∫ I(γ) sinγ dγ から、中心の光度を決める
  let integral = 0
  for (let g = 0; g < 90; g += 0.25) integral += shape(g + 0.125) * Math.sin(rad(g + 0.125)) * rad(0.25)
  const peakCandela = fluxLumens / (2 * Math.PI * integral)
  const column = vertical.map(g => peakCandela * shape(g))
  return { type: 1, vertical, horizontal: [0, 90], candela: [column, column.slice()], peakCandela, peakVerticalDeg: 0 }
}

/**
 * ホリゾント幕を下から上まで明るくするための、片側に強い配光（B-β 形式）。
 * 縦の角度は、器具の正面を 0° として、幕の上の方（遠い所）へ向かうほど強くし、55° 付近を最大にする。
 * 横は左右に広く（半分の強さになるのが ±50°）。光束 5,000 lm を目安にする
 */
export function syntheticCycProfile(fluxLumens = 5000): IESProfile {
  const vertical = range(-90, 90, 2.5)
  const horizontal = range(0, 90, 5)
  const verticalShape = (v: number) => {
    if (v <= -50 || v >= 85) return 0
    if (v <= 55) return 0.02 + 0.98 * Math.pow((v + 50) / 105, 3)
    return Math.pow(1 - (v - 55) / 30, 2)
  }
  const horizontalShape = (h: number) => Math.exp(-Math.LN2 * Math.pow(h / 50, 2)) * (h >= 90 ? 0 : 1)
  // B-β 形式の立体角: dΩ = cos(V) dV dH。横は左右対称なので 2 倍する
  let integral = 0
  const step = 1
  for (let v = -90; v < 90; v += step) {
    for (let h = 0; h < 90; h += step) {
      const vc = v + step / 2
      const hc = h + step / 2
      integral += verticalShape(vc) * horizontalShape(hc) * Math.cos(rad(vc)) * rad(step) * rad(step)
    }
  }
  const peakCandela = fluxLumens / (2 * integral)
  const candela = horizontal.map(h => vertical.map(v => peakCandela * verticalShape(v) * horizontalShape(h)))
  return { type: 2, vertical, horizontal, candela, peakCandela, peakVerticalDeg: 55 }
}
