import { useEffect, useMemo, useRef } from 'react'
import * as THREE from 'three'
import { useThree, useFrame } from '@react-three/fiber'
import { useStore, packFixture, QUALITY_PRESETS, type QualityPreset } from '../store'
import { createVolumetricMaterial } from '../lighting/VolumetricMaterial'
import {
  createBrightPass, createDownsample, createUpsample, createComposite,
} from '../lighting/BloomMaterial'

// 4パスHDRパイプライン (品質プリセット連動):
//   1. Scene → sceneRT (HDR 線形, PBR + 影 + バウンス)
//   2. Volumetric → volRT (品質依存解像度)
//   3. Bloom (品質依存ミップ数)
//   4. Composite → screen

export interface OccluderSpec {
  pos: [number, number, number]
  axis: [number, number, number]
  radius: number
  halfHeight: number
}

const MAX_BLOOM_LEVELS = 6

export function RenderPipeline({ stageMaterials, occluders }: {
  stageMaterials: THREE.ShaderMaterial[]
  occluders: OccluderSpec[]
}) {
  const { gl, scene, camera, size } = useThree()
  const settings = useStore(s => s.settings)
  const quality = QUALITY_PRESETS[settings.quality]

  // ピクセル比: 品質プリセットで上限制御
  useEffect(() => {
    gl.setPixelRatio(Math.min(window.devicePixelRatio, quality.pixelRatio))
  }, [gl, quality.pixelRatio])

  // ---- RT セットアップ (Scene = フル解像度, Volumetric = 縮小可) ----
  const sceneRT = useMemo(() => {
    const rt = new THREE.WebGLRenderTarget(1, 1, {
      type: THREE.HalfFloatType, depthBuffer: true,
    })
    rt.depthTexture = new THREE.DepthTexture(1, 1)
    rt.depthTexture.format = THREE.DepthFormat
    rt.depthTexture.type = THREE.UnsignedShortType
    return rt
  }, [])
  const volRT = useMemo(() => new THREE.WebGLRenderTarget(1, 1, {
    type: THREE.HalfFloatType, depthBuffer: false,
  }), [])
  const bloomMips = useMemo(() => Array.from({ length: MAX_BLOOM_LEVELS }, () =>
    new THREE.WebGLRenderTarget(1, 1, { type: THREE.HalfFloatType, depthBuffer: false }),
  ), [])

  // サイズ更新
  useEffect(() => {
    const pr = Math.min(window.devicePixelRatio, quality.pixelRatio)
    const w = Math.max(2, Math.floor(size.width * pr))
    const h = Math.max(2, Math.floor(size.height * pr))
    sceneRT.setSize(w, h)
    const volW = Math.max(2, Math.floor(w * quality.volumetricScale))
    const volH = Math.max(2, Math.floor(h * quality.volumetricScale))
    volRT.setSize(volW, volH)
    bloomMips.forEach((rt, i) => {
      const div = 1 << (i + 1)
      rt.setSize(Math.max(1, Math.floor(volW / div)), Math.max(1, Math.floor(volH / div)))
    })
  }, [size.width, size.height, quality.pixelRatio, quality.volumetricScale, sceneRT, volRT, bloomMips])

  const volMat = useMemo(() => createVolumetricMaterial(), [])
  const brightMat = useMemo(() => createBrightPass(), [])
  const downMat = useMemo(() => createDownsample(), [])
  const upMat = useMemo(() => createUpsample(), [])
  const compMat = useMemo(() => createComposite(), [])

  const quad = useMemo(() => {
    const s = new THREE.Scene()
    const m = new THREE.Mesh(new THREE.PlaneGeometry(2, 2))
    s.add(m)
    return { scene: s, mesh: m, camera: new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1) }
  }, [])

  const occluderArr = useMemo(() => {
    const arr = []
    for (let i = 0; i < 12; i++) {
      const o = occluders[i]
      arr.push({
        pos: o ? new THREE.Vector3(...o.pos) : new THREE.Vector3(),
        axis: o ? new THREE.Vector3(...o.axis).normalize() : new THREE.Vector3(0, 1, 0),
        radius: o ? o.radius : 0,
        halfHeight: o ? o.halfHeight : 0,
      })
    }
    return arr
  }, [occluders])

  const startTime = useRef(performance.now())
  const lastFrameTime = useRef(performance.now())
  const avgFrameMs = useRef(16.7)
  const downgradeCooldownUntil = useRef(0)

  useFrame(() => {
    const now = performance.now()
    const dt = now - lastFrameTime.current
    lastFrameTime.current = now
    // EWMA (約1秒の時定数)
    if (dt > 0 && dt < 1000) {
      avgFrameMs.current = avgFrameMs.current * 0.92 + dt * 0.08
    }
    // 自動ダウングレード: 平均が ~22fps 以下 (>45ms) で1段下げる
    if (now > downgradeCooldownUntil.current && avgFrameMs.current > 45) {
      const cur = useStore.getState().settings.quality
      const next: Record<string, QualityPreset | null> = {
        ultra: 'high', high: 'medium', medium: 'low', low: null,
      }
      const n = next[cur]
      if (n) {
        useStore.getState().updateSettings({ quality: n })
        avgFrameMs.current = 16.7
        downgradeCooldownUntil.current = now + 3000
        if (typeof console !== 'undefined') {
          console.info(`[TOMOSHIBI] FPSが低いため品質を ${cur} → ${n} に自動調整しました`)
        }
      }
    }
    const time = (now - startTime.current) / 1000
    const fixtures = useStore.getState().fixtures
    const s = useStore.getState().settings
    const q = QUALITY_PRESETS[s.quality]
    const packed = fixtures.filter(f => f.enabled).slice(0, 16).map(packFixture)

    // 全 stage マテリアル + volumetric の uniforms を同期
    const lightingMats: THREE.ShaderMaterial[] = [...stageMaterials, volMat]
    for (const mat of lightingMats) {
      const u = mat.uniforms
      if (u.uCameraPos) u.uCameraPos.value.copy(camera.position)
      if (u.uAmbient) u.uAmbient.value = s.ambient
      if (u.uExposure) u.uExposure.value = 1.0
      if (u.uHouseLights) u.uHouseLights.value = s.showHouseLights ? 1.0 : 0.0
      if (u.uUseSoftShadow) u.uUseSoftShadow.value = q.shadowSoft ? 1 : 0
      if (u.uBounceStrength) u.uBounceStrength.value = q.bounceEnabled ? 0.7 : 0.0
      if (u.uShadowSteps) u.uShadowSteps.value = q.shadowSteps
      u.uFixtureCount.value = packed.length
      const fixArr = u.uFixtures.value
      for (let i = 0; i < 16; i++) {
        const p = packed[i]
        const dst = fixArr[i]
        if (p) {
          dst.position.copy(p.position)
          dst.axis.copy(p.axis)
          dst.upAxis.copy(p.upAxis)
          dst.color.copy(p.color)
          dst.beamHalf = p.beamHalfRad
          dst.fieldHalf = p.fieldHalfRad
          dst.flatness = p.flatness
          dst.peak = p.peak
          dst.ellipticity = p.ellipticity
          dst.intensity = p.intensity
          dst.shadow = p.shadow
          dst.kind = p.kind
        } else {
          dst.intensity = 0
        }
      }
      u.uOccluderCount.value = occluders.length
      for (let i = 0; i < 12; i++) {
        const o = occluderArr[i]
        const dst = u.uOccluders.value[i]
        dst.pos.copy(o.pos)
        dst.axis.copy(o.axis)
        dst.radius = o.radius
        dst.halfHeight = o.halfHeight
      }
    }

    // ボリュメトリック専用 uniform
    volMat.uniforms.uHazeDensity.value = s.hazeDensity
    volMat.uniforms.uTime.value = time
    volMat.uniforms.uResolution.value.set(volRT.width, volRT.height)
    volMat.uniforms.uMaxSteps.value = q.volumetricSteps
    volMat.uniforms.uJitterStrength.value = q.jitterStrength
    volMat.uniforms.uUseHazeNoise.value = q.hazeNoise ? 1 : 0
    // ボリュメトリックのシャドウは軽量化のためハード固定
    volMat.uniforms.uShadowSteps.value = Math.min(16, q.shadowSteps)
    const pc = camera as THREE.PerspectiveCamera
    volMat.uniforms.uNear.value = pc.near
    volMat.uniforms.uFar.value = pc.far
    const ivp = new THREE.Matrix4()
      .multiplyMatrices(pc.projectionMatrix, pc.matrixWorldInverse)
      .invert()
    volMat.uniforms.uInvViewProj.value.copy(ivp)

    // ---- パス1: シーン → sceneRT ----
    gl.setRenderTarget(sceneRT)
    gl.setClearColor(0x000000, 1)
    gl.clear()
    gl.render(scene, camera)

    // ---- パス2: Volumetric → volRT (品質依存解像度) ----
    volMat.uniforms.uSceneColor.value = sceneRT.texture
    volMat.uniforms.uSceneDepth.value = sceneRT.depthTexture
    quad.mesh.material = volMat
    gl.setRenderTarget(volRT)
    gl.render(quad.scene, quad.camera)

    // ---- パス3a: Bright Pass → bloomMip0 ----
    brightMat.uniforms.uSrc.value = volRT.texture
    brightMat.uniforms.uThreshold.value = 1.5
    brightMat.uniforms.uKnee.value = 0.5
    brightMat.uniforms.uSrcTexel.value.set(1 / volRT.width, 1 / volRT.height)
    quad.mesh.material = brightMat
    gl.setRenderTarget(bloomMips[0])
    gl.render(quad.scene, quad.camera)

    // ---- パス3b: Downsample ----
    quad.mesh.material = downMat
    for (let i = 1; i < q.bloomLevels; i++) {
      const src = bloomMips[i - 1]
      const dst = bloomMips[i]
      downMat.uniforms.uSrc.value = src.texture
      downMat.uniforms.uTexel.value.set(1 / src.width, 1 / src.height)
      gl.setRenderTarget(dst)
      gl.render(quad.scene, quad.camera)
    }

    // ---- パス3c: Upsample (additive) ----
    quad.mesh.material = upMat
    for (let i = q.bloomLevels - 1; i >= 1; i--) {
      const src = bloomMips[i]
      const dst = bloomMips[i - 1]
      upMat.uniforms.uSrc.value = src.texture
      upMat.uniforms.uTexel.value.set(1 / src.width, 1 / src.height)
      upMat.uniforms.uRadius.value = 1.0
      gl.setRenderTarget(dst)
      gl.render(quad.scene, quad.camera)
    }

    // ---- パス4: Composite → screen ----
    compMat.uniforms.uScene.value = volRT.texture
    compMat.uniforms.uBloom.value = bloomMips[0].texture
    compMat.uniforms.uBloomIntensity.value = s.bloom ?? 0.5
    compMat.uniforms.uExposure.value = s.exposure
    compMat.uniforms.uSceneTexel.value.set(1 / volRT.width, 1 / volRT.height)
    quad.mesh.material = compMat
    gl.setRenderTarget(null)
    gl.render(quad.scene, quad.camera)
  }, 1)

  return null
}
