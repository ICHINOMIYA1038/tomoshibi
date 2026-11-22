// 舞台・幕・客席の質感の画像（CC0。出所は public/textures/LICENSES.md）
// 画像は 1 枚ずつ一度だけ読み、使う所ごとに繰り返しの回数だけ変えた写しを渡す
import * as THREE from 'three'

export type SurfaceId = 'Planks037A' | 'Fabric061' | 'Fabric026'
type Kind = 'Color' | 'NormalGL' | 'Roughness'

const loader = new THREE.TextureLoader()
const cache = new Map<string, THREE.Texture>()

function base(id: SurfaceId, kind: Kind) {
  const key = `${id}/${kind}`
  let t = cache.get(key)
  if (!t) {
    t = loader.load(`/textures/${id}/${kind}.jpg`)
    t.wrapS = t.wrapT = THREE.RepeatWrapping
    t.anisotropy = 4
    if (kind === 'Color') t.colorSpace = THREE.SRGBColorSpace
    cache.set(key, t)
  }
  return t
}

/** 繰り返しの回数を決めた写し（画像そのものは共有する） */
export function surfaceMap(id: SurfaceId, kind: Kind, repeatX: number, repeatY = repeatX) {
  const t = base(id, kind).clone()
  t.repeat.set(repeatX, repeatY)
  t.needsUpdate = true
  return t
}
