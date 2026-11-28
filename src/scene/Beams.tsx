import { highlightFixtures, maskFixtures } from '../lighting/highlight'
import type { SetPiece } from '../types'
import { useMemo, useRef, useEffect } from 'react'
import * as THREE from 'three'
import { useFrame, useThree } from '@react-three/fiber'
import { smokeHaze } from './SmokeCloud'
import { goboOf, goboTexture, liveTarget, resolveFixture } from '../lighting/movingHead'
import { useStore, type Fixture } from '../store'
import { cycBeamAttenuation, fixtureSpotlightModel } from '../lighting/spotlightModel'
import { FIXTURE_PROFILES } from '../lighting/fixtureTypes'
import { hasMeasuredFresnel } from '../photometric/measuredFresnel'
import { hasProfileShutter } from '../photometric/profileShutter'
import { hasMeasuredCyc } from '../photometric/measuredCyc'
import { isCycWash, updateCycWash } from '../lighting/cycWash'

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

/** 光の通り道（器具から狙う点まで）に、窓の装置があるか。窓を通す光は、窓枠と壁の影で形が決まる */
function passesWindow(fixture: Fixture, setPieces: SetPiece[]) {
  const [px, py, pz] = fixture.position
  const dx = fixture.target[0] - px, dy = fixture.target[1] - py, dz = fixture.target[2] - pz
  const len2 = dx * dx + dy * dy + dz * dz
  if (len2 < 1e-6) return false
  return setPieces.some(piece => {
    if (piece.appearance !== 'window' || !piece.size) return false
    const [wx, wy, wz] = piece.position
    const t = ((wx - px) * dx + (wy - py) * dy + (wz - pz) * dz) / len2
    if (t <= 0 || t >= 1) return false
    const cx = px + dx * t - wx, cy = py + dy * t - wy, cz = pz + dz * t - wz
    const reach = Math.max(piece.size[0], piece.size[1]) * (piece.scale || 1) * 0.6
    return cx * cx + cy * cy + cz * cz < reach * reach
  })
}

