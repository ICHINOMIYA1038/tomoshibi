import { useMemo, useRef } from 'react'
import * as THREE from 'three'
import { createStageMaterial } from '../lighting/StageMaterial'

// 舞台床、バックウォール、サイドウォール、プロセニアム、バトン、ホリゾント
// すべて同じカスタムマテリアル (パラメータ違い) を使用

export function Stage({ onMaterialsReady }: { onMaterialsReady: (mats: THREE.ShaderMaterial[]) => void }) {
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

  // 舞台寸法 (m)
  // 開口 (proscenium opening) 幅 12m, 高さ 6m
  // 舞台奥行 9m (場奥), 床は z = -8..2
  return (
    <group>
      {/* 床 (ステージフロア) */}
      <mesh geometry={floorGeom} material={floorMat} receiveShadow />

      {/* バックウォール (黒) */}
      <mesh position={[0, 4, -8]} material={wallMat} receiveShadow>
        <planeGeometry args={[16, 8]} />
      </mesh>

      {/* サイドウォール */}
      <mesh position={[-8, 4, -3]} rotation={[0, Math.PI / 2, 0]} material={wallMat} receiveShadow>
        <planeGeometry args={[10, 8]} />
      </mesh>
      <mesh position={[8, 4, -3]} rotation={[0, -Math.PI / 2, 0]} material={wallMat} receiveShadow>
        <planeGeometry args={[10, 8]} />
      </mesh>

      {/* ホリゾント (背景幕 白) */}
      <mesh position={[0, 3.5, -7.6]} material={cycMat} receiveShadow>
        <planeGeometry args={[14, 6.5]} />
      </mesh>

      {/* プロセニアム枠 (赤緞帳に見立てて両袖) */}
      <mesh position={[-6.5, 4, 2.5]} material={procMat}>
        <boxGeometry args={[1, 8, 0.4]} />
      </mesh>
      <mesh position={[6.5, 4, 2.5]} material={procMat}>
        <boxGeometry args={[1, 8, 0.4]} />
      </mesh>
      <mesh position={[0, 7.5, 2.5]} material={procMat}>
        <boxGeometry args={[14, 1, 0.4]} />
      </mesh>

      {/* バトン (照明バー) - 水平に渡す */}
      {[1.5, -1, -3.5, -6].map((z, i) => (
        <mesh key={`baton-${i}`} position={[0, 7.0, z]} rotation={[0, 0, Math.PI / 2]} material={batonMat}>
          <cylinderGeometry args={[0.04, 0.04, 13, 12]} />
        </mesh>
      ))}

      {/* 平台は SetPieces (削除可能なインスタンス) に移行したのでここでは描画しない */}
    </group>
  )
}

// 床ジオメトリは細分化して陰影を綺麗に
const floorGeom = new THREE.PlaneGeometry(16, 12, 64, 48)
floorGeom.rotateX(-Math.PI / 2)
floorGeom.translate(0, 0, -3)

