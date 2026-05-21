import { useGLTF } from '@react-three/drei'
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
  const { scene } = useGLTF(piece.url)
  return (
    <group
      position={piece.position}
      rotation={piece.rotation}
      scale={piece.scale}
      onClick={(e) => { e.stopPropagation(); select(null, null) }}
    >
      <primitive object={scene.clone()} />
    </group>
  )
}

export async function importGLTFFile(file: File, addSetPiece: (sp: SetPiece) => void): Promise<string> {
  const url = URL.createObjectURL(file)
  const id = `sp${Date.now()}`
  addSetPiece({
    id,
    name: file.name,
    url,
    position: [0, 0, -2],
    rotation: [0, 0, 0],
    scale: 1,
  })
  return id
}
