import { useEffect, useMemo, useRef } from 'react'
import * as THREE from 'three'
import { createStageMaterial } from '../lighting/StageMaterial'
import { useStore } from '../store'
import { DEFAULT_VENUE_LAYOUT, stageFootprint } from '../venueLayout'

export function Stage({ onMaterialsReady }: { onMaterialsReady: (mats: THREE.ShaderMaterial[]) => void }) {
  const layout = useStore(state => state.productionPlan.venueLayout ?? DEFAULT_VENUE_LAYOUT)
  const outline = useMemo(() => stageFootprint(layout), [layout])
  const floorGeom = useMemo(() => {
    const shape = new THREE.Shape()
    outline.forEach(([x, z], index) => index ? shape.lineTo(x, -z) : shape.moveTo(x, -z))
    shape.closePath()
    const geometry = new THREE.ShapeGeometry(shape)
    geometry.rotateX(-Math.PI / 2)
    return geometry
  }, [outline])
  useEffect(() => () => floorGeom.dispose(), [floorGeom])
  const rear = -3 - layout.stageDepth / 2
  const front = -3 + layout.stageDepth / 2
  const framed = layout.stageShape === 'proscenium'
  const floorMat = useMemo(() => createStageMaterial({
    // 舞台床: 黒塗装の僅かに反射する木の感触
    baseColor: new THREE.Color(0.045, 0.04, 0.038),
    roughness: 0.55,
  }), [])
  const wallMat = useMemo(() => createStageMaterial({
    // バックウォール: マット黒
    baseColor: new THREE.Color(0.035, 0.033, 0.035),
    roughness: 0.98,
  }), [])
  const cycMat = useMemo(() => createStageMaterial({
    baseColor: new THREE.Color(0.9, 0.9, 0.92),
    roughness: 1.0,
  }), [])
  const procMat = useMemo(() => createStageMaterial({
    // プロセニアム緞帳: 落ち着いたボルドー
    baseColor: new THREE.Color(0.32, 0.05, 0.07),
    roughness: 0.78,
  }), [])
  const batonMat = useMemo(() => createStageMaterial({
    baseColor: new THREE.Color(0.15, 0.15, 0.17),
    roughness: 0.4,
    metallic: 0.7,
  }), [])
  const platformMat = useMemo(() => createStageMaterial({
    baseColor: new THREE.Color(0.4, 0.3, 0.2),
    roughness: 0.7,
  }), [])

  const mats = useMemo(
    () => [floorMat, wallMat, cycMat, procMat, batonMat, platformMat],
    [floorMat, wallMat, cycMat, procMat, batonMat, platformMat],
  )

  // 一度だけ通知
  const notified = useRef(false)
  if (!notified.current) {
    notified.current = true
    onMaterialsReady(mats)
  }

  return (
    <group>
      <mesh geometry={floorGeom} material={floorMat} receiveShadow />
      {framed && <>
        <mesh position={[0, 4, rear + 1]} material={wallMat} receiveShadow>
          <planeGeometry args={[layout.stageWidth, 8]} />
        </mesh>
        <mesh position={[-layout.stageWidth / 2, 4, -3]} rotation={[0, Math.PI / 2, 0]} material={wallMat} receiveShadow>
          <planeGeometry args={[layout.stageDepth - 2, 8]} />
        </mesh>
        <mesh position={[layout.stageWidth / 2, 4, -3]} rotation={[0, -Math.PI / 2, 0]} material={wallMat} receiveShadow>
          <planeGeometry args={[layout.stageDepth - 2, 8]} />
        </mesh>
        <mesh position={[0, 3.5, rear + 1.4]} material={cycMat} receiveShadow>
          <planeGeometry args={[Math.max(4, layout.stageWidth - 2), 6.5]} />
        </mesh>
        <mesh position={[-layout.stageWidth / 2 + 1.5, 4, front - .5]} material={procMat}>
          <boxGeometry args={[1, 8, .4]} />
        </mesh>
        <mesh position={[layout.stageWidth / 2 - 1.5, 4, front - .5]} material={procMat}>
          <boxGeometry args={[1, 8, .4]} />
        </mesh>
        <mesh position={[0, 7.5, front - .5]} material={procMat}>
          <boxGeometry args={[Math.max(4, layout.stageWidth - 2), 1, .4]} />
        </mesh>
      </>}
      {framed && [front - 1.5, -3 + layout.stageDepth / 6, -3 - layout.stageDepth / 6, rear + 3].map((z, i) => (
        <mesh key={`baton-${i}`} position={[0, 7.0, z]} rotation={[0, 0, Math.PI / 2]} material={batonMat}>
          <cylinderGeometry args={[0.04, 0.04, Math.max(4, layout.stageWidth - 3), 12]} />
        </mesh>
      ))}
    </group>
  )
}

