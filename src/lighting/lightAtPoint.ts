// 「この点に当たっている照明」：舞台の上の 1 点について、どの照明の光がどれだけ届いているかを並べる（2026-11-21 オーナー）。
// 光から光源を推し量る問題ではなく、照明はすべてわかっているので、照明ごとに「その点に光が届くか・どれだけ明るいか」を順に計算するだけ。
// - 明るさは、照明の欄の数値と同じ計算（photometric/illuminance.ts の直接光）。面の向きは問わず、光に正面を向けた面で比べる
// - 途中に役者や装置があれば、その照明は「さえぎられている」に分ける（3D の物に向けて線を引いて確かめる）
// - 跳ね返りの光は数に入れない
import * as THREE from 'three'
import type { Fixture } from '../store'
import { measureIlluminance } from '../photometric/illuminance'

export type LightAtPoint = { id: string; name: string; lux: number; blocked: boolean }

let currentScene: THREE.Scene | null = null
/** 3D の画面の中から、場面（three の Scene）を覚えておく。さえぎる物を調べるのに使う */
export function rememberScene(scene: THREE.Scene | null) { currentScene = scene }

const raycaster = new THREE.Raycaster()

/** 光の通り道をさえぎる物か。光の筋・当たり判定用の透明な物・文字の札は数えない */
function blocks(object: THREE.Object3D) {
  const mesh = object as THREE.Mesh
  if (!mesh.isMesh || !mesh.visible) return false
  const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material]
  return materials.some(material => material && material.visible !== false && !(material.transparent && (material.opacity < 0.5 || material.depthWrite === false)))
}

function visibleFromLight(point: THREE.Vector3, lightPos: THREE.Vector3) {
  if (!currentScene) return true
  const toLight = lightPos.clone().sub(point)
  const distance = toLight.length()
  const dir = toLight.normalize()
  // 点の面そのものと、照明の本体（灯体）は数えない
  raycaster.set(point.clone().addScaledVector(dir, 0.06), dir)
  raycaster.far = Math.max(0, distance - 0.9)
  const hits = raycaster.intersectObjects(currentScene.children, true)
  return !hits.some(hit => {
    for (let o: THREE.Object3D | null = hit.object; o; o = o.parent) if (!o.visible) return false
    return blocks(hit.object)
  })
}

export function lightsAtPoint(point: [number, number, number], fixtures: Fixture[]): LightAtPoint[] {
  const at = new THREE.Vector3(...point)
  const out: LightAtPoint[] = []
  for (const fixture of fixtures) {
    if (!fixture.enabled || fixture.intensity <= 0) continue
    const lightPos = new THREE.Vector3(...fixture.position)
    const normal = lightPos.clone().sub(at).normalize()
    const lux = measureIlluminance(at, normal, [fixture]).totalLux
    if (lux <= 0) continue
    out.push({ id: fixture.id, name: fixture.name, lux, blocked: !visibleFromLight(at, lightPos) })
  }
  return out.sort((a, b) => b.lux - a.lux)
}

