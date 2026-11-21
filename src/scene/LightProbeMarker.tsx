import { useEffect } from 'react'
import { useThree } from '@react-three/fiber'
import { useStore } from '../store'
import { rememberScene } from '../lighting/lightAtPoint'

/** 「この点に当たっている照明」で調べている点の目印（小さな輪）。あわせて、さえぎる物を調べるための場面を覚える */
export function LightProbeMarker() {
  const scene = useThree(s => s.scene)
  useEffect(() => { rememberScene(scene); return () => rememberScene(null) }, [scene])
  const probe = useStore(s => s.lightProbe)
  if (!probe) return null
  return <group position={probe.point}>
    <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.02, 0]} raycast={() => null}>
      <ringGeometry args={[0.12, 0.17, 32]} />
      <meshBasicMaterial color="#ffd28a" transparent opacity={0.95} depthTest={false} />
    </mesh>
    <mesh raycast={() => null}>
      <sphereGeometry args={[0.04, 12, 8]} />
      <meshBasicMaterial color="#ffd28a" depthTest={false} />
    </mesh>
  </group>
}
