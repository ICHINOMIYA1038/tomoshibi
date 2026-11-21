import { useEffect } from 'react'
import { useStore } from '../store'

/**
 * 「この器具の光だけ見る」のあいだだけ出す帯。入れたことを忘れて「照明が壊れた」と思わないように、
 * 何を見ているかと、ほかの器具は一時的に暗くしているだけであることを書く（2026-11-21 オーナー）
 */
export function HighlightBar({ hidden }: { hidden: boolean }) {
  const id = useStore(s => s.highlightFixtureId)
  const fixture = useStore(s => s.fixtures.find(item => item.id === s.highlightFixtureId))
  const setHighlight = useStore(s => s.setHighlight)
  // 通しで見るに入ったら、見え方を元に戻す。器具を消したときも同じ
  useEffect(() => { if (id && (hidden || !fixture)) setHighlight(null) }, [id, hidden, fixture, setHighlight])
  useEffect(() => {
    if (!id) return
    const onKey = (event: KeyboardEvent) => { if (event.key === 'Escape') setHighlight(null) }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [id, setHighlight])
  if (!id || !fixture || hidden) return null
  return <div className="highlight-bar" role="status">
    <span><b>{fixture.name}</b> の光だけを表示中<span className="highlight-bar-note">（ほかの照明は一時的に暗くしています。設定は変わりません）</span></span>
    <button type="button" onClick={() => setHighlight(null)}>元に戻す</button>
  </div>
}
