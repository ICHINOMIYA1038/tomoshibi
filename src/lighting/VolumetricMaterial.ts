// ボリュメトリック散乱: シーンRTを背景に、ヘイズ中のレイマーチで光線を加算
// 出力は HDR 線形 (ブルームの後段で sRGB & tonemap)

import * as THREE from 'three'
import {
  MAX_FIXTURES,
  beamProfileGLSL, occlusionGLSL, fixtureUniformGLSL,
  pbrGLSL,
} from './shaders'
import { makeEmptyFixtures, makeEmptyOccluders } from './StageMaterial'

const vertexShader = /* glsl */ `
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = vec4(position.xy, 0.0, 1.0);
}
`

const fragmentShader = /* glsl */ `
precision highp float;
varying vec2 vUv;

uniform sampler2D uSceneColor;
uniform sampler2D uSceneDepth;
uniform vec3 uCameraPos;
uniform mat4 uInvViewProj;
uniform float uHazeDensity;
uniform float uTime;
uniform vec2 uResolution;
uniform float uNear;
uniform float uFar;
uniform int uMaxSteps;        // 品質: ステップ数
uniform float uJitterStrength; // ジッター強度 (低いほど縞減)
uniform int uUseHazeNoise;    // 0=均一, 1=3Dノイズ

${fixtureUniformGLSL}
${pbrGLSL}
${beamProfileGLSL}
${occlusionGLSL}

float linearizeDepth(float z) {
  float zn = z * 2.0 - 1.0;
  return (2.0 * uNear * uFar) / (uFar + uNear - zn * (uFar - uNear));
}

float hash12(vec2 p) {
  p = fract(p * vec2(443.8975, 397.2973));
  p += dot(p, p.yx + 19.19);
  return fract((p.x + p.y) * p.x);
}
// Interleaved Gradient Noise (Jimenez 2014) — 静止しても目立たないディザ
float ign(vec2 p) {
  return fract(52.9829189 * fract(dot(p, vec2(0.06711056, 0.00583715))));
}
float hash13(vec3 p) {
  p = fract(p * 0.1031);
  p += dot(p, p.zyx + 31.32);
  return fract((p.x + p.y) * p.z);
}
float noise3(vec3 p) {
  vec3 i = floor(p);
  vec3 f = fract(p);
  f = f*f*(3.0-2.0*f);
  float n000 = hash13(i + vec3(0,0,0));
  float n100 = hash13(i + vec3(1,0,0));
  float n010 = hash13(i + vec3(0,1,0));
  float n110 = hash13(i + vec3(1,1,0));
  float n001 = hash13(i + vec3(0,0,1));
  float n101 = hash13(i + vec3(1,0,1));
  float n011 = hash13(i + vec3(0,1,1));
  float n111 = hash13(i + vec3(1,1,1));
  float x00 = mix(n000, n100, f.x);
  float x10 = mix(n010, n110, f.x);
  float x01 = mix(n001, n101, f.x);
  float x11 = mix(n011, n111, f.x);
  return mix(mix(x00, x10, f.y), mix(x01, x11, f.y), f.z);
}

void main() {
  vec3 sceneCol = texture2D(uSceneColor, vUv).rgb; // 既に線形HDR
  float depthSample = texture2D(uSceneDepth, vUv).r;

  vec4 ndc = vec4(vUv * 2.0 - 1.0, depthSample * 2.0 - 1.0, 1.0);
  vec4 wp = uInvViewProj * ndc;
  vec3 worldHit = wp.xyz / wp.w;
  vec3 rd = normalize(worldHit - uCameraPos);
  float marchDist = min(distance(uCameraPos, worldHit), 30.0);

  const int MAX_STEPS = 80;
  int steps = uMaxSteps > 0 ? uMaxSteps : 32;
  float stepSize = marchDist / float(steps);
  // フレームごとに位相をずらして時間平均で滑らかに見せる (TAA風)
  float frame = mod(floor(uTime * 60.0), 64.0);
  float jitter = ign(gl_FragCoord.xy + frame * 5.588238);
  vec3 ro = uCameraPos + rd * (jitter * uJitterStrength * stepSize);

  vec3 accum = vec3(0.0);
  float density = uHazeDensity * 0.6;

  for (int s = 0; s < MAX_STEPS; s++) {
    if (s >= steps) break;
    vec3 p = ro + rd * (float(s) * stepSize);
    float localDensity = density;
    if (uUseHazeNoise > 0) {
      float n = noise3(p * 0.25 + vec3(0.0, uTime * 0.02, 0.0)) * 0.6 + 0.7;
      localDensity *= n;
    }

    for (int i = 0; i < ${MAX_FIXTURES}; i++) {
      if (i >= uFixtureCount) break;
      Fixture f = uFixtures[i];
      if (f.intensity <= 0.0) continue;

      vec3 toL = f.position - p;
      float dL = length(toL);
      vec3 L = toL / dL;
      float bp = beamProfile(-L, f.axis, f.upAxis, f.kind,
                             f.beamHalf, f.fieldHalf, f.flatness, f.peak, f.ellipticity);
      if (bp <= 0.0) continue;

      float atten = distanceAttenuation(dL);
      float sh = f.shadow > 0.5 ? shadowToLight(p, f.position) : 1.0;

      // Henyey-Greenstein 前方散乱
      float cosVL = dot(-rd, -L);
      float g = 0.4;
      float hg = (1.0 - g*g) / pow(1.0 + g*g - 2.0*g*cosVL, 1.5) / (4.0 * 3.14159);

      accum += f.color * f.intensity * bp * atten * sh * hg * localDensity * stepSize;
    }
  }

  vec3 finalCol = sceneCol + accum;
  gl_FragColor = vec4(finalCol, 1.0);
}
`

export function createVolumetricMaterial() {
  return new THREE.ShaderMaterial({
    vertexShader,
    fragmentShader,
    depthTest: false,
    depthWrite: false,
    uniforms: {
      uSceneColor: { value: null },
      uSceneDepth: { value: null },
      uCameraPos: { value: new THREE.Vector3() },
      uInvViewProj: { value: new THREE.Matrix4() },
      uHazeDensity: { value: 0.5 },
      uTime: { value: 0 },
      uResolution: { value: new THREE.Vector2(1, 1) },
      uNear: { value: 0.1 },
      uFar: { value: 100.0 },
      uAmbient: { value: 0 },
      uExposure: { value: 1.0 },
      uMaxSteps: { value: 32 },
      uJitterStrength: { value: 0.4 },
      uUseHazeNoise: { value: 0 },
      uShadowSteps: { value: 16 },
      uFixtureCount: { value: 0 },
      uFixtures: { value: makeEmptyFixtures() },
      uOccluderCount: { value: 0 },
      uOccluders: { value: makeEmptyOccluders() },
    },
  })
}
