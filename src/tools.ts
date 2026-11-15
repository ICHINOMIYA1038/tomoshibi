import type { SelectionKind } from './store'

// 3D と平面図で共通の道具（Unity の Q/W/E/R）。選んだ物によって使えない道具は、移動として扱う
export type Tool = 'select' | 'translate' | 'rotate' | 'scale'

export const TOOLS: Array<{ id: Tool; label: string; key: string }> = [
  { id: 'select', label: '選択', key: 'Q' },
  { id: 'translate', label: '移動', key: 'W' },
  { id: 'rotate', label: '回転', key: 'E' },
  { id: 'scale', label: '拡大', key: 'R' },
]

/** 選んだ物で使える道具。照明の回転は狙いの向き、客席の大きさは列数・席数で変える */
export function toolsFor(kind: SelectionKind, fixtureHandle?: 'position' | 'target'): Tool[] {
  if (kind === 'fixture') return fixtureHandle === 'target' ? ['select', 'translate'] : ['select', 'translate', 'rotate']
  if (kind === 'performer') return ['select', 'translate']
  if (kind === 'stage') return ['select', 'translate', 'scale']
  if (kind === 'audience') return ['select', 'translate', 'rotate']
  return ['select', 'translate', 'rotate', 'scale']
}

/** いまの道具を、選んだ物で実際に使う道具にする */
export function toolFor(tool: Tool, kind: SelectionKind, fixtureHandle?: 'position' | 'target'): Tool {
  return toolsFor(kind, fixtureHandle).includes(tool) ? tool : 'translate'
}
