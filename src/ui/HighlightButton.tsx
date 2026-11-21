import { useStore } from '../store'

/**
 * 選んだ照明の「この器具の光だけ見る」の入・切。照明を選んでいるときだけ、固定のボタンの隣に出す
 * （右の設定の欄の上と、スマホの選んだ物の札）。いつも出すボタンにはしない（2026-11-21 オーナー「メニューが多すぎても」）
 */
export function HighlightButton({ className = '', short = false }: { className?: string; short?: boolean }) {
  const selection = useStore(state => state.selection)
  const on = useStore(state => !!state.highlightFixtureId && state.highlightFixtureId === state.selection.id)
  const setHighlight = useStore(state => state.setHighlight)
  if (selection.kind !== 'fixture' || !selection.id) return null
  const label = on ? (short ? '光だけ中' : '光だけ表示中') : (short ? '光だけ' : 'この光だけ見る')
  return <button type="button" className={'lock-button highlight-button' + (on ? ' on' : '') + (className ? ' ' + className : '')}
    aria-pressed={on} title={on ? 'この照明の光だけを表示中。押すと元の見え方に戻ります' : 'ほかの照明を一時的に暗くして、この照明の光だけを見ます（設定は変わりません）'}
    onClick={() => setHighlight(on ? null : selection.id)}>
    <svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <rect x="5.5" y="1.5" width="5" height="3.5" rx="0.6" />
      <path d="M6 5 2.5 14.5h11L10 5" fill={on ? 'currentColor' : 'none'} fillOpacity={on ? 0.35 : 0} />
    </svg>
    {label}
  </button>
}
