import { useState, type DragEvent, type ReactNode } from 'react'
import { FIXTURE_PRESETS_BY_KIND, FIXTURE_PROFILES, KIND_LABELS, type FixtureKind } from '../lighting/fixtureTypes'
import { ADD_DRAG_TYPE, addItem, SET_PIECE_TYPES, type AddItem, type SetPieceType } from '../objectActions'
import { PART_LABELS, type StagePartKind } from '../stageParts'

// ヒエラルキーの「＋ 追加」で開く一覧。絵の付いた札を押すと既定の位置に、3D の画面へドラッグすると落とした所に置く

const FIXTURE_TILES: Array<{ kind: FixtureKind; label: string; preset?: string }> = [
  { kind: 'Fresnel', label: 'フレネル', preset: 'Fresnel8' },
  { kind: 'PC', label: '平凸' },
  { kind: 'Profile', label: 'エリスポ', preset: 'Source4_26' },
  { kind: 'PAR', label: 'パーライト', preset: 'PAR64_MFL' },
  { kind: 'LED_PAR', label: 'LED パーライト' },
  { kind: 'LED_Wash', label: 'LED ウォッシュ' },
  { kind: 'LED_Profile', label: 'LED エリスポ' },
  { kind: 'LED_Bar', label: 'LED バー' },
  { kind: 'MovingHead', label: 'ムービング' },
  { kind: 'FollowSpot', label: 'ピンスポット' },
]
// 舞台の平台は、舞台セットの「平台」と紛らわしいので出さない（以前の追加の一覧と同じ）
const STAGE_PART_KINDS: StagePartKind[] = ['floor', 'wall', 'cyc', 'batten', 'wing']

/** 札の絵。24×24 の線画 */
function Glyph({ name }: { name: string }) {
  const line = { fill: 'none', stroke: 'currentColor', strokeWidth: 1.6, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const }
  const shapes: Record<string, ReactNode> = {
    lamp: <><path {...line} d="M6 5h7l3 5-3 5H6Z" /><path {...line} d="M16 10h1m2-4 2-1m-2 9 2 1M9 15v4m-3 0h6" /></>,
    pin: <><path {...line} d="M3 9l11-3v8L3 11Z" /><path {...line} d="M14 8l7-2m-7 6 7 2M8 12v7m-3 0h6" /></>,
    bar: <><rect {...line} x="3" y="9" width="18" height="5" rx="1" /><circle cx="7" cy="11.5" r="1" fill="currentColor" /><circle cx="12" cy="11.5" r="1" fill="currentColor" /><circle cx="17" cy="11.5" r="1" fill="currentColor" /></>,
    moving: <><path {...line} d="M6 20h12M9 20l1-5h4l1 5" /><path {...line} d="M7 6a5 5 0 0 1 10 0v4a5 5 0 0 1-10 0Z" /><circle {...line} cx="12" cy="8" r="2" /></>,
    performer: <><circle cx="12" cy="6.5" r="3" fill="currentColor" /><path d="M5.5 21c.6-5 3-7.5 6.5-7.5s5.9 2.5 6.5 7.5Z" fill="currentColor" /></>,
    box: <path {...line} d="m12 4 7 3.5v8L12 19l-7-3.5v-8Zm0 7 7-3.5M12 11 5 7.5m7 3.5v8" />,
    platform: <path {...line} d="M3 12 9 9h12l-6 3Zm0 0v3h12v-3m6-3v3l-6 3" />,
    riser: <path {...line} d="M3 10 9 7h12l-6 3Zm0 0v7h12v-7m6-3v7l-6 3" />,
    bench: <path {...line} d="M3 11h18M4 11v6m16-6v6M3 8h18" />,
    door: <><rect {...line} x="7" y="3" width="10" height="18" rx="1" /><circle cx="14.5" cy="12" r="1" fill="currentColor" /></>,
    suitcase: <><rect {...line} x="4" y="8" width="16" height="11" rx="2" /><path {...line} d="M9 8V5h6v3" /></>,
    table: <path {...line} d="M3 9h18M6 9v10m12-10v10M3 9l2-3h14l2 3" />,
    bookshelf: <path {...line} d="M5 3h14v18H5Zm0 6h14M5 15h14M8 4v4m3-4v4m0 2v4m3-4v4" />,
    window: <path {...line} d="M5 4h14v16H5Zm7 0v16M5 12h14" />,
    floor: <path {...line} d="M3 15 8 9h13l-5 6Z" strokeDasharray="3 2" />,
    wall: <path {...line} d="M6 4h12v16H6Zm0 5h12M6 14h12M10 4v5m4 0v5m-4 0v6" />,
    cyc: <path {...line} d="M4 20V9c0-3 3-5 8-5s8 2 8 5v11" />,
    batten: <path {...line} d="M3 6h18M6 6v2m6-2v2m6-2v2M6 10l-1 3m7-3v3m6-3 1 3" />,
    wing: <path {...line} d="M6 3v18m0-18c2 3 0 6 2 9s0 6-2 9m12-18v18m0-18c-2 3 0 6-2 9s0 6 2 9" />,
    smoke: <><rect {...line} x="3" y="14" width="8" height="5" rx="1" /><path {...line} d="M11 16h2m1-2a2.5 2.5 0 0 1 3-3 3 3 0 0 1 5 2 2.5 2.5 0 0 1-2 4h-5" /></>,
    dryice: <path {...line} d="M3 18c2-2 4-2 6 0s4 2 6 0 4-2 6 0M5 14c1.5-1.5 3-1.5 4.5 0s3 1.5 4.5 0 3-1.5 4.5 0M9 9h6v3H9Z" />,
    audience: <path d="M4 6h4v4H4Zm6 0h4v4h-4Zm6 0h4v4h-4ZM4 13h4v4H4Zm6 0h4v4h-4Zm6 0h4v4h-4Z" fill="currentColor" />,
  }
  return <svg viewBox="0 0 24 24" width="24" height="24" aria-hidden="true">{shapes[name]}</svg>
}

