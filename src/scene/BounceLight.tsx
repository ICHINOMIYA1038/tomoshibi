// 光の跳ね返り（間接光）の近似。
// 本物の舞台では、床・ホリゾント・装置に当たった光が反射して、光の当たらない所もうっすら見える。
// 前は、どの明かりでも同じ弱い環境光だけだったので、照明を絞るほど装置や袖が真っ黒に消えた（2026-11-20 講評）。
//
// やり方（積分球の近似）：点いている器具ごとに、光束（lm）と当たる面（床・ホリ・それ以外）を見積もり、
// 面の反射率を掛けた反射光束を、舞台の箱の面積で割って、間接光の照度にする。
//   E_間接 ≈ Σ（反射率 × 光束）/（面積 ×（1 − 平均反射率））
// 床と装置の跳ね返りは下から、ホリの跳ね返りは奥から水平に来るものとして当てる。上からは当てない
// （上から当てると、ホリや床が一様に明るくなった。本物の舞台の天井は黒く、上からの跳ね返りはほとんど無い）。
// 黒い床と黒い幕の劇場では、本物でも跳ね返りは弱い。明るいホリや白い床にすると強くなる。
import { useMemo } from 'react'
import * as THREE from 'three'
import { useStore, type Fixture } from '../store'
import { fixtureSpotlightModel } from '../lighting/spotlightModel'
import { isCycWash } from '../lighting/cycWash'
import { hasMeasuredFresnel } from '../photometric/measuredFresnel'
import { hasMeasuredCyc } from '../photometric/measuredCyc'
import { DEFAULT_VENUE_LAYOUT } from '../venueLayout'
import { DEFAULT_CYC_COLOR, FLOOR_FINISHES } from '../stageParts'

/** 舞台の箱（床・ホリ・袖・天井・壁）の面積の目安（m²）。間口 14m・奥行き 10m・高さ 8m の箱 */
const ENCLOSURE_AREA = 520
/** 箱の平均反射率。黒い幕と黒い床が大半を占める */
const MEAN_REFLECTANCE = 0.1
/** 床とホリ以外（装置・役者・袖幕）に当たったときの反射率の目安 */
const OTHER_REFLECTANCE = 0.2
/** 実測の配光は中心が強く周りが落ちるので、ビームの立体角に中心の光度を掛けた分より少ない */
const MEASURED_SPREAD = 0.6

const luminance = (c: THREE.Color) => 0.2126 * c.r + 0.7152 * c.g + 0.0722 * c.b

/** 器具が出す光束の見積もり（lm、画面の明るさの単位にそろえる） */
function fixtureFlux(fixture: Fixture) {
  const model = fixtureSpotlightModel(fixture)
  const half = THREE.MathUtils.degToRad(Math.min(170, Math.max(1, fixture.beamAngleDeg)) / 2)
  const solid = 2 * Math.PI * (1 - Math.cos(half))
  const measured = hasMeasuredFresnel(fixture) || hasMeasuredCyc(fixture)
  return { flux: model.intensityCandela * solid * (measured ? MEASURED_SPREAD : 1), color: model.color }
}

export type BounceEstimate = { floor: THREE.Color; cyc: THREE.Color; other: THREE.Color }

/** 点いている器具から、床・ホリ・それ以外からの間接光の照度（色つき）を見積もる */
export function estimateBounce(fixtures: Fixture[], floorColor: THREE.Color, cycColor: THREE.Color): BounceEstimate {
  const out = { floor: new THREE.Color(0, 0, 0), cyc: new THREE.Color(0, 0, 0), other: new THREE.Color(0, 0, 0) }
  const scale = 1 / (ENCLOSURE_AREA * (1 - MEAN_REFLECTANCE))
  for (const fixture of fixtures) {
    if (!fixture.enabled || fixture.intensity <= 0) continue
    const { flux, color } = fixtureFlux(fixture)
    // 光の色を明るさ 1 にそろえ、光束を掛ける
    const tint = color.clone().multiplyScalar(1 / Math.max(1e-4, luminance(color)))
    const hitsCyc = isCycWash(fixture)
    const hitsFloor = !hitsCyc && fixture.target[1] < 1.6
    // 反射光の色 = 光の色 × 面の色。面の色は反射率そのもの（線形の値）
    if (hitsCyc) out.cyc.add(tint.multiply(cycColor).multiplyScalar(flux * scale))
    else if (hitsFloor) out.floor.add(tint.multiply(floorColor).multiplyScalar(flux * scale))
    else out.other.add(tint.multiplyScalar(OTHER_REFLECTANCE * flux * scale))
  }
  return out
}

export function BounceLight() {
  const fixtures = useStore(s => s.fixtures)
  const layout = useStore(s => s.productionPlan.venueLayout ?? DEFAULT_VENUE_LAYOUT)
  const floorColor = useMemo(() => {
    const finish = FLOOR_FINISHES.find(item => item.id === layout.floorFinish) ?? FLOOR_FINISHES[0]
    return layout.floorColor ? new THREE.Color(layout.floorColor) : new THREE.Color(...finish.color)
  }, [layout.floorFinish, layout.floorColor])
  const cycColor = useMemo(() => layout.cycColor ? new THREE.Color(layout.cycColor) : new THREE.Color(...DEFAULT_CYC_COLOR), [layout.cycColor])
  const bounce = useMemo(() => estimateBounce(fixtures, floorColor, cycColor), [fixtures, floorColor, cycColor])
  // 装置や役者に当たった光は、四方へ散るので半分だけ下からの跳ね返りに足す
  const ground = bounce.floor.clone().add(bounce.other.clone().multiplyScalar(0.5))
  return <>
    <hemisphereLight args={[new THREE.Color(0, 0, 0), ground, 1]} />
    {/* ホリの跳ね返りは、奥から舞台へ水平に当てる（床には当たらない） */}
    <directionalLight position={[0, 0, -7]} color={bounce.cyc.clone().multiplyScalar(1 / Math.max(1e-6, Math.max(bounce.cyc.r, bounce.cyc.g, bounce.cyc.b)))}
      intensity={Math.max(bounce.cyc.r, bounce.cyc.g, bounce.cyc.b)} />
  </>
}
