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
  const selection = useStore(s => s.selection)
  const isSelected = selection.kind === 'setpiece' && selection.id === piece.id

  const onClick = (e: any) => {
    e.stopPropagation()
    select('setpiece', piece.id)
  }

  if (piece.kind === 'gltf') {
    return piece.url
      ? <GLTFItem piece={piece} onClick={onClick} selected={isSelected} />
      : <group position={piece.position} rotation={piece.rotation} scale={piece.scale} onClick={onClick}>
          <mesh castShadow>
            <boxGeometry args={[1, 1, 1]} />
            <meshStandardMaterial color={isSelected ? '#6cf' : '#876040'} transparent opacity={0.45} wireframe />
          </mesh>
        </group>
  }
  const [w, h, d] = piece.size ?? [0.6, 0.4, 0.4]
  return (
    <group
      position={piece.position}
      rotation={piece.rotation}
      scale={piece.scale}
      onClick={onClick}
    >
      <SetPieceShape piece={piece} size={[w, h, d]} />
      {isSelected && (
        <mesh>
          <boxGeometry args={[w * 1.02, h * 1.02, d * 1.02]} />
          <meshBasicMaterial color="#6cf" wireframe transparent opacity={0.4} />
        </mesh>
      )}
    </group>
  )
}

function Solid({ size, position = [0, 0, 0], color }: {
  size: [number, number, number]
  position?: [number, number, number]
  color: string
}) {
  return (
    <mesh position={position} castShadow receiveShadow>
      <boxGeometry args={size} />
      <meshStandardMaterial color={color} roughness={0.8} metalness={0.04} />
    </mesh>
  )
}

function SetPieceShape({ piece, size: [w, h, d] }: { piece: SetPiece; size: [number, number, number] }) {
  const color = piece.color ?? '#876040'
  if (piece.appearance === 'bench') {
    return <>
      <Solid size={[w, h * 0.1, d]} position={[0, -h * 0.02, 0]} color={color} />
      <Solid size={[w, h * 0.53, d * 0.12]} position={[0, h * 0.24, -d * 0.43]} color={color} />
      {[-1, 1].map(side => <Solid key={side} size={[w * 0.09, h * 0.48, d * 0.12]}
        position={[side * w * 0.42, -h * 0.27, 0]} color={color} />)}
      <Solid size={[w * 0.92, h * 0.07, d * 0.08]} position={[0, -h * 0.27, d * 0.25]} color={color} />
    </>
  }
  if (piece.appearance === 'door') {
    return <>
      <Solid size={[w * 0.8, h * 0.93, d * 0.55]} position={[0, -h * 0.025, 0]} color={color} />
      <Solid size={[w * 0.1, h, d]} position={[-w * 0.45, 0, 0]} color="#958b76" />
      <Solid size={[w * 0.1, h, d]} position={[w * 0.45, 0, 0]} color="#958b76" />
      <Solid size={[w, h * 0.055, d]} position={[0, h * 0.47, 0]} color="#958b76" />
      <Solid size={[w * 0.055, h * 0.065, d * 0.25]} position={[w * 0.28, -h * 0.03, d * 0.42]} color="#e5c88d" />
    </>
  }
  if (piece.appearance === 'suitcase') {
    return <>
      <Solid size={[w, h * 0.8, d]} position={[0, -h * 0.1, 0]} color={color} />
      <Solid size={[w * 0.35, h * 0.08, d * 0.22]} position={[0, h * 0.45, 0]} color="#382a23" />
      {[-1, 1].map(side => <Solid key={side} size={[w * 0.07, h * 0.25, d * 0.22]}
        position={[side * w * 0.14, h * 0.33, 0]} color="#382a23" />)}
      <Solid size={[w * 0.08, h * 0.8, d * 1.01]} position={[0, -h * 0.1, 0]} color="#594237" />
    </>
  }
  if (piece.appearance === 'table') {
    return <>
      <Solid size={[w, h * 0.12, d]} position={[0, h * 0.44, 0]} color={color} />
      {[-1, 1].flatMap(x => [-1, 1].map(z => <Solid key={`${x}-${z}`}
        size={[w * 0.08, h * 0.86, d * 0.1]}
        position={[x * w * 0.43, -h * 0.07, z * d * 0.4]} color={color} />))}
    </>
  }
  if (piece.appearance === 'bookshelf') {
    const bookColors = ['#9d6652', '#627c78', '#ad925f', '#6b627b', '#b27060']
    return <>
      <Solid size={[w, h, d * 0.12]} position={[0, 0, -d * 0.44]} color={color} />
      {[-1, 1].map(side => <Solid key={side} size={[w * 0.065, h, d]}
        position={[side * w * 0.47, 0, 0]} color={color} />)}
      {[-0.48, -0.17, 0.14, 0.45].map((level, row) => <group key={row}>
        <Solid size={[w, h * 0.035, d]} position={[0, h * level, 0]} color={color} />
        {row < 3 && bookColors.map((bookColor, column) => <Solid key={column}
          size={[w * 0.13, h * (0.19 + (column % 3) * 0.025), d * 0.56]}
          position={[(column - 2) * w * 0.17, h * (level + 0.12), d * 0.09]}
          color={bookColor} />)}
      </group>)}
    </>
  }
  if (piece.appearance === 'window') {
    return <>
      <mesh position={[0, 0, 0]}>
        <boxGeometry args={[w * 0.91, h * 0.91, d * 0.35]} />
        <meshStandardMaterial color="#8da9b9" transparent opacity={0.22} depthWrite={false}
          roughness={0.12} metalness={0.16} />
      </mesh>
      {[-1, 1].map(side => <Solid key={side} size={[w * 0.06, h, d]}
        position={[side * w * 0.47, 0, 0]} color={color} />)}
      {[-1, 1].map(side => <Solid key={side} size={[w, h * 0.05, d]}
        position={[0, side * h * 0.475, 0]} color={color} />)}
      <Solid size={[w * 0.045, h, d]} color={color} />
      <Solid size={[w, h * 0.045, d]} color={color} />
    </>
  }
  return <Solid size={[w, h, d]} color={color} />
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
