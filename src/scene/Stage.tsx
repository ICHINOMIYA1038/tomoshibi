import { useEffect, useMemo, useRef } from 'react'
import * as THREE from 'three'
import { createStageMaterial } from '../lighting/StageMaterial'
import { useStore } from '../store'
import { DEFAULT_VENUE_LAYOUT, stageLocalFootprint } from '../venueLayout'
import { DEFAULT_CYC_COLOR, DEFAULT_WALL_COLOR, FLOOR_FINISHES, resolveStageParts } from '../stageParts'

export function Stage({ onMaterialsReady }: { onMaterialsReady: (mats: THREE.ShaderMaterial[]) => void }) {
  const layout = useStore(state => state.productionPlan.venueLayout ?? DEFAULT_VENUE_LAYOUT)
  const outline = useMemo(() => stageLocalFootprint(layout), [layout])
  const floorGeom = useMemo(() => {
    const shape = new THREE.Shape()
    outline.forEach(([x, z], index) => index ? shape.lineTo(x, -z) : shape.moveTo(x, -z))
    shape.closePath()
    const geometry = new THREE.ShapeGeometry(shape)
    geometry.rotateX(-Math.PI / 2)
    return geometry
  }, [outline])
  useEffect(() => () => floorGeom.dispose(), [floorGeom])
  const front = -3 + layout.stageDepth / 2
  const framed = layout.stageShape === 'proscenium'
  const parts = useMemo(() => resolveStageParts(layout), [layout])
  const finish = FLOOR_FINISHES.find(item => item.id === layout.floorFinish) ?? FLOOR_FINISHES[0]
  const floorMat = useMemo(() => createStageMaterial({
    // 舞台床: 既定は黒塗装の僅かに反射する木の感触。仕上げと色は会場の配置で変えられる
    baseColor: layout.floorColor ? new THREE.Color(layout.floorColor) : new THREE.Color(...finish.color),
    roughness: finish.roughness,
  }), [finish, layout.floorColor])
  const wallMat = useMemo(() => createStageMaterial({
    // バックウォール: マット黒
    baseColor: layout.wallColor ? new THREE.Color(layout.wallColor) : new THREE.Color(...DEFAULT_WALL_COLOR),
    roughness: 0.98,
  }), [layout.wallColor])
  const cycMat = useMemo(() => createStageMaterial({
    baseColor: layout.cycColor ? new THREE.Color(layout.cycColor) : new THREE.Color(...DEFAULT_CYC_COLOR),
    roughness: 1.0,
  }), [layout.cycColor])
  const wingMat = useMemo(() => createStageMaterial({
    // 袖幕: 黒のベロア
    baseColor: new THREE.Color(0.02, 0.019, 0.021),
    roughness: 1.0,
  }), [])
  useEffect(() => () => floorMat.dispose(), [floorMat])
  useEffect(() => () => wallMat.dispose(), [wallMat])
  useEffect(() => () => cycMat.dispose(), [cycMat])
  for (const mat of [wallMat, cycMat, wingMat]) (mat as unknown as THREE.MeshStandardMaterial).side = THREE.DoubleSide
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
    () => [floorMat, wallMat, cycMat, wingMat, procMat, batonMat, platformMat],
    [floorMat, wallMat, cycMat, wingMat, procMat, batonMat, platformMat],
  )

  // 一度だけ通知
  const notified = useRef(false)
  if (!notified.current) {
    notified.current = true
    onMaterialsReady(mats)
  }

  return (
    <group position={[layout.stageOffset?.[0] ?? 0, 0, layout.stageOffset?.[1] ?? 0]}>
      <mesh geometry={floorGeom} material={floorMat} receiveShadow />
      {parts.map(item => <group key={item.id} position={[item.x, 0, item.z]} rotation={[0, item.rotationDeg * Math.PI / 180, 0]}>
        {item.kind === 'floor' && <mesh position={[0, 0.006, 0]} rotation={[-Math.PI / 2, 0, 0]} material={floorMat} receiveShadow>
          <planeGeometry args={[item.width, item.depth]} />
        </mesh>}
        {item.kind === 'platform' && <mesh position={[0, item.height / 2, 0]} material={platformMat} castShadow receiveShadow>
          <boxGeometry args={[item.width, item.height, item.depth]} />
        </mesh>}
        {(item.kind === 'wall' || item.kind === 'cyc' || item.kind === 'wing') &&
          <mesh position={[0, item.elevation + item.height / 2, 0]} receiveShadow
            material={item.kind === 'cyc' ? cycMat : item.kind === 'wing' ? wingMat : wallMat}>
            <planeGeometry args={[item.width, item.height]} />
          </mesh>}
        {item.kind === 'batten' && <mesh position={[0, item.elevation, 0]} rotation={[0, 0, Math.PI / 2]} material={batonMat}>
          <cylinderGeometry args={[0.04, 0.04, item.width, 12]} />
        </mesh>}
      </group>)}
      {framed && layout.showProsceniumFrame === true && <>
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
    </group>
  )
}

