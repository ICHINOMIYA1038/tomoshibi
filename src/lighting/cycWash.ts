import * as THREE from 'three'
import type { Fixture } from '../store'
import { FIXTURE_PROFILES } from './fixtureTypes'
import { fixtureSpotlightColor } from './spotlightModel'

// ホリゾント幕の明かり（2026-11-20）。
// ホリ用の器具（アッパー・ロアー）を、丸い光を投げるスポットとして描くと、光の輪郭の丸みがそのまま幕に出て、
// 上の縁が山なりのアーチになった。本物のホリ用の器具は、幕の近くから縦に長く広がる非対称の配光で、
// アッパーは上がいちばん明るく下へなだらかに落ち、ロアーは下から上へ落ちる。横は隣の器具となだらかに重なる。
// そこで、ホリ用の器具はスポットの光を出さず、幕の材質にこのグラデーションを直接足して描く。
//   横: 器具の正面を中心に、幕までの距離に応じて広がる平らな山（超ガウス）
//   縦: アッパーは器具の高さから下へ、ロアーは床から上へ、指数で落ちる。落ちる長さは狙いの高さで決まる
export const MAX_CYC_SOURCES = 8
/** 明るさの見た目の倍率。前の描き方で level 0.5 のホリと同じくらいになるよう合わせた */
const CYC_GAIN = 2.2

export function isCycWash(fixture: Pick<Fixture, 'presetKey'>): boolean {
  return FIXTURE_PROFILES[fixture.presetKey]?.kind === 'Cyc'
}

/** 床に置く器具（ロアー）か。種類の名前と、吊った高さの両方で見る */
function isLower(fixture: Fixture): boolean {
  return fixture.presetKey === 'LowerCycLED' || fixture.position[1] < 1.5
}

export const cycWashUniforms = {
  uCycCount: { value: 0 },
  uCycPos: { value: Array.from({ length: MAX_CYC_SOURCES }, () => new THREE.Vector3()) },
  uCycDir: { value: Array.from({ length: MAX_CYC_SOURCES }, () => new THREE.Vector2(0, -1)) },
  uCycColor: { value: Array.from({ length: MAX_CYC_SOURCES }, () => new THREE.Color(0, 0, 0)) },
  // x: 0=アッパー 1=ロアー、y: 縦に落ちる長さ（m）
  uCycShape: { value: Array.from({ length: MAX_CYC_SOURCES }, () => new THREE.Vector2(0, 4)) },
}

/** 点いているホリ用の器具を、シェーダーに渡す値にする */
export function updateCycWash(fixtures: Fixture[]) {
  const sources = fixtures.filter(f => f.enabled && f.intensity > 0 && isCycWash(f)).slice(0, MAX_CYC_SOURCES)
  const u = cycWashUniforms
  u.uCycCount.value = sources.length
  sources.forEach((f, i) => {
    const [px, py, pz] = f.position
    const [tx, ty, tz] = f.target
    u.uCycPos.value[i].set(px, py, pz)
    const dir = new THREE.Vector2(tx - px, tz - pz)
    if (dir.lengthSq() < 1e-6) dir.set(0, -1)
    u.uCycDir.value[i].copy(dir.normalize())
    const color = fixtureSpotlightColor(f).multiplyScalar(f.intensity * CYC_GAIN)
    u.uCycColor.value[i].copy(color)
    const lower = isLower(f)
    // 狙いの高さで、光が届く長さを変える（アッパーは低く狙うほど下まで、ロアーは高く狙うほど上まで）
    const reach = lower ? Math.max(0.8, ty - py) : Math.max(1.5, py - ty)
    u.uCycShape.value[i].set(lower ? 1 : 0, reach)
  })
}

const declarations = /* glsl */ `
uniform int uCycCount;
uniform vec3 uCycPos[${MAX_CYC_SOURCES}];
uniform vec2 uCycDir[${MAX_CYC_SOURCES}];
uniform vec3 uCycColor[${MAX_CYC_SOURCES}];
uniform vec2 uCycShape[${MAX_CYC_SOURCES}];
varying vec3 vCycWorld;
vec3 cycWash(vec3 p) {
  vec3 sum = vec3(0.0);
  for (int i = 0; i < ${MAX_CYC_SOURCES}; i++) {
    if (i >= uCycCount) break;
    vec2 rel = p.xz - uCycPos[i].xz;
    float depth = dot(rel, uCycDir[i]);
    if (depth < 0.2) continue;
    float lateral = abs(dot(rel, vec2(-uCycDir[i].y, uCycDir[i].x)));
    float halfWidth = 1.4 + 1.1 * depth;
    float across = exp(-pow(lateral / halfWidth, 4.0));
    float reach = uCycShape[i].y;
    float v;
    if (uCycShape[i].x < 0.5) {
      float below = uCycPos[i].y - p.y;
      // 器具より上は、すぐ暗くなる
      v = below < 0.0 ? exp(below * 3.0) : exp(-below / reach);
    } else {
      float above = p.y - uCycPos[i].y;
      v = above < 0.0 ? 0.0 : exp(-above / reach);
    }
    // 幕から遠いほど、光は広がって暗くなる（2.5m を基準に）
    float fall = clamp(6.25 / (depth * depth), 0.3, 2.0);
    sum += uCycColor[i] * across * v * fall;
  }
  return sum;
}
`

/** ホリゾント幕の材質に、ホリ用の器具の明かりを足す */
export function applyCycWash(material: THREE.MeshStandardMaterial) {
  material.onBeforeCompile = shader => {
    Object.assign(shader.uniforms, cycWashUniforms)
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vCycWorld;')
      .replace('#include <project_vertex>', '#include <project_vertex>\nvCycWorld = (modelMatrix * vec4(transformed, 1.0)).xyz;')
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\n' + declarations)
      .replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\ntotalEmissiveRadiance += cycWash(vCycWorld) * diffuseColor.rgb;')
      // 光の跳ね返り（BounceLight.tsx の半球光）はホリには当てない。ホリはホリ用の器具の明るさで描いており、
      // 跳ね返りと単位がそろわないため、夜の青いホリが一様に白っぽく洗われた。本物でもホリ用の器具の方がずっと強い（2026-11-21）
      .replace('#include <lights_fragment_begin>', THREE.ShaderChunk.lights_fragment_begin.replace('irradiance += getHemisphereLightIrradiance( hemisphereLights[ i ], geometryNormal );', ''))
  }
  material.customProgramCacheKey = () => 'cyc-wash'
  material.needsUpdate = true
  return material
}
