import { useEffect } from 'react'
import { useThree } from '@react-three/fiber'
import * as THREE from 'three'
import type { StagePoint } from '../store'

// 3D の画面の外（HTML のドロップ）から、画面上の点が床（y=0）のどこに当たるかを求める。
// カメラは Canvas の中でしか取れないので、Canvas の中に置いた FloorPicker が求め方を登録する。

export type DropHit = { floor: StagePoint | null; ray: THREE.Ray }
let picker: ((clientX: number, clientY: number) => DropHit) | null = null

/** 画面上の点を通る視線と、それが床に当たる位置（床より上を指したときは null） */
export function pickDropPoint(clientX: number, clientY: number): DropHit | null {
  return picker?.(clientX, clientY) ?? null
}

const FLOOR = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0)

export function FloorPicker() {
  const camera = useThree(state => state.camera)
  const canvas = useThree(state => state.gl.domElement)
  useEffect(() => {
    const raycaster = new THREE.Raycaster()
    const hit = new THREE.Vector3()
    picker = (clientX, clientY) => {
      const rect = canvas.getBoundingClientRect()
      const ndc = new THREE.Vector2((clientX - rect.left) / rect.width * 2 - 1, -(clientY - rect.top) / rect.height * 2 + 1)
      raycaster.setFromCamera(ndc, camera)
      // 床より上（空）を指したときは当たらない
      const floor: StagePoint | null = raycaster.ray.intersectPlane(FLOOR, hit) ? [hit.x, hit.z] : null
      return { floor, ray: raycaster.ray.clone() }
    }
    return () => { picker = null }
  }, [camera, canvas])
  return null
}