function Tile({ item, glyph, label, title }: { item: AddItem; glyph: string; label: string; title?: string }) {
  const [dragging, setDragging] = useState(false)
  const start = (event: DragEvent) => {
    event.dataTransfer.setData(ADD_DRAG_TYPE, JSON.stringify(item))
    event.dataTransfer.effectAllowed = 'copy'
    setDragging(true)
  }
  return <button type="button" className={'add-tile' + (dragging ? ' dragging' : '')} draggable title={title ?? `${label}を足す（3D の画面へドラッグすると、落とした所に置きます）`}
    onDragStart={start} onDragEnd={() => setDragging(false)} onClick={() => addItem(item)}>
    <Glyph name={glyph} />
    <span>{label}</span>
  </button>
}

/** 舞台セットの一覧とは分けて「効果」に並べるもの */
const EFFECT_TYPES = new Set<SetPieceType>(['smoke', 'dryice'])

const SET_PIECE_GLYPH: Record<SetPieceType, string> = {
  box: 'box', platform: 'platform', riser: 'riser', bench: 'bench', door: 'door',
  suitcase: 'suitcase', table: 'table', bookshelf: 'bookshelf', window: 'window', smoke: 'smoke', dryice: 'dryice',
}

export function AddPalette() {
  const [preset, setPreset] = useState('Fresnel8')
  const presetOf = (tile: typeof FIXTURE_TILES[number]) => tile.preset ?? FIXTURE_PRESETS_BY_KIND[tile.kind][0]
  return <div className="add-palette">
    <p className="add-palette-hint">押すと舞台の中央に置きます。3D の画面へドラッグすると、落とした所に置きます。照明はバトンに重ねて落とすと、そのバトンに吊ります。</p>
    <section aria-label="照明">
      <h3>照明</h3>
      <div className="add-tiles">
        {FIXTURE_TILES.filter(tile => FIXTURE_PRESETS_BY_KIND[tile.kind]?.length).map(tile => <Tile key={tile.kind}
          item={{ kind: 'fixture', preset: presetOf(tile) }} label={tile.label}
          glyph={tile.kind === 'LED_Bar' ? 'bar' : tile.kind === 'MovingHead' ? 'moving' : tile.kind === 'FollowSpot' ? 'pin' : 'lamp'} />)}
      </div>
      <div className="add-palette-model">
        <select value={preset} onChange={event => setPreset(event.target.value)} aria-label="照明の機種">
          {(Object.keys(KIND_LABELS) as FixtureKind[]).map(kind => <optgroup key={kind} label={KIND_LABELS[kind]}>
            {FIXTURE_PRESETS_BY_KIND[kind].map(key => {
              const profile = FIXTURE_PROFILES[key]
              return <option key={key} value={key}>{profile.brand ? `${profile.brand} — ${profile.model || key}` : (profile.model || key)}</option>
            })}
          </optgroup>)}
        </select>
        <Tile item={{ kind: 'fixture', preset }} glyph="lamp" label="この機種" title="選んだ機種を足す（3D の画面へドラッグすると、落とした所に置きます）" />
      </div>
    </section>
    <section aria-label="役者・客席">
      <h3>役者・客席</h3>
      <div className="add-tiles">
        <Tile item={{ kind: 'performer' }} glyph="performer" label="役者" />
        <Tile item={{ kind: 'audience' }} glyph="audience" label="客席" />
      </div>
    </section>
    <section aria-label="舞台セット">
      <h3>舞台セット</h3>
      <div className="add-tiles">
        {SET_PIECE_TYPES.filter(item => !EFFECT_TYPES.has(item.id)).map(item => <Tile key={item.id} item={{ kind: 'setpiece', type: item.id }} glyph={SET_PIECE_GLYPH[item.id]} label={item.label} />)}
      </div>
    </section>
    <section aria-label="効果">
      <h3>効果</h3>
      <div className="add-tiles">
        {SET_PIECE_TYPES.filter(item => EFFECT_TYPES.has(item.id)).map(item => <Tile key={item.id} item={{ kind: 'setpiece', type: item.id }} glyph={SET_PIECE_GLYPH[item.id]} label={item.label} />)}
      </div>
    </section>
    <section aria-label="舞台の部品">
      <h3>舞台の部品</h3>
      <div className="add-tiles">
        {STAGE_PART_KINDS.map(kind => <Tile key={kind} item={{ kind: 'stagepart', part: kind }} glyph={kind} label={PART_LABELS[kind]} />)}
      </div>
    </section>
  </div>
}
