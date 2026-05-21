// GDTF (General Device Type Format) パーサ - 最小実装
// GDTF はビーム角・全光束・色温度など測光特性を XML 内で保持する zip ファイル
// 仕様: https://gdtf.eu/gdtf/index.html  / DIN SPEC 15800
//
// 完全実装は膨大なため、ここでは
// - .gdtf (zip) を展開して description.xml を取り出す
// - <FixtureType> の Name/Manufacturer/Description
// - <PhotometricCharacteristics> から BeamAngle/FieldAngle/LuminousFlux/ColorTemperature
// だけ抽出してプロファイル生成

import { type FixtureProfile } from '../lighting/fixtureTypes'

export interface GDTFInfo {
  manufacturer: string
  model: string
  beamAngleDeg: number
  fieldAngleDeg: number
  fluxLumens: number
  colorTemperatureK: number
  raw: string  // 元 XML (デバッグ用)
}

// .gdtf zip → description.xml のテキスト
export async function unzipGDTF(file: File): Promise<string> {
  // JSZip を動的 import (依存追加を避けるため軽量ZIP実装にフォールバック可)
  const JSZip = (await import('jszip')).default
  const zip = await JSZip.loadAsync(file)
  const desc = zip.file('description.xml')
  if (!desc) throw new Error('description.xml が含まれていません')
  return await desc.async('text')
}

export function parseGDTFXML(xmlText: string): GDTFInfo {
  const parser = new DOMParser()
  const doc = parser.parseFromString(xmlText, 'application/xml')
  const err = doc.querySelector('parsererror')
  if (err) throw new Error('XML パースエラー: ' + err.textContent)
  const ft = doc.querySelector('FixtureType')
  if (!ft) throw new Error('FixtureType ノードが見つかりません')

  const model = ft.getAttribute('LongName') || ft.getAttribute('Name') || 'Unknown'
  const manufacturer = ft.getAttribute('Manufacturer') || ''

  // PhotometricCharacteristics は Beam ノードや他のノードに散在する場合がある
  // 最も一般的な BeamGeometry / Beam を探索
  const beams = Array.from(doc.querySelectorAll('Beam, BeamGeometry'))
  let beamAngleDeg = 30
  let fieldAngleDeg = 50
  let fluxLumens = 1000
  let colorTemperatureK = 6500
  for (const b of beams) {
    const ba = parseFloat(b.getAttribute('BeamAngle') || '')
    const fa = parseFloat(b.getAttribute('FieldAngle') || '')
    const lf = parseFloat(b.getAttribute('LuminousFlux') || '')
    const ct = parseFloat(b.getAttribute('ColorTemperature') || '')
    if (isFinite(ba)) beamAngleDeg = ba
    if (isFinite(fa)) fieldAngleDeg = fa
    if (isFinite(lf)) fluxLumens = lf
    if (isFinite(ct)) colorTemperatureK = ct
  }
  return {
    manufacturer, model,
    beamAngleDeg, fieldAngleDeg, fluxLumens, colorTemperatureK,
    raw: xmlText.slice(0, 4000),
  }
}

export function gdtfToProfile(info: GDTFInfo): FixtureProfile {
  // 種別の推定: ビーム角が小さければ Profile/Spot 大きければ Wash
  const kind = info.beamAngleDeg < 15 ? 'Profile' : info.beamAngleDeg < 35 ? 'Fresnel' : 'LED_PAR'
  const isLED = info.colorTemperatureK >= 4000  // 簡易: 4000K以上を LED 扱い
  return {
    kind: kind as any,
    brand: info.manufacturer,
    model: info.model,
    source: isLED ? 'led-rgbw' : 'tungsten',
    beamAngleDeg: info.beamAngleDeg,
    fieldAngleDeg: Math.max(info.fieldAngleDeg, info.beamAngleDeg * 1.2),
    flatness: kind === 'Profile' ? 3.0 : 1.3,
    peak: kind === 'Profile' ? 0.0 : 0.3,
    ellipticity: 1.0,
    fluxLumens: info.fluxLumens,
    beamAdjustable: false,
    colorTemperatureK: info.colorTemperatureK,
    bodyLengthM: kind === 'Profile' ? 0.55 : 0.32,
    bodyDiameterM: 0.22,
  }
}
