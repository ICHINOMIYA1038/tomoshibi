// PBR (Cook-Torrance GGX) ステージマテリアル
// - 物理的逆二乗減衰
// - Schlick Fresnel
// - IQソフトシャドウ
// - 一次バウンス光近似 (ビーム中心→床ヒット点から半球放射)
// - 出力は線形空間 (sRGB変換は最終composite側で行う)

import * as THREE from 'three'
import {
  MAX_FIXTURES, MAX_OCCLUDERS,
  beamProfileGLSL, occlusionGLSL, fixtureUniformGLSL,
  toneMapGLSL, pbrGLSL,
} from './shaders'

const vertexShader = /* glsl */ `
varying vec3 vWorldPos;
varying vec3 vWorldNormal;
varying vec2 vUv;
void main() {
  vec4 wp = modelMatrix * vec4(position, 1.0);
  vWorldPos = wp.xyz;
  vWorldNormal = normalize(mat3(modelMatrix) * normal);
  vUv = uv;
  gl_Position = projectionMatrix * viewMatrix * wp;
}
`

const fragmentShader = /* glsl */ `
precision highp float;
varying vec3 vWorldPos;
varying vec3 vWorldNormal;
varying vec2 vUv;

uniform vec3 uBaseColor;
uniform float uRoughness;
uniform float uMetallic;
uniform vec3 uCameraPos;
uniform float uHouseLights;
uniform vec3 uHouseColor;
uniform float uBounceStrength;  // 0=オフ
uniform float uShadowSoftness;  // ペナンブラ k
uniform int uUseSoftShadow;     // 0=ハード, 1=ソフト

${fixtureUniformGLSL}
${pbrGLSL}
${beamProfileGLSL}
${occlusionGLSL}
${toneMapGLSL}

// ビーム中心が床(y=0)に当たる点を返す
// 当たらない (axis.y>=0) または当たり後方なら invalid (-1)
vec3 beamFloorHit(vec3 lightPos, vec3 axis, out bool valid) {
  valid = false;
  if (axis.y >= -1e-4) return vec3(0.0);
  float t = -lightPos.y / axis.y;
  if (t < 0.0 || t > 40.0) return vec3(0.0);
  valid = true;
  return lightPos + axis * t;
}

void main() {
  vec3 baseLin = srgbToLinear(uBaseColor);
  vec3 N = normalize(vWorldNormal);
  vec3 V = normalize(uCameraPos - vWorldPos);
  vec3 acc = vec3(0.0);

  for (int i = 0; i < ${MAX_FIXTURES}; i++) {
    if (i >= uFixtureCount) break;
    Fixture f = uFixtures[i];
    if (f.intensity <= 0.0) continue;

    vec3 toLight = f.position - vWorldPos;
    float dist = length(toLight);
    vec3 L = toLight / dist;
    float bp = beamProfile(-L, f.axis, f.upAxis, f.kind,
                           f.beamHalf, f.fieldHalf, f.flatness, f.peak, f.ellipticity);
    if (bp <= 0.0) continue;

    float atten = distanceAttenuation(dist);
    float sh = 1.0;
    if (f.shadow > 0.5) {
      sh = uUseSoftShadow > 0
        ? softShadowToLight(vWorldPos, f.position, uShadowSoftness)
        : shadowToLight(vWorldPos, f.position);
    }

    vec3 colorLin = srgbToLinear(f.color);
    vec3 radiance = colorLin * f.intensity * bp * atten * sh;
    acc += brdf(N, V, L, baseLin, uRoughness, uMetallic) * radiance;

    // -------- 一次バウンス光 (床ヒット → 半球放射) --------
    if (uBounceStrength > 0.001) {
      bool bv;
      vec3 hit = beamFloorHit(f.position, f.axis, bv);
      if (bv) {
        // 床ヒット点での入射輝度 (beam中心 = bp=1付近)
        float dHit = max(length(hit - f.position), 0.1);
        float hitIrradiance = distanceAttenuation(dHit) * 1.0; // beam中心
        // 二次光源 → 現在のフラグメント
        vec3 toBL = hit - vWorldPos;
        float bDist = max(length(toBL), 0.2);
        vec3 BL = toBL / bDist;          // 受光点→床ヒット
        vec3 emitDir = -BL;              // 床ヒット→受光点 (上方向成分が出射の cos に等しい)
        // 床は上向きランバート発光 → cos(angle from up) で重み (emitDir.y >= 0)
        float upWeight = max(emitDir.y, 0.0);
        // 受光側: 表面法線 と emitDir の内積
        float NdotB = max(dot(N, emitDir), 0.0);
        // 床の albedo 近似 (やや暗い灰)
        vec3 floorAlbedo = vec3(0.07);
        vec3 bounceL = colorLin * f.intensity * hitIrradiance * floorAlbedo;
        // 1/d^2 で減衰
        float bAtten = 1.0 / (1.0 + bDist * bDist);
        // ランバート拡散 (ホワイトベース・kd項なし簡略)
        acc += baseLin * bounceL * NdotB * upWeight * bAtten * uBounceStrength * (1.0 / PI);
      }
    }
  }

  // ハウスライト (拡散光のみ)
  vec3 houseLin = srgbToLinear(uHouseColor);
  acc += houseLin * uHouseLights * baseLin * 0.4 * (0.5 + 0.5 * N.y);

  // 環境アンビエント
  acc += baseLin * uAmbient;

  // 線形のまま出力 (HDR RT想定)
  gl_FragColor = vec4(acc * uExposure, 1.0);
}
`

export function createStageMaterial(opts: {
  baseColor?: THREE.Color
  roughness?: number
  metallic?: number
}) {
  const baseColor = opts.baseColor ?? new THREE.Color(0.18, 0.18, 0.2)
  const mat = new THREE.ShaderMaterial({
    vertexShader,
    fragmentShader,
    uniforms: {
      uBaseColor: { value: baseColor },
      uRoughness: { value: opts.roughness ?? 0.7 },
      uMetallic: { value: opts.metallic ?? 0.0 },
      uCameraPos: { value: new THREE.Vector3() },
      uHouseLights: { value: 0.0 },
      uHouseColor: { value: new THREE.Color(0.9, 0.85, 0.7) },
      uBounceStrength: { value: 0.7 },
      uShadowSoftness: { value: 28.0 },
      uUseSoftShadow: { value: 1 },
      uShadowSteps: { value: 24 },
      uAmbient: { value: 0.015 },
      uExposure: { value: 1.0 },
      uFixtureCount: { value: 0 },
      uFixtures: { value: makeEmptyFixtures() },
      uOccluderCount: { value: 0 },
      uOccluders: { value: makeEmptyOccluders() },
    },
  })
  return mat
}

export function makeEmptyFixtures() {
  return Array.from({ length: MAX_FIXTURES }, () => ({
    position: new THREE.Vector3(),
    axis: new THREE.Vector3(0, -1, 0),
    upAxis: new THREE.Vector3(1, 0, 0),
    color: new THREE.Color(1, 1, 1),
    beamHalf: 0.1,
    fieldHalf: 0.2,
    flatness: 1.0,
    peak: 0.0,
    ellipticity: 1.0,
    intensity: 0.0,
    shadow: 1.0,
    kind: 0,
  }))
}

export function makeEmptyOccluders() {
  return Array.from({ length: MAX_OCCLUDERS }, () => ({
    pos: new THREE.Vector3(),
    axis: new THREE.Vector3(0, 1, 0),
    radius: 0.0,
    halfHeight: 0.0,
  }))
}
