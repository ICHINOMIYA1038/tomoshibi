import { useEffect, useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import type { SetPiece } from '../types'

// スモークマシンとドライアイスから出る煙。ぼかした丸い板をカメラに向けて並べ、毎フレーム動かす。
// 板は照明で照らされる材質にするので、明かりの当たった所の煙が明るく見える。

const COUNT = 56

/** 量（0〜1）。保存データにおかしな値があれば既定の 0.6 */
export function smokeAmountOf(piece: Pick<SetPiece, 'smokeAmount'>) {
  const value = piece.smokeAmount
  return typeof value === 'number' && Number.isFinite(value) ? Math.min(1, Math.max(0, value)) : 0.6
}

/** 煙が会場の空気に足すヘイズの濃さ。スモークは光の筋を濃くし、ドライアイスは床の近くに溜まるのでほとんど足さない */
export function smokeHaze(pieces: SetPiece[]) {
  return pieces.reduce((sum, piece) => sum + (piece.appearance === 'smoke' ? smokeAmountOf(piece) * 0.35
    : piece.appearance === 'dryice' ? smokeAmountOf(piece) * 0.05 : 0), 0)
}

let puffTexture: THREE.Texture | null = null
function puff() {
  if (puffTexture || typeof document === 'undefined') return puffTexture
  const size = 128
  const canvas = document.createElement('canvas')
  canvas.width = size
  canvas.height = size
  const g = canvas.getContext('2d')
  if (!g) return null
  const gradient = g.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2)
  // 縁がわからないよう、中心からなだらかに薄くする
  for (let step = 0; step <= 10; step++) {
    const t = step / 10
    gradient.addColorStop(t, `rgba(255,255,255,${(Math.pow(1 - t, 2.2) * (1 - t * .15)).toFixed(3)})`)
  }
  g.fillStyle = gradient
  g.fillRect(0, 0, size, size)
  puffTexture = new THREE.CanvasTexture(canvas)
  return puffTexture
}

/** 決まった乱数（粒ごとに同じ値） */
function noise(index: number, salt: number) {
  const x = Math.sin(index * 12.9898 + salt * 78.233) * 43758.5453
  return x - Math.floor(x)
}

export function SmokeCloud({ piece, size: [, h, d] }: { piece: SetPiece; size: [number, number, number] }) {
  const dryIce = piece.appearance === 'dryice'
  const amount = smokeAmountOf(piece)
  const group = useRef<THREE.Group>(null)
  const meshes = useRef<Array<THREE.Mesh | null>>([])
  const materials = useMemo(() => Array.from({ length: COUNT }, () => new THREE.MeshStandardMaterial({
    color: dryIce ? '#e4e8ee' : '#c9ccd2', roughness: 1, metalness: 0, transparent: true, depthWrite: false,
    alphaMap: puff(), side: THREE.DoubleSide, emissive: new THREE.Color('#141518'),
  })), [dryIce])
  useEffect(() => () => materials.forEach(material => material.dispose()), [materials])
  const parentQuaternion = useMemo(() => new THREE.Quaternion(), [])
  useFrame(({ clock, camera }) => {
    if (!group.current) return
    group.current.parent?.getWorldQuaternion(parentQuaternion)
    parentQuaternion.invert().multiply(camera.quaternion)
    const time = clock.elapsedTime
    const life = dryIce ? 9 : 6
    meshes.current.forEach((mesh, index) => {
      if (!mesh) return
      const age = (time / life + index / COUNT) % 1
      // 粒ごとに広がる向きを少しずつ変える
      const spread = (noise(index, 1) - .5) * (dryIce ? 2.2 : .9)
      const reach = (dryIce ? 3.5 : 4.5) * (.35 + .65 * amount) * age
      const x = Math.sin(spread) * reach
      const z = d / 2 + Math.cos(spread) * reach
      const y = dryIce ? -h / 2 + .12 + age * .18 : age * (1.2 + noise(index, 2) * 1.5) + Math.sin(time * .7 + index) * .1
      mesh.position.set(x, y, z)
      mesh.quaternion.copy(parentQuaternion)
      const scale = (dryIce ? .8 : .6) + age * (dryIce ? 2.8 : 3.4)
      mesh.scale.set(scale, dryIce ? scale * .55 : scale, 1)
      materials[index].opacity = amount * (dryIce ? .3 : .14) * Math.sin(Math.PI * age)
    })
  })
  if (amount <= 0) return null
  return <group ref={group}>
    {materials.map((material, index) => <mesh key={index} ref={mesh => { meshes.current[index] = mesh }} material={material} raycast={() => null} renderOrder={3}>
      <planeGeometry args={[1, 1]} />
    </mesh>)}
  </group>
}
