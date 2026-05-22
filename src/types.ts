// 共通型 (循環参照を避けるため別ファイル)

export type SetPieceKind = 'box' | 'platform' | 'riser' | 'gltf'

export interface SetPiece {
  id: string
  name: string
  kind: SetPieceKind
  url?: string                              // gltf 用
  size?: [number, number, number]           // box/platform/riser 用 (幅,高,奥行 m)
  color?: string                            // 木材色など
  position: [number, number, number]
  rotation: [number, number, number]
  scale: number
}
