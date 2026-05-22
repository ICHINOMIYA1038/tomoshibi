import { useGLTF } from '@react-three/drei'
import * as THREE from 'three'
import { useStore } from '../store'
import type { SetPiece } from '../types'

export function SetPieces() {
  const pieces = useStore(s => s.setPieces)
  return (
    <group>
      {pieces.map(p => <SetPieceItem key={p.id} piece={p} />)}
    </group>
  )
}

function SetPieceItem({ piece }: { piece: SetPiece }) {
  const select = useStore(s => s.select)
  const selection = useStore(s => s.selection)
  const isSelected = selection.kind === 'setpiece' && selection.id === piece.id

  const onClick = (e: any) => {
    e.stopPropagation()
    select('setpiece', piece.id)
  }

  if (piece.kind === 'gltf') {
    return <GLTFItem piece={piece} onClick={onClick} selected={isSelected} />
  }
  // box / platform / riser
  const [w, h, d] = piece.size ?? [0.6, 0.4, 0.4]
  return (
    <group
      position={piece.position}
      rotation={piece.rotation}
      scale={piece.scale}
      onClick={onClick}
    >
      <mesh castShadow receiveShadow>
        <boxGeometry args={[w, h, d]} />
        <meshStandardMaterial
          color={piece.color ?? '#876040'}
          roughness={0.85}
          metalness={0.0}
        />
      </mesh>
      {isSelected && (
        <mesh>
          <boxGeometry args={[w * 1.02, h * 1.02, d * 1.02]} />
          <meshBasicMaterial color="#6cf" wireframe transparent opacity={0.4} />
        </mesh>
      )}
    </group>
  )
}

function GLTFItem({ piece, onClick, selected }: { piece: SetPiece; onClick: (e: any) => void; selected: boolean }) {
  const { scene } = useGLTF(piece.url!)
  return (
    <group
      position={piece.position}
      rotation={piece.rotation}
      scale={piece.scale}
      onClick={onClick}
    >
      <primitive object={scene.clone()} />
      {selected && (
        <mesh>
          <boxGeometry args={[1.02, 1.02, 1.02]} />
          <meshBasicMaterial color="#6cf" wireframe transparent opacity={0.3} />
        </mesh>
      )}
    </group>
  )
}

export async function importGLTFFile(file: File, addSetPiece: (sp: SetPiece) => void): Promise<string> {
  const url = URL.createObjectURL(file)
  const id = `sp${Date.now()}`
  addSetPiece({
    id,
    name: file.name,
    kind: 'gltf',
    url,
    position: [0, 0, -2],
    rotation: [0, 0, 0],
    scale: 1,
  })
  return id
}

void THREE // keep import for tree shake stability