// 影の枠は端末ごとに少ないので、影が見た目を決める器具から回す。
// 窓を通す光は、窓枠と壁の影が無いと、壁をすり抜けて窓の形にならない（2026-11-20。前はゴボの模様で窓の形を出していたが、器具を動かすと模様だけが動いた）
// スモークの中の光の筋を、影を計算している器具だけ、視線に沿って中を調べて描く（2026-11-21）。
// 光の届く点（器具の照射角の中で、影の中でない点）だけを光らせるので、窓を通る光の帯は窓枠の形になり、
// 役者や装置の後ろで筋が切れる。重いので、ほかの器具は上の円すいのまま
const VOLUME_STEPS = 28
/** スモークの濃さ（0〜1）を、散乱係数（1/m）に直す係数。舞台のヘイズは薄く、いちばん濃くて 0.02/m ほど */
const HAZE_SCATTER = 0.02
const volumeVertex = /* glsl */ `
varying vec3 vWorld;
void main() {
  vec4 world = modelMatrix * vec4(position, 1.0);
  vWorld = world.xyz;
  gl_Position = projectionMatrix * viewMatrix * world;
}
`
const volumeFragment = /* glsl */ `
precision highp float;
#include <common>
#include <packing>
#define HAZE_SCATTER ${HAZE_SCATTER.toFixed(3)}
varying vec3 vWorld;
uniform vec3 uColor;
uniform float uCandela;
uniform float uHaze;
uniform vec3 uLightPos;
uniform vec3 uLightDir;
uniform float uCosHalf;
uniform float uBeamLen;
uniform float uMarchLen;
uniform sampler2D uShadowMap;
uniform mat4 uShadowMatrix;
uniform float uHasShadow;
uniform float uShadowBias;
uniform sampler2D uSceneDepth;
uniform vec2 uResolution;
uniform float uNear;
uniform float uFar;
uniform float uHasDepth;
float hash(vec2 p) { return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }
float lit(vec3 p) {
  if (uHasShadow < 0.5) return 1.0;
  vec4 sc = uShadowMatrix * vec4(p, 1.0);
  sc.xyz /= sc.w;
  if (sc.x < 0.0 || sc.x > 1.0 || sc.y < 0.0 || sc.y > 1.0 || sc.z > 1.0) return 1.0;
  float depth = unpackRGBAToDepth(texture2D(uShadowMap, sc.xy));
  return step(sc.z + uShadowBias, depth);
}
void main() {
  vec3 dir = normalize(vWorld - cameraPosition);
  // 視線の先にある壁や床（深さだけ先に描いた絵）で、調べるのを止める。止めないと、壁の裏の光が壁の上に丸く透けた
  float tMax = 1e9;
  if (uHasDepth > 0.5) {
    float sceneViewZ = perspectiveDepthToViewZ(texture2D(uSceneDepth, gl_FragCoord.xy / uResolution).x, uNear, uFar);
    vec3 vView = (viewMatrix * vec4(vWorld, 1.0)).xyz;
    vec3 dv = mat3(viewMatrix) * dir;
    if (dv.z < -1e-4) tMax = (sceneViewZ - vView.z) / dv.z;
  }
  float stepLen = uMarchLen / float(${VOLUME_STEPS});
  float t = stepLen * hash(gl_FragCoord.xy);
  float acc = 0.0;
  for (int i = 0; i < ${VOLUME_STEPS}; i++) {
    if (t > tMax) break;
    vec3 p = vWorld + dir * t;
    t += stepLen;
    if (p.y < 0.0) break;
    vec3 v = p - uLightPos;
    float d = length(v);
    float c = dot(v / max(d, 1e-4), uLightDir);
    if (c < uCosHalf || d > uBeamLen) continue;
    // 照射角の縁ほど弱く、器具のすぐ前は器具を見せるため薄く
    float edge = smoothstep(uCosHalf, uCosHalf + (1.0 - uCosHalf) * 0.35, c);
    float near = smoothstep(0.3, 1.2, d);
    acc += edge * near * lit(p) / (d * d + 0.25);
  }
  // スモークに散った光の明るさ = 散乱係数 / 4π × 光度 / 距離² を、視線に沿って足したもの。
  // 床や壁と同じ単位（光度 cd・距離 m）で求め、同じ露出とトーンマッピングを通す
  float sigma = uHaze * HAZE_SCATTER;
  vec3 radiance = uColor * (sigma / (4.0 * PI)) * uCandela * acc * stepLen;
  gl_FragColor = vec4(radiance, 1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}
`

/** 光の筋を止めるための、舞台の物の深さだけを描いた絵（全器具で 1 枚を使い回す） */
const sceneDepth = {
  target: null as THREE.WebGLRenderTarget | null,
  material: new THREE.MeshBasicMaterial({ colorWrite: false }),
  uniforms: {
    uSceneDepth: { value: null as THREE.Texture | null },
    uResolution: { value: new THREE.Vector2(1, 1) },
    uNear: { value: 0.1 },
    uFar: { value: 1000 },
    uHasDepth: { value: 0 },
  },
}

function shadowPriority(fixture: Fixture, setPieces: SetPiece[]) {
  if (passesWindow(fixture, setPieces)) return 3
  // 床に置いた器具（転がし）は、下から当てて役者の大きな影をホリや壁に映すのが目的なので、影を先に回す（2026-11-21）
  if (fixture.position[1] < 1.0 && !isCycWash(fixture)) return 2.5
  if (FIXTURE_PROFILES[fixture.presetKey]?.kind === 'FollowSpot') return 2
  return hasMeasuredFresnel(fixture) ? 1 : 0
}

