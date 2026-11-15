import { useStore } from './store'
import { DEFAULT_VENUE_LAYOUT } from './venueLayout'
import { clampPart, newPart, resolveStageParts, type StagePartKind } from './stageParts'

// 選んでいる物の複製・削除。種類によらず同じ操作にする（Unity の ⌘D・Delete）

export function duplicateSelection() {
  const s = useStore.getState()
  const { kind, id } = s.selection
  if (!id) return
  if (kind === 'fixture') s.duplicateFixture(id)
  else if (kind === 'performer') s.duplicatePerformer(id)
  else if (kind === 'setpiece') s.duplicateSetPiece(id)
  else if (kind === 'stagepart') {
    const copy = s.duplicateStagePart(id)
    if (copy) s.select('stagepart', copy)
  } else if (kind === 'audience') {
    const source = (s.productionPlan.audienceBlocks ?? []).find(block => block.id === id)
    const copy = source && s.addAudienceBlock()
    if (source && copy) {
      const { id: _id, name, position, ...rest } = source
      s.updateAudienceBlock(copy, { ...rest, name: `${name} (複製)`, position: [position[0] + 1, position[1] + 1] })
      s.select('audience', copy)
    }
  }
}

export function canDelete(kind: string | null) {
  return kind === 'fixture' || kind === 'performer' || kind === 'setpiece' || kind === 'stagepart' || kind === 'audience'
}

/** 子は消さず、親に付け替える。元に戻すは ⌘Z */
export function deleteSelection() {
  const s = useStore.getState()
  const { kind, id } = s.selection
  if (!id) return
  if (kind === 'fixture') s.removeFixture(id)
  else if (kind === 'performer') s.removePerformer(id)
  else if (kind === 'setpiece') s.removeSetPiece(id)
  else if (kind === 'stagepart') {
    const parts = resolveStageParts(s.productionPlan.venueLayout ?? DEFAULT_VENUE_LAYOUT)
    s.updateStageParts(parts.filter(part => part.id !== id))
    s.select(null, null)
  } else if (kind === 'audience') {
    s.removeAudienceBlock(id)
    s.select(null, null)
  }
}

// ---- 足す（ヒエラルキーの「＋ 追加」）----

export const SET_PIECE_TYPES = [
  { id: 'box', label: '箱馬' }, { id: 'platform', label: '平台' }, { id: 'riser', label: '高台' },
  { id: 'bench', label: 'ベンチ' }, { id: 'door', label: '扉' }, { id: 'suitcase', label: '鞄' },
  { id: 'table', label: '机' }, { id: 'bookshelf', label: '書架' }, { id: 'window', label: '窓' },
] as const
export type SetPieceType = typeof SET_PIECE_TYPES[number]['id']

const APPEARANCES: Record<string, { name: string; size: [number, number, number]; color: string }> = {
  bench: { name: 'ベンチ', size: [2.8, 0.9, 0.85], color: '#765c48' },
  door: { name: '扉', size: [1.45, 2.2, 0.22], color: '#555767' },
  suitcase: { name: '鞄', size: [0.72, 0.48, 0.4], color: '#a86d48' },
  table: { name: '机', size: [2.2, 0.8, 1.1], color: '#75523c' },
  bookshelf: { name: '書架', size: [2.3, 2.7, 0.5], color: '#4c3a35' },
  window: { name: '窓', size: [2.5, 2.8, 0.16], color: '#5c6774' },
}

export function addSetPiece(type: SetPieceType) {
  const s = useStore.getState()
  if (type === 'box' || type === 'platform' || type === 'riser') return s.addPrimitiveSetPiece(type)
  const preset = APPEARANCES[type]
  const id = s.addPrimitiveSetPiece('box')
  const position = useStore.getState().setPieces.find(piece => piece.id === id)?.position
  if (id && position) useStore.getState().updateSetPiece(id, {
    ...preset, appearance: type, position: [position[0], preset.size[1] / 2, position[2]],
  })
  return id
}

export function addStagePart(kind: StagePartKind) {
  const s = useStore.getState()
  const layout = s.productionPlan.venueLayout ?? DEFAULT_VENUE_LAYOUT
  const parts = resolveStageParts(layout)
  if (parts.length >= 80) return null
  const id = `part-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`
  s.updateStageParts([...parts, clampPart(newPart(kind, layout, id), layout.stageOffset ?? [0, 0])])
  s.select('stagepart', id)
  return id
}
