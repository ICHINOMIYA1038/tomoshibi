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
