// マルチパスブルーム
// 1. bright-pass: 閾値超え部分を抽出
// 2. dual-filter downsample x N: 13-tap circular tent ぼかしながら 1/2 ずつ縮小
// 3. dual-filter upsample x N: 9-tap tent 拡大加算
// 4. composite: シーン + bloom*強度、最終 tonemap & sRGB

import * as THREE from 'three'
import { toneMapGLSL } from './shaders'

const fullscreenVS = /* glsl */ `
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = vec4(position.xy, 0.0, 1.0);
}
`

// Bright pass: knee 関数で閾値付近を滑らかに
const brightPassFS = /* glsl */ `
precision highp float;
varying vec2 vUv;
uniform sampler2D uSrc;
uniform float uThreshold;
uniform float uKnee;

void main() {
  vec3 c = texture2D(uSrc, vUv).rgb;
  float b = max(c.r, max(c.g, c.b));
  // Karis-style soft knee
  float softness = clamp(b - uThreshold + uKnee, 0.0, 2.0 * uKnee);
  softness = softness * softness / max(4.0 * uKnee, 1e-4);
  float weight = max(b - uThreshold, softness) / max(b, 1e-4);
  gl_FragColor = vec4(c * weight, 1.0);
}
`

// Downsample with 13-tap "partial Karis average" (COD AW siggraph 2014)
const downsampleFS = /* glsl */ `
precision highp float;
varying vec2 vUv;
uniform sampler2D uSrc;
uniform vec2 uTexel;

vec3 sample_(vec2 uv) { return texture2D(uSrc, uv).rgb; }

void main() {
  vec2 t = uTexel;
  // center + ring of 12 taps
  vec3 a = sample_(vUv + t * vec2(-2.0,  2.0));
  vec3 b = sample_(vUv + t * vec2( 0.0,  2.0));
  vec3 c = sample_(vUv + t * vec2( 2.0,  2.0));
  vec3 d = sample_(vUv + t * vec2(-2.0,  0.0));
  vec3 e = sample_(vUv);
  vec3 f = sample_(vUv + t * vec2( 2.0,  0.0));
  vec3 g = sample_(vUv + t * vec2(-2.0, -2.0));
  vec3 h = sample_(vUv + t * vec2( 0.0, -2.0));
  vec3 i = sample_(vUv + t * vec2( 2.0, -2.0));
  vec3 j = sample_(vUv + t * vec2(-1.0,  1.0));
  vec3 k = sample_(vUv + t * vec2( 1.0,  1.0));
  vec3 l = sample_(vUv + t * vec2(-1.0, -1.0));
  vec3 m = sample_(vUv + t * vec2( 1.0, -1.0));

  vec3 c0 = (j + k + l + m) * 0.5;
  vec3 c1 = (a + b + d + e) * 0.125;
  vec3 c2 = (b + c + e + f) * 0.125;
  vec3 c3 = (d + e + g + h) * 0.125;
  vec3 c4 = (e + f + h + i) * 0.125;
  vec3 result = (c0 + c1 + c2 + c3 + c4) * 0.25;
  gl_FragColor = vec4(result, 1.0);
}
`

// Upsample with 9-tap tent filter (additive)
const upsampleFS = /* glsl */ `
precision highp float;
varying vec2 vUv;
uniform sampler2D uSrc;
uniform vec2 uTexel;
uniform float uRadius;

void main() {
  vec2 t = uTexel * uRadius;
  vec3 sum = vec3(0.0);
  sum += texture2D(uSrc, vUv + vec2(-t.x,  t.y)).rgb;
  sum += texture2D(uSrc, vUv + vec2( 0.0,  t.y)).rgb * 2.0;
  sum += texture2D(uSrc, vUv + vec2( t.x,  t.y)).rgb;
  sum += texture2D(uSrc, vUv + vec2(-t.x,  0.0)).rgb * 2.0;
  sum += texture2D(uSrc, vUv).rgb * 4.0;
  sum += texture2D(uSrc, vUv + vec2( t.x,  0.0)).rgb * 2.0;
  sum += texture2D(uSrc, vUv + vec2(-t.x, -t.y)).rgb;
  sum += texture2D(uSrc, vUv + vec2( 0.0, -t.y)).rgb * 2.0;
  sum += texture2D(uSrc, vUv + vec2( t.x, -t.y)).rgb;
  gl_FragColor = vec4(sum / 16.0, 1.0);
}
`

// Composite: scene + bloom*intensity, then ACES tonemap + sRGB
const compositeFS = /* glsl */ `
precision highp float;
varying vec2 vUv;
uniform sampler2D uScene;
uniform sampler2D uBloom;
uniform float uBloomIntensity;
uniform float uExposure;

${toneMapGLSL}

void main() {
  vec3 scene = texture2D(uScene, vUv).rgb;
  vec3 bloom = texture2D(uBloom, vUv).rgb;
  vec3 combined = scene + bloom * uBloomIntensity;
  combined *= uExposure;
  vec3 mapped = acesTonemap(combined);
  vec3 srgb = linearToSRGB(mapped);
  gl_FragColor = vec4(srgb, 1.0);
}
`

export function createBrightPass() {
  return new THREE.ShaderMaterial({
    vertexShader: fullscreenVS,
    fragmentShader: brightPassFS,
    depthTest: false, depthWrite: false,
    uniforms: {
      uSrc: { value: null },
      uThreshold: { value: 1.0 },
      uKnee: { value: 0.5 },
    },
  })
}
export function createDownsample() {
  return new THREE.ShaderMaterial({
    vertexShader: fullscreenVS,
    fragmentShader: downsampleFS,
    depthTest: false, depthWrite: false,
    uniforms: {
      uSrc: { value: null },
      uTexel: { value: new THREE.Vector2() },
    },
  })
}
export function createUpsample() {
  return new THREE.ShaderMaterial({
    vertexShader: fullscreenVS,
    fragmentShader: upsampleFS,
    depthTest: false, depthWrite: false,
    blending: THREE.AdditiveBlending,
    uniforms: {
      uSrc: { value: null },
      uTexel: { value: new THREE.Vector2() },
      uRadius: { value: 1.0 },
    },
  })
}
export function createComposite() {
  return new THREE.ShaderMaterial({
    vertexShader: fullscreenVS,
    fragmentShader: compositeFS,
    depthTest: false, depthWrite: false,
    uniforms: {
      uScene: { value: null },
      uBloom: { value: null },
      uBloomIntensity: { value: 0.7 },
      uExposure: { value: 1.0 },
    },
  })
}
