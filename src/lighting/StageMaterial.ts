// シンプル版: 標準 PBR (MeshStandardMaterial) に切り替え
// 旧カスタム PBR シェーダー (PostFX パイプライン依存) は廃止
//
// 旧 API との互換性のため、関数名・引数名は据え置き。返り値は
// THREE.MeshStandardMaterial だが、消費側コードでは any 経由なので問題ない。

import * as THREE from 'three'
import { MAX_FIXTURES, MAX_OCCLUDERS } from './shaders'

export function createStageMaterial(opts: {
  baseColor?: THREE.Color
  roughness?: number
  metallic?: number
}) {
  return new THREE.MeshStandardMaterial({
    color: opts.baseColor ?? new THREE.Color(0.18, 0.18, 0.2),
    roughness: opts.roughness ?? 0.7,
    metalness: opts.metallic ?? 0.0,
  }) as unknown as THREE.ShaderMaterial
}

// 旧 API: RenderPipeline が参照していたが現在は未使用。型互換のため残す。
export function makeEmptyFixtures() {
  return Array.from({ length: MAX_FIXTURES }, () => ({
    position: new THREE.Vector3(),
    axis: new THREE.Vector3(),
    upAxis: new THREE.Vector3(0, 1, 0),
    color: new THREE.Color(),
    beamHalf: 0, fieldHalf: 0, flatness: 1, peak: 0, ellipticity: 1,
    intensity: 0, shadow: 0, kind: 0,
  }))
}
export function makeEmptyOccluders() {
  return Array.from({ length: MAX_OCCLUDERS }, () => ({
    pos: new THREE.Vector3(),
    axis: new THREE.Vector3(0, 1, 0),
    radius: 0, halfHeight: 0,
  }))
}
