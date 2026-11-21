import { useEffect, useMemo } from 'react'
import { useStore } from '../store'
import { lightsAtPoint } from '../lighting/lightAtPoint'
import { resolveFixture } from '../lighting/movingHead'

/**
 * 「この点に当たっている照明」の一覧。右クリック（スマホは長押し）のメニューから開く。
 * 届いている照明を明るい順に、割合の帯で並べる。押すと、その照明の光だけを見る（highlight.ts）
 */
export function LightAtPointPanel({ hidden }: { hidden: boolean }) {
  const probe = useStore(s => s.lightProbe)
  const setProbe = useStore(s => s.setLightProbe)
  const stored = useStore(s => s.fixtures)
  const performers = useStore(s => s.performers)
  const highlightId = useStore(s => s.highlightFixtureId)
  const rows = useMemo(() => probe ? lightsAtPoint(probe.point, stored.map(f => resolveFixture(f, performers))) : [], [probe, stored, performers])
  useEffect(() => { if (probe && hidden) setProbe(null) }, [probe, hidden, setProbe])
  useEffect(() => {
    if (!probe) return
    const onKey = (event: KeyboardEvent) => { if (event.key === 'Escape') setProbe(null) }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [probe, setProbe])
  if (!probe || hidden) return null
  const reaching = rows.filter(row => !row.blocked)
  const total = reaching.reduce((sum, row) => sum + row.lux, 0)
  const shown = reaching.filter(row => row.lux >= total * 0.01)
  const blocked = rows.filter(row => row.blocked && row.lux >= total * 0.02)
  const pick = (id: string) => {
    const s = useStore.getState()
    s.select('fixture', id)
    s.setHighlight(id)
  }
  const left = Math.max(12, Math.min(probe.x, window.innerWidth - 332))
  const top = Math.max(70, Math.min(probe.y, window.innerHeight - 380))
  return <div className="light-at-point" role="dialog" aria-label="この点に当たっている照明" style={{ left, top }}>
    <header>
      <strong>この点に当たっている照明</strong>
      <button type="button" aria-label="閉じる" onClick={() => setProbe(null)}>×</button>
    </header>
    {shown.length === 0
      ? <p className="light-at-point-empty">この点には、点いている照明の光が届いていません。</p>
      : <ul>{shown.map(row => {
        const share = total > 0 ? row.lux / total : 0
        return <li key={row.id}>
          <button type="button" className={highlightId === row.id ? 'on' : ''} onClick={() => pick(row.id)}
            title="押すと、この照明の光だけを見ます">
            <span className="name">{row.name}</span>
            <span className="share" aria-hidden="true"><span style={{ width: `${Math.max(2, share * 100)}%` }} /></span>
            <span className="pct">{Math.round(share * 100)}%</span>
          </button>
        </li>
      })}</ul>}
    {blocked.length > 0 && <>
      <p className="light-at-point-sub">さえぎられて届いていない照明</p>
      <ul className="blocked">{blocked.map(row => <li key={row.id}>
        <button type="button" onClick={() => pick(row.id)} title="押すと、この照明の光だけを見ます"><span className="name">{row.name}</span></button>
      </li>)}</ul>
    </>}
    <p className="light-at-point-note">押すと、その照明の光だけを見ます。割合は直接届く光で、跳ね返りの光は含みません。</p>
  </div>
}
