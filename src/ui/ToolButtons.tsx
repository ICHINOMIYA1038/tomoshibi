import { useStore } from '../store'
import { TOOLS, toolFor, toolsFor } from '../tools'

/**
 * 選択・移動・回転・拡大の切り替え（Unity の Q/W/E/R）。3D の画面と平面図で同じ道具を使う。
 * 選んだ物で使えない道具は押せない。何も選んでいないときは、どれでも選んでおける
 */
export function ToolButtons({ compact = false }: { compact?: boolean }) {
  const tool = useStore(s => s.settings.transformMode)
  const kind = useStore(s => s.selection.kind)
  const handle = useStore(s => s.selection.fixtureHandle)
  const update = useStore(s => s.updateSettings)
  const usable = kind ? toolsFor(kind, handle) : TOOLS.map(item => item.id)
  const current = kind && tool !== 'select' ? toolFor(tool, kind, handle) : tool
  return <div className={"tool-buttons" + (compact ? " compact" : "")} role="group" aria-label="道具">
    {TOOLS.map(item => <button key={item.id} type="button" className={current === item.id ? 'active' : ''}
      aria-pressed={current === item.id} disabled={!usable.includes(item.id)}
      title={`${item.label}（${item.key}）`} onClick={() => update({ transformMode: item.id })}>{item.label}</button>)}
  </div>
}

/**
 * 照明を選んでいるときだけ出す、3D でつかむ点の切り替え（照明の本体か、狙う先か）。
 * 3D の画面でも、本体の青い球・狙いの黄色い球を押して切り替えられる
 */
export function FixtureHandleButtons() {
  const selection = useStore(s => s.selection)
  const select = useStore(s => s.select)
  if (selection.kind !== 'fixture' || !selection.id) return null
  const handle = selection.fixtureHandle ?? 'position'
  const id = selection.id
  return <>
    <span className="toolbar-divider" aria-hidden="true" />
    <span className="toolbar-label">つかむ</span>
    <div className="tool-buttons" role="group" aria-label="3D でつかむ点">
      {([['position', '照明', '照明の本体を動かす・回す'], ['target', '狙い', '光が当たる点を動かす']] as const).map(([value, label, title]) =>
        <button key={value} type="button" className={handle === value ? 'active' : ''} aria-pressed={handle === value}
          title={title} onClick={() => select('fixture', id, value)}>{label}</button>)}
    </div>
  </>
}
