// 物が「全シーン共通」か「このシーンだけ」か。平面図・3D の一覧・設定の欄・スマホの札で同じ言葉を使う（2026-11-17 オーナーと決めた案 1）
// 照明と役者は、物そのものは全シーンにあり、明るさや立ち位置だけがシーンごと

export type ScopeKind = 'shared' | 'scene' | 'mixed'

export function scopeOf(kind: string | null): { kind: ScopeKind; short: string; detail: string } | null {
  if (kind === 'fixture') return { kind: 'mixed', short: '吊る位置は共通', detail: '吊る位置・機種・名前は全シーン共通。明るさ・色・狙いは、このシーンだけ' }
  if (kind === 'performer') return { kind: 'mixed', short: '立ち位置はこのシーン', detail: '名前・身長・服の色は全シーン共通。立ち位置・ポーズ・出番は、このシーンだけ' }
  if (kind === 'setpiece') return { kind: 'scene', short: 'このシーンだけ', detail: 'このシーンだけにある物です。ほかのシーンには出ません' }
  if (kind === 'stagepart' || kind === 'stage' || kind === 'audience') return { kind: 'shared', short: '全シーン共通', detail: '全シーン共通の物です。動かすと、すべてのシーンで変わります' }
  return null
}
