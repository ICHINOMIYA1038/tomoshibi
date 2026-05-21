import { useRef, useState, useMemo, useEffect } from 'react'
import * as THREE from 'three'
import { useFrame, useThree, type ThreeEvent } from '@react-three/fiber'
import { useStore } from '../store'
import { measureIlluminance, type IlluminanceMeasurement } from '../photometric/illuminance'

// 測光プローブ
// - probeEnabled時、シーン内クリックでその点の照度を計測
// - 結果は store.probeMeasurement に格納し UI 表示
// - プローブ点は黄色の球+法線で可視化

interface ProbeProps {
  // 床/壁メッシュへの参照 (ヒット対象)
  // 簡略のためグローバルな pointer raycast を全シーンに対して行う
}

export function PhotometricProbe(_: ProbeProps) {
  const enabled = useStore(s => s.settings.probeMode)
  const measurement = useStore(s => s.probeMeasurement)
  const setMeasurement = useStore(s => s.setProbeMeasurement)
  const fixtures = useStore(s => s.fixtures)

  // 計測の再計算 (フィクスチャ変更でも更新)
  useEffect(() => {
    if (!measurement) return
    const pos = new THREE.Vector3(...measurement.worldPos)
    const norm = new THREE.Vector3(...measurement.surfaceNormal)
    setMeasurement(measureIlluminance(pos, norm, fixtures))
  }, [fixtures])

  if (!enabled || !measurement) return null

  const pos = measurement.worldPos
  const norm = measurement.surfaceNormal
  const normEnd: [number, number, number] = [
    pos[0] + norm[0] * 0.5,
    pos[1] + norm[1] * 0.5,
    pos[2] + norm[2] * 0.5,
  ]
  return (
    <group>
      <mesh position={pos} renderOrder={2000}>
        <sphereGeometry args={[0.08, 16, 12]} />
        <meshBasicMaterial color="#ffeb3b" depthTest={false} />
      </mesh>
      <mesh position={pos} renderOrder={2000}>
        <ringGeometry args={[0.15, 0.18, 32]} />
        <meshBasicMaterial color="#ffeb3b" depthTest={false} side={THREE.DoubleSide} />
      </mesh>
      {/* 法線 */}
      <line>
        <bufferGeometry>
          <bufferAttribute
            attach="attributes-position"
            args={[new Float32Array([...pos, ...normEnd]), 3]}
          />
        </bufferGeometry>
        <lineBasicMaterial color="#ffeb3b" depthTest={false} />
      </line>
    </group>
  )
}

// シーンクリックハンドラ: プローブモード時に呼ぶ
export function useProbeClickHandler() {
  const enabled = useStore(s => s.settings.probeMode)
  const setMeasurement = useStore(s => s.setProbeMeasurement)
  return (e: ThreeEvent<MouseEvent>) => {
    if (!enabled) return false
    e.stopPropagation()
    const fixtures = useStore.getState().fixtures
    const m = measureIlluminance(e.point, e.face?.normal ?? new THREE.Vector3(0, 1, 0), fixtures)
    setMeasurement(m)
    return true
  }
}
