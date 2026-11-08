import { useMemo, useRef, useEffect } from 'react'
import * as THREE from 'three'
import { useThree } from '@react-three/fiber'
import { useStore, type Fixture } from '../store'
import { cycBeamAttenuation, fixtureSpotlightModel } from '../lighting/spotlightModel'
import { FIXTURE_PROFILES } from '../lighting/fixtureTypes'
import { hasMeasuredFresnel } from '../photometric/measuredFresnel'
import { hasMeasuredCyc } from '../photometric/measuredCyc'

const cycMap = new THREE.DataTexture(new Uint8Array(Array.from({ length: 64 * 64 }, (_, index) => {
  const x = ((index % 64) + 0.5) / 32 - 1
  const y = (Math.floor(index / 64) + 0.5) / 32 - 1
  return Math.round(255 * cycBeamAttenuation(x, y))
}).flatMap(value => [value, value, value, 255])), 64, 64)
cycMap.needsUpdate = true

// シンプル舞台照明:
// - 各フィクスチャに three.js SpotLight (床/役者の照射)
// - 半透明コーン (additive) でヘイズ中のビーム可視化
// 物理ベースの厳密さよりも「滑らかで読みやすい」を優先。

// ビームコーン用シェーダー: 根元で濃く、先端と外周で透明に
const coneVertex = /* glsl */ `
varying float vAxial;   // 0 (根元) .. 1 (先端)
varying float vRadial;  // 0 (中心) .. 1 (外周)
void main() {
  // コーンは +Y 方向に伸びる (tip=+h/2, base=-h/2)
  // position.y: -h/2 (base) .. +h/2 (tip)
  // axial: 0 (tip 根元) → 1 (base 先端) として描画したい
  // ※ レンダリング時に rotate して使うので、'tip' = 光源、'base' = ビーム先端
  vAxial = 1.0 - (position.y + 0.5);   // 高さ1で正規化
  // 半径方向: xz 距離 / 現在の半径 (≈ vAxial)
  float r = length(position.xz);
  float maxR = max(vAxial, 1e-3);
  vRadial = clamp(r / maxR, 0.0, 1.0);
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`
const coneFragment = /* glsl */ `
precision highp float;
varying float vAxial;
varying float vRadial;
uniform vec3 uColor;
uniform float uIntensity;
uniform float uHaze;
void main() {
  // 根元 (光源側) で明るく、先端でフェード
  float ax = 1.0 - vAxial;  // 0=tip(光源), 1=base(遠方)
  // フィクスチャ本体を視認できるようコーン最先端は透明に
  float tipFade = smoothstep(0.03, 0.10, ax);
  float axialFalloff = pow(ax, 1.6) * tipFade;
  // 半径方向: ガウシアン (外周ほどソフトに)
  float radial = exp(-vRadial * vRadial * 3.5);
  float a = axialFalloff * radial * uHaze * uIntensity * 0.12;
  gl_FragColor = vec4(uColor * a, a);
}
`

export function Beams() {
  const fixtures = useStore(s => s.fixtures)
  const hazeDensity = useStore(s => s.settings.hazeDensity)
  const maxTextures = useThree(s => s.gl.capabilities.maxTextures)
  const active = fixtures.filter(f => f.enabled)
  // 投影画像と影は同じフラグメントシェーダーのテクスチャ枠を使うため、端末の上限に収める。
  const textureBudget = Math.max(0, maxTextures - 4)
  const mapped = new Set(active
    .filter(f => hasMeasuredFresnel(f) || hasMeasuredCyc(f) || FIXTURE_PROFILES[f.presetKey]?.beamShape === 'cyc')
    .slice(0, textureBudget)
    .map(f => f.id))
  const shadowLimit = Math.max(0, textureBudget - mapped.size)
  const shadowed = new Set(active
    .filter(f => FIXTURE_PROFILES[f.presetKey]?.beamShape !== 'cyc')
    .sort((a, b) => Number(hasMeasuredFresnel(b)) - Number(hasMeasuredFresnel(a)))
    .slice(0, shadowLimit)
    .map(f => f.id))
  return (
    <group>
      {active.map(f => (
        <Beam key={f.id} fixture={f} hazeDensity={hazeDensity} allowMap={mapped.has(f.id)} castShadow={shadowed.has(f.id)} />
      ))}
    </group>
  )
}

function Beam({ fixture, hazeDensity, allowMap, castShadow }: { fixture: Fixture; hazeDensity: number; allowMap: boolean; castShadow: boolean }) {
  const targetRef = useRef<THREE.Object3D>(new THREE.Object3D())
  const lightRef = useRef<THREE.SpotLight>(null)
  const coneRef = useRef<THREE.Mesh>(null)
  const matRef = useRef<THREE.ShaderMaterial>(null)

  const spotlight = useMemo(() => fixtureSpotlightModel(fixture), [fixture])
  const { color, fieldAngleRad, halfAngle } = spotlight

  // コーン: 光源→ターゲット方向、長さは固定 (シーン外まで届かせる)
  const beamLength = 14
  const baseRadius = beamLength * Math.tan(fieldAngleRad * 0.5)

  // ターゲット位置を target prop に追従させる
  useEffect(() => {
    if (!lightRef.current) return
    targetRef.current.position.set(...fixture.target)
    targetRef.current.updateMatrixWorld()
    lightRef.current.target = targetRef.current
  }, [fixture.target])

  // コーン姿勢: tip を fixture.position、base を target 方向へ
  const coneTransform = useMemo(() => {
    const from = new THREE.Vector3(...fixture.position)
    const to = new THREE.Vector3(...fixture.target)
    const dir = new THREE.Vector3().subVectors(to, from).normalize()
    // ConeGeometry は +Y に伸び、tip が +y/2、base が -y/2
    // 中央 (y=0) を 'beamLength/2' の位置に持ってくる、tip を fixture.position に
    const mid = from.clone().addScaledVector(dir, beamLength / 2)
    const q = new THREE.Quaternion()
    // tip = +y、base = -y。 dir 方向に base を向けたいので、-Y を dir に合わせる
    q.setFromUnitVectors(new THREE.Vector3(0, -1, 0), dir)
    return { position: mid.toArray() as [number, number, number], quaternion: q }
  }, [fixture.position, fixture.target])

  return (
    <group>
      <primitive object={targetRef.current} position={fixture.target} />
      <spotLight
        ref={lightRef}
        position={fixture.position}
        color={color}
        intensity={spotlight.intensityCandela}
        angle={halfAngle}
        penumbra={spotlight.penumbra}
        map={allowMap ? spotlight.map ?? (spotlight.beamShape === 'cyc' ? cycMap : null) : null}
        distance={0}
        decay={spotlight.decay}
        castShadow={castShadow}
        shadow-mapSize-width={1024}
        shadow-mapSize-height={1024}
        shadow-bias={-0.0005}
        shadow-normalBias={0.04}
      />
      <mesh
        ref={coneRef}
        position={coneTransform.position}
        quaternion={coneTransform.quaternion}
        renderOrder={2}
        raycast={() => null}
      >
        <coneGeometry args={[baseRadius, beamLength, 32, 1, true]} />
        <shaderMaterial
          ref={matRef}
          vertexShader={coneVertex}
          fragmentShader={coneFragment}
          transparent
          depthWrite={false}
          blending={THREE.AdditiveBlending}
          side={THREE.DoubleSide}
          uniforms={{
            uColor: { value: color },
            uIntensity: { value: fixture.intensity },
            uHaze: { value: hazeDensity },
          }}
        />
      </mesh>
    </group>
  )
}
