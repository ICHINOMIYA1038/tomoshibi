import { useEffect, useMemo } from 'react'
import { useThree, useFrame } from '@react-three/fiber'
import * as THREE from 'three'

// 高度モード用 軽量ブルーム + ACES Tonemap
//
// 構成:
//   1. シーン → sceneRT (HDR HalfFloat)
//   2. brightPass: sceneRT → bloomA (閾値超え抽出)
//   3. 横ブラー: bloomA → bloomB
//   4. 縦ブラー: bloomB → bloomA
//   5. composite (canvas): scene + bloom*intensity → ACES → sRGB
//
// 軽量化のため bloom は 1/4 解像度の単一レベル

const brightPassFS = /* glsl */ `
precision highp float;
varying vec2 vUv;
uniform sampler2D uSrc;
uniform float uThreshold;
void main() {
  vec3 c = texture2D(uSrc, vUv).rgb;
  float b = max(c.r, max(c.g, c.b));
  float w = max(b - uThreshold, 0.0) / max(b, 1e-4);
  gl_FragColor = vec4(c * w, 1.0);
}
`

const blurFS = /* glsl */ `
precision highp float;
varying vec2 vUv;
uniform sampler2D uSrc;
uniform vec2 uDir;       // (texelW, 0) or (0, texelH)
void main() {
  vec3 s = vec3(0.0);
  // 9-tap ガウシアン (合計 1.0)
  s += texture2D(uSrc, vUv - uDir * 4.0).rgb * 0.05;
  s += texture2D(uSrc, vUv - uDir * 3.0).rgb * 0.09;
  s += texture2D(uSrc, vUv - uDir * 2.0).rgb * 0.12;
  s += texture2D(uSrc, vUv - uDir * 1.0).rgb * 0.15;
  s += texture2D(uSrc, vUv).rgb              * 0.18;
  s += texture2D(uSrc, vUv + uDir * 1.0).rgb * 0.15;
  s += texture2D(uSrc, vUv + uDir * 2.0).rgb * 0.12;
  s += texture2D(uSrc, vUv + uDir * 3.0).rgb * 0.09;
  s += texture2D(uSrc, vUv + uDir * 4.0).rgb * 0.05;
  gl_FragColor = vec4(s, 1.0);
}
`

const compositeFS = /* glsl */ `
precision highp float;
varying vec2 vUv;
uniform sampler2D uScene;
uniform sampler2D uBloom;
uniform float uBloomStrength;
uniform float uExposure;
vec3 aces(vec3 x) {
  const float a = 2.51, b = 0.03, c = 2.43, d = 0.59, e = 0.14;
  return clamp((x*(a*x+b))/(x*(c*x+d)+e), 0.0, 1.0);
}
vec3 linearToSRGB(vec3 c) {
  bvec3 cutoff = lessThan(c, vec3(0.0031308));
  vec3 lo = c * 12.92;
  vec3 hi = pow(max(c, vec3(0.0)), vec3(1.0/2.4)) * 1.055 - 0.055;
  return mix(hi, lo, vec3(cutoff));
}
void main() {
  vec3 s = texture2D(uScene, vUv).rgb;
  vec3 b = texture2D(uBloom, vUv).rgb;
  vec3 sum = s + b * uBloomStrength;
  gl_FragColor = vec4(linearToSRGB(aces(sum * uExposure)), 1.0);
}
`

const fullscreenVS = /* glsl */ `
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = vec4(position.xy, 0.0, 1.0);
}
`

export function PostFX() {
  const { gl, scene, camera, size } = useThree()

  const ctx = useMemo(() => {
    const sceneRT = new THREE.WebGLRenderTarget(1, 1, {
      type: THREE.HalfFloatType, depthBuffer: true,
    })
    sceneRT.depthTexture = new THREE.DepthTexture(1, 1)
    sceneRT.depthTexture.format = THREE.DepthFormat
    sceneRT.depthTexture.type = THREE.UnsignedShortType
    const bloomA = new THREE.WebGLRenderTarget(1, 1, { type: THREE.HalfFloatType, depthBuffer: false })
    const bloomB = new THREE.WebGLRenderTarget(1, 1, { type: THREE.HalfFloatType, depthBuffer: false })
    const mk = (fs: string) => new THREE.ShaderMaterial({
      vertexShader: fullscreenVS, fragmentShader: fs, depthTest: false, depthWrite: false,
      uniforms: {
        uSrc: { value: null }, uScene: { value: null }, uBloom: { value: null },
        uThreshold: { value: 1.0 }, uDir: { value: new THREE.Vector2() },
        uBloomStrength: { value: 0.5 }, uExposure: { value: 1.0 },
      },
    })
    const bright = mk(brightPassFS)
    const blur = mk(blurFS)
    const comp = mk(compositeFS)
    const quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2))
    const orthoCam = new THREE.OrthographicCamera(-0.5, 0.5, 0.5, -0.5, 0, 1)
    const quadScene = new THREE.Scene()
    quadScene.add(quad)
    return { sceneRT, bloomA, bloomB, bright, blur, comp, quad, quadScene, orthoCam }
  }, [])

  // サイズ更新
  useEffect(() => {
    const dpr = gl.getPixelRatio()
    const w = Math.max(2, Math.floor(size.width * dpr))
    const h = Math.max(2, Math.floor(size.height * dpr))
    ctx.sceneRT.setSize(w, h)
    const bw = Math.max(2, Math.floor(w / 2))
    const bh = Math.max(2, Math.floor(h / 2))
    ctx.bloomA.setSize(bw, bh)
    ctx.bloomB.setSize(bw, bh)
  }, [ctx, gl, size.width, size.height])

  // レンダラの tonemap を切る (composite で実施)
  useEffect(() => {
    const prev = { mapping: gl.toneMapping }
    gl.toneMapping = THREE.NoToneMapping
    return () => { gl.toneMapping = prev.mapping }
  }, [gl])

  useFrame(() => {
    const { sceneRT, bloomA, bloomB, bright, blur, comp, quad, quadScene, orthoCam } = ctx
    // 1. シーン → sceneRT
    // 影マップ等の autoUpdate を尊重しつつ手動レンダー
    gl.setRenderTarget(sceneRT)
    gl.setClearColor(0x000000, 1)
    gl.clear(true, true, true)
    gl.render(scene, camera)
    gl.setRenderTarget(null)

    // 2. brightPass
    bright.uniforms.uSrc.value = sceneRT.texture
    bright.uniforms.uThreshold.value = 0.9
    quad.material = bright
    gl.setRenderTarget(bloomA)
    gl.render(quadScene, orthoCam)

    // 3. 横ブラー
    blur.uniforms.uSrc.value = bloomA.texture
    blur.uniforms.uDir.value.set(1 / bloomA.width, 0)
    quad.material = blur
    gl.setRenderTarget(bloomB)
    gl.render(quadScene, orthoCam)

    // 4. 縦ブラー
    blur.uniforms.uSrc.value = bloomB.texture
    blur.uniforms.uDir.value.set(0, 1 / bloomB.height)
    gl.setRenderTarget(bloomA)
    gl.render(quadScene, orthoCam)

    // 5. composite → canvas
    comp.uniforms.uScene.value = sceneRT.texture
    comp.uniforms.uBloom.value = bloomA.texture
    quad.material = comp
    gl.setRenderTarget(null)
    gl.render(quadScene, orthoCam)
  }, 1)

  return null
}
