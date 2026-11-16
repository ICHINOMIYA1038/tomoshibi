// ゲル（色フィルター）の色見本。メーカーの品番は使わず、劇場でよく使う色を名前で並べる。
// 値は「白い光を通したときの色」の目安（#rrggbb）。在来の照明では電球の色に掛け算で効く。

export type GelGroup = '補正' | '暖色' | '寒色' | 'そのほか'
export type Gel = { id: string; name: string; hex: string; group: GelGroup; note?: string }

export const GELS: Gel[] = [
  { id: 'cto-quarter', name: '色温度を下げる 1/4', hex: '#ffe6c8', group: '補正', note: '少し暖かく' },
  { id: 'cto-half', name: '色温度を下げる 1/2', hex: '#ffd2a0', group: '補正' },
  { id: 'cto-full', name: '色温度を下げる', hex: '#ffb36b', group: '補正', note: '昼光を電球の色に' },
  { id: 'ctb-quarter', name: '色温度を上げる 1/4', hex: '#dfe9ff', group: '補正', note: '少し白く' },
  { id: 'ctb-half', name: '色温度を上げる 1/2', hex: '#c3d6ff', group: '補正' },
  { id: 'ctb-full', name: '色温度を上げる', hex: '#9cbcff', group: '補正', note: '電球を昼光の色に' },
  { id: 'pale-gold', name: 'ペールゴールド', hex: '#ffe9b8', group: '暖色' },
  { id: 'light-amber', name: 'ライトアンバー', hex: '#ffd08a', group: '暖色' },
  { id: 'amber', name: 'アンバー', hex: '#ffb050', group: '暖色', note: '夕日' },
  { id: 'orange', name: 'オレンジ', hex: '#ff8a2a', group: '暖色' },
  { id: 'light-pink', name: 'ライトピンク', hex: '#ffc4cf', group: '暖色', note: '肌をきれいに' },
  { id: 'rose', name: 'ローズピンク', hex: '#ff7fa6', group: '暖色' },
  { id: 'magenta', name: 'マゼンタ', hex: '#e0308c', group: '暖色' },
  { id: 'red', name: 'レッド', hex: '#e01a1a', group: '暖色' },
  { id: 'pale-blue', name: 'ペールブルー', hex: '#d4e6ff', group: '寒色' },
  { id: 'sky-blue', name: 'スカイブルー', hex: '#7fc0ff', group: '寒色' },
  { id: 'steel-blue', name: 'スチールブルー', hex: '#8faecd', group: '寒色', note: '月明かり' },
  { id: 'night-blue', name: 'ナイトブルー', hex: '#3a5cc8', group: '寒色', note: '夜' },
  { id: 'deep-blue', name: 'ディープブルー', hex: '#1f3aa8', group: '寒色' },
  { id: 'turquoise', name: 'ターコイズ', hex: '#3fd0c8', group: '寒色' },
  { id: 'lavender', name: 'ラベンダー', hex: '#b9a3ff', group: 'そのほか' },
  { id: 'purple', name: 'パープル', hex: '#8048d8', group: 'そのほか' },
  { id: 'light-green', name: 'ライトグリーン', hex: '#b8f0a0', group: 'そのほか' },
  { id: 'green', name: 'グリーン', hex: '#34c05a', group: 'そのほか' },
]
export const GEL_GROUPS: GelGroup[] = ['補正', '暖色', '寒色', 'そのほか']

export function gelByHex(hex: string) {
  return GELS.find(gel => gel.hex.toLowerCase() === hex.toLowerCase()) ?? null
}