export function Beams() {
  const highlightId = useStore(s => s.highlightFixtureId)
  const stageMask = useStore(s => s.stageMask)
  const stageMaskRise = useStore(s => s.stageMaskRise)
  const stored = useStore(s => s.fixtures)
  const performers = useStore(s => s.performers)
  // 役者を追う照明は、狙いを役者に置き換えて描く（通しで見るでは、歩く役者についていく）
  const fixtures = useMemo(() => maskFixtures(highlightFixtures(stored.map(f => resolveFixture(f, performers)), highlightId), stageMask, stageMaskRise), [stored, performers, highlightId, stageMask, stageMaskRise])
  const sceneHaze = useStore(s => s.settings.hazeDensity)
  const setPieces = useStore(s => s.setPieces)
  // 置いたスモークマシンの煙が、会場の空気を濃くする
  const hazeDensity = Math.min(1, sceneHaze + smokeHaze(setPieces))
  const maxTextures = useThree(s => s.gl.capabilities.maxTextures)
  // ホリ用の器具は、スポットの光ではなく幕の材質で描く（cycWash.ts）
  const invalidate = useThree(s => s.invalidate)
  useEffect(() => { updateCycWash(fixtures); invalidate() }, [fixtures, invalidate])
  const active = fixtures.filter(f => f.enabled && !isCycWash(f))
  // 投影画像と影は同じフラグメントシェーダーのテクスチャ枠を使うため、端末の上限に収める。
  const textureBudget = Math.max(0, maxTextures - 4)
  const mapped = new Set(active
    .filter(f => hasMeasuredFresnel(f) || hasMeasuredCyc(f) || hasProfileShutter(f) || FIXTURE_PROFILES[f.presetKey]?.beamShape === 'cyc' || goboOf(f))
    .slice(0, textureBudget)
    .map(f => f.id))
  const shadowLimit = Math.max(0, textureBudget - mapped.size)
  const shadowed = new Set(active
    .filter(f => FIXTURE_PROFILES[f.presetKey]?.beamShape !== 'cyc')
    // 影の枠は少ないので、影がいちばん目立つピン（狭く強い光）に先に回す。ピンに影が無いと、
    // 役者の後ろの幕や窓に、役者の形の影ではなく丸い光がそのまま出た（2026-11-20）
    .sort((a, b) => shadowPriority(b, setPieces) - shadowPriority(a, setPieces))
    .slice(0, shadowLimit)
    .map(f => f.id))
  // 光の筋を中から調べる器具があるときだけ、毎フレーム、舞台の物の深さを先に描く（光の筋と光そのものは描かない）
  const beamsRef = useRef<THREE.Group>(null)
  // 画質「低」（スマホなど）では、重いので光の筋を中から調べない（今までの円すいで描く）
  const quality = useStore(s => s.settings.quality)
  const volumeOn = hazeDensity > 0 && shadowed.size > 0 && quality !== 'low'
  useFrame(({ gl, scene, camera }) => {
    const u = sceneDepth.uniforms
    if (!volumeOn || !(camera as THREE.PerspectiveCamera).isPerspectiveCamera || !beamsRef.current) { u.uHasDepth.value = 0; return }
    const size = gl.getDrawingBufferSize(new THREE.Vector2())
    const w = Math.max(1, Math.floor(size.x / 2)), h = Math.max(1, Math.floor(size.y / 2))
    if (!sceneDepth.target || sceneDepth.target.width !== w || sceneDepth.target.height !== h) {
      sceneDepth.target?.dispose()
      sceneDepth.target = new THREE.WebGLRenderTarget(w, h, { depthBuffer: true, depthTexture: new THREE.DepthTexture(w, h) })
    }
    const perspective = camera as THREE.PerspectiveCamera
    const prevOverride = scene.overrideMaterial, prevAuto = gl.shadowMap.autoUpdate, prevTarget = gl.getRenderTarget()
    beamsRef.current.visible = false
    scene.overrideMaterial = sceneDepth.material
    gl.shadowMap.autoUpdate = false
    gl.setRenderTarget(sceneDepth.target)
    gl.clear()
    gl.render(scene, camera)
    gl.setRenderTarget(prevTarget)
    gl.shadowMap.autoUpdate = prevAuto
    scene.overrideMaterial = prevOverride
    beamsRef.current.visible = true
    u.uSceneDepth.value = sceneDepth.target.depthTexture
    u.uResolution.value.copy(size)
    u.uNear.value = perspective.near
    u.uFar.value = perspective.far
    u.uHasDepth.value = 1
  })
  return (
    <group ref={beamsRef}>
      {active.map(f => (
        <Beam key={f.id} fixture={f} hazeDensity={hazeDensity} allowMap={mapped.has(f.id)} castShadow={shadowed.has(f.id)} volumetric={volumeOn && shadowed.has(f.id)} fineShadow={shadowed.has(f.id) && passesWindow(f, setPieces)} />
      ))}
    </group>
  )
}

