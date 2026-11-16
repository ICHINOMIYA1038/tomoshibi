// 共通型 (循環参照を避けるため別ファイル)

export type SetPieceKind = 'box' | 'platform' | 'riser' | 'gltf'
export type SetPieceAppearance = 'basic' | 'bench' | 'door' | 'suitcase' | 'table' | 'bookshelf' | 'window' | 'smoke' | 'dryice'

export interface SetPiece {
  id: string
  name: string
  kind: SetPieceKind
  appearance?: SetPieceAppearance
  url?: string                              // gltf 用
  size?: [number, number, number]           // box/platform/riser 用 (幅,高,奥行 m)
  color?: string                            // 木材色など
  position: [number, number, number]
  rotation: [number, number, number]
  scale: number
  /** 親（hierarchy.ts）。'stage'・舞台の部品・舞台セットの id。null は親なし、無ければ舞台の床 */
  parentId?: string | null
  /** スモークマシン・ドライアイスの量（0〜1）。無ければ 0.6 */
  smokeAmount?: number
}
