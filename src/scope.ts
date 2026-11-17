// 物が「全シーン共通」か「このシーンだけ」か。平面図・3D の一覧・設定の欄・スマホの札で同じ言葉を使う（2026-11-17 オーナーと決めた案 1）
// 照明と役者は、物そのものは全シーンにある。それ以外はシーンごとで、変えた直後にほかのシーンへも反映できる（ChangeScopeBar）

export type ScopeKind = 'shared' | 'scene' | 'mixed'

export function scopeOf(kind: string | null): { kind: ScopeKind; short: string; detail: string } | null {
  if (kind === 'fixture') return { kind: 'mixed', short: '吊る位置は共通', detail: '吊る位置・機種・名前は全シーン共通です。明るさ・色・狙いはシーンごとで、変えたあとにほかのシーンにも反映できます' }
  if (kind === 'performer') return { kind: 'mixed', short: '名前は共通', detail: '名前は全シーン共通です。服の色・立ち位置・ポーズなどはシーンごとで、変えたあとにほかのシーンにも反映できます' }
  if (kind === 'setpiece') return { kind: 'scene', short: 'シーンごと', detail: '舞台セットはシーンごとです。足す・動かす・消すのあとに、ほかのシーンにも反映できます' }
  if (kind === 'stagepart' || kind === 'stage' || kind === 'audience') return { kind: 'shared', short: '全シーン共通', detail: '全シーン共通の物です。動かすと、すべてのシーンで変わります' }
  return null
}