function Beam({ fixture, hazeDensity, allowMap, castShadow, volumetric, fineShadow }: { fixture: Fixture; hazeDensity: number; allowMap: boolean; castShadow: boolean; volumetric: boolean; fineShadow: boolean }) {
  const targetRef = useRef<THREE.Object3D>(new THREE.Object3D())
  const lightRef = useRef<THREE.SpotLight>(null)
  const coneRef = useRef<THREE.Mesh>(null)
  const matRef = useRef<THREE.ShaderMaterial>(null)
  const invalidateBeam = useThree(state => state.invalidate)
  // uniforms は 1 つの物を使い続ける（描くたびに新しい物を渡すと、three は最初の物を見続けて値が映らない）
  const beamUniforms = useMemo(() => ({ uColor: { value: new THREE.Color() }, uIntensity: { value: 0 }, uHaze: { value: 0 } }), [])
  const volumeUniforms = useMemo(() => ({
    uColor: { value: new THREE.Color() }, uCandela: { value: 0 }, uHaze: { value: 0 },
    uLightPos: { value: new THREE.Vector3() }, uLightDir: { value: new THREE.Vector3(0, -1, 0) },
    uCosHalf: { value: 0.9 }, uBeamLen: { value: 10 }, uMarchLen: { value: 4 },
    uShadowMap: { value: null as THREE.Texture | null }, uShadowMatrix: { value: new THREE.Matrix4() },
    uHasShadow: { value: 0 }, uShadowBias: { value: -0.0005 },
    ...sceneDepth.uniforms,
  }), [])

  const spotlight = useMemo(() => fixtureSpotlightModel(fixture), [fixture])
  const { color, fieldAngleRad, halfAngle } = spotlight

  // 客席側からの長い照射でも、可視化する光束を狙いの先まで届かせる。
  // ホリゾントの器具は、幕の面で光が止まる。筋を幕の向こうまで伸ばすと、ロアーホリの光が幕を突き抜けた白い扇に見えた（2026-11-20）
  const cycWash = FIXTURE_PROFILES[fixture.presetKey]?.kind === 'Cyc'
  const throwM = new THREE.Vector3(...fixture.position).distanceTo(new THREE.Vector3(...fixture.target))
  const beamLength = cycWash ? Math.max(0.5, throwM) : Math.max(14, throwM + 4)
  const baseRadius = beamLength * Math.tan(fieldAngleRad * 0.5)

  // ターゲット位置を target prop に追従させる
  useEffect(() => {
    if (!lightRef.current) return
    targetRef.current.position.set(...fixture.target)
    targetRef.current.updateMatrixWorld()
    lightRef.current.target = targetRef.current
  }, [fixture.target])

  // コーン姿勢: tip を fixture.position、base を target 方向へ
  const coneOf = (target: [number, number, number]) => {
    const from = new THREE.Vector3(...fixture.position)
    const to = new THREE.Vector3(...target)
    const dir = new THREE.Vector3().subVectors(to, from).normalize()
    // ConeGeometry は +Y に伸び、tip が +y/2、base が -y/2
    // 中央 (y=0) を 'beamLength/2' の位置に持ってくる、tip を fixture.position に
    const mid = from.clone().addScaledVector(dir, beamLength / 2)
    const q = new THREE.Quaternion()
    // tip = +y、base = -y。 dir 方向に base を向けたいので、-Y を dir に合わせる
    q.setFromUnitVectors(new THREE.Vector3(0, -1, 0), dir)
    return { position: mid.toArray() as [number, number, number], quaternion: q }
  }
  const coneTransform = useMemo(() => coneOf(fixture.target), [fixture.position, fixture.target, beamLength])

  // ムービングライトの「動き」: 毎フレーム、狙いと光の筋を動かす（store は書き換えない）
  // 光の筋を中から調べる器具は、毎フレーム、器具の位置・向きと影の情報を渡す（影は描くたびに作り直される）
  useFrame(() => {
    if (!volumetric) return
    const light = lightRef.current
    const target = fixture.movement ? targetRef.current.position : new THREE.Vector3(...fixture.target)
    volumeUniforms.uLightPos.value.set(...fixture.position)
    volumeUniforms.uLightDir.value.subVectors(target, volumeUniforms.uLightPos.value).normalize()
    const map = light?.shadow.map?.texture ?? null
    volumeUniforms.uShadowMap.value = map
    volumeUniforms.uHasShadow.value = map ? 1 : 0
    if (light) volumeUniforms.uShadowMatrix.value = light.shadow.matrix
  })
  useFrame(({ clock }) => {
    if (!fixture.movement) return
    const target = liveTarget(fixture, clock.elapsedTime)
    targetRef.current.position.set(...target)
    targetRef.current.updateMatrixWorld()
    const cone = coneOf(target)
    coneRef.current?.position.set(...cone.position)
    coneRef.current?.quaternion.copy(cone.quaternion)
  })
  const gobo = goboOf(fixture)

  // three はシェーダーの uniforms を最初に組んだときの物で描き続けるので、値が変わったら中身を書き換える。
  // 書き換えないと、ヘイズの量や照明の色・強さを変えても、描き直されるまで光の筋に映らなかった（2026-11-17）
  useEffect(() => {
    beamUniforms.uColor.value = color
    // ホリの器具は幕のすぐ近くを広く照らすので、スモークに映る筋は本物でもごく薄い
    beamUniforms.uIntensity.value = fixture.intensity * (FIXTURE_PROFILES[fixture.presetKey]?.kind === 'Cyc' ? 0.25 : 1)
    beamUniforms.uHaze.value = hazeDensity
    volumeUniforms.uColor.value = color
    volumeUniforms.uCandela.value = spotlight.intensityCandela
    volumeUniforms.uHaze.value = hazeDensity
    volumeUniforms.uCosHalf.value = Math.cos(fieldAngleRad * 0.5)
    volumeUniforms.uBeamLen.value = beamLength
    // 視線が円すいを横切る長さの目安（いちばん太い所の直径）
    volumeUniforms.uMarchLen.value = Math.max(1, baseRadius * 2.2)
    volumeUniforms.uShadowBias.value = fineShadow ? -0.0002 : -0.0005
    invalidateBeam()
  }, [beamUniforms, volumeUniforms, color, fixture.intensity, spotlight.intensityCandela, hazeDensity, invalidateBeam, fieldAngleRad, beamLength, baseRadius, fineShadow])
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
        map={allowMap ? (gobo ? goboTexture(gobo) : null) ?? spotlight.map ?? (spotlight.beamShape === 'cyc' ? cycMap : null) : null}
        distance={0}
        decay={spotlight.decay}
        castShadow={castShadow}
        // 窓を通す光は、細い桟の影と床に低い角度で落ちる形を出すため、影を細かく計算する
        shadow-mapSize-width={fineShadow ? 2048 : 1024}
        shadow-mapSize-height={fineShadow ? 2048 : 1024}
        shadow-bias={fineShadow ? -0.0002 : -0.0005}
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
        {volumetric
          ? <shaderMaterial
            key="volume"
            vertexShader={volumeVertex}
            fragmentShader={volumeFragment}
            transparent
            depthWrite={false}
            blending={THREE.AdditiveBlending}
            side={THREE.FrontSide}
            uniforms={volumeUniforms}
          />
          : <shaderMaterial
            key="cone"
            ref={matRef}
            vertexShader={coneVertex}
            fragmentShader={coneFragment}
            transparent
            depthWrite={false}
            blending={THREE.AdditiveBlending}
            side={THREE.DoubleSide}
            uniforms={beamUniforms}
          />}
      </mesh>
    </group>
  )
}
