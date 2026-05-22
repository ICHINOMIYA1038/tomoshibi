import { useEffect, useMemo } from 'react'
import { useThree, useFrame } from '@react-three/fiber'
import * as THREE from 'three'

// 最小再現テスト: scene を RT に描画して、quad で canvas に貼るだけ
// (Bloom 等は一切なし)
//
// 期待: canvas の全面が scene の見た目で埋まる
// 実際にどうなるかで原因を切り分ける

const VS = `
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = vec4(position.xy, 0.0, 1.0);
}
`
const FS = `
precision highp float;
varying vec2 vUv;
uniform sampler2D uTex;
void main() {
  gl_FragColor = texture2D(uTex, vUv);
}
`

export function PostFXMinimal() {
  const { gl, scene, camera, size } = useThree()

  // size 変更時に RT を作り直す (setSize でなく完全再生成)
  const ctx = useMemo(() => {
    const w = Math.max(2, Math.floor(size.width))
    const h = Math.max(2, Math.floor(size.height))
    const rt = new THREE.WebGLRenderTarget(w, h, { type: THREE.HalfFloatType, depthBuffer: true })
    const mat = new THREE.ShaderMaterial({
      vertexShader: VS, fragmentShader: FS,
      depthTest: false, depthWrite: false,
      uniforms: { uTex: { value: null } },
    })
    const quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), mat)
    const quadScene = new THREE.Scene()
    quadScene.add(quad)
    const orthoCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1)
    ;(window as any).__rt = rt
    return { rt, mat, quad, quadScene, orthoCam }
  }, [size.width, size.height])

  useEffect(() => () => ctx.rt.dispose(), [ctx])

  // 高度モード中は XR を無効化 (XR-aware が viewport を壊す疑い)
  useEffect(() => {
    const prevXR = gl.xr.enabled
    gl.xr.enabled = false
    return () => { gl.xr.enabled = prevXR }
  }, [gl])

  useFrame(() => {
    ;(window as any).__r3f = { gl, scene, camera, size }
    const cam = camera as THREE.PerspectiveCamera
    cam.aspect = ctx.rt.width / ctx.rt.height
    cam.updateProjectionMatrix()

    gl.setRenderTarget(ctx.rt)
    // Three.js API でも明示
    gl.setViewport(0, 0, ctx.rt.width, ctx.rt.height)
    gl.setScissor(0, 0, ctx.rt.width, ctx.rt.height)
    gl.setScissorTest(false)
    gl.setClearColor(0x440000, 1)
    gl.clear(true, true, true)
    gl.render(scene, camera)
    gl.setRenderTarget(null)

    ctx.mat.uniforms.uTex.value = ctx.rt.texture
    gl.render(ctx.quadScene, ctx.orthoCam)
  }, 1)

  return null
}
