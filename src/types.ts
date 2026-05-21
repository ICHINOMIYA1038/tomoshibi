// 共通型 (循環参照を避けるため別ファイル)

export interface SetPiece {
  id: string
  name: string
  url: string                // GLTF/GLB URL (Object URL でも可)
  position: [number, number, number]
  rotation: [number, number, number]
  scale: number
}
