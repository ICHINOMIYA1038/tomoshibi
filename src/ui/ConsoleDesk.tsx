import { useMemo, useState } from 'react'
import { sceneDisplayTitle, SCENE_TRIGGER_LABELS, useStore, type Fixture, type PlanScene } from '../store'

// 卓（試作）。調光卓のように、照明のレベルをフェーダーとキュー表で組む（2026-11-19 オーナー「卓みたいな機能を試作で」）。
// 場面＝キュー、照明＝チャンネル。レベルは 0〜100（100 が intensity 1.5、平面図の「明るさ」と同じ）。0 は消灯。
// 本物の卓へ信号は送らない。キュー表は印刷して照明さんに渡せる形で開く
// 印刷用の HTML の閉じタグは文字列を分けて書く（ビルドでアプリを HTML に埋め込むとき、body の閉じタグがあると壊れる）

const DEFAULT_FADE = 1.2
/** 閉じタグを実行時に組み立てる。そのまま書くと、ビルドでアプリを HTML に埋め込むときに壊れる */
const endTag = (name: string) => ['<', '/', name, '>'].join('')

const levelOf = (fixture: Fixture | undefined): number | null =>
  !fixture ? null : fixture.enabled && fixture.intensity > 0 ? Math.round(fixture.intensity / 1.5 * 100) : 0

const channelOf = (fixture: Fixture, index: number) => (typeof fixture.number === 'string' && fixture.number.trim()) || String(index + 1)

const rgbHex = (color: [number, number, number]) => '#' + color.map(v => Math.round(Math.max(0, Math.min(1, v)) * 255).toString(16).padStart(2, '0')).join('')

export function ConsoleDesk({ onClose }: { onClose: () => void }) {
  const plan = useStore(s => s.productionPlan)
  const liveFixtures = useStore(s => s.fixtures)
  const selectScene = useStore(s => s.selectScene)
  const setLevel = useStore(s => s.setSceneFixtureLevel)
  const setFade = useStore(s => s.setSceneFade)
  const select = useStore(s => s.select)
  const [tab, setTab] = useState<'faders' | 'cues'>('faders')
  const activeId = plan.activeSceneId
  const scenes = plan.scenes
  const activeIndex = scenes.findIndex(scene => scene.id === activeId)
  const active = scenes[activeIndex]
  // チャンネルの並びは、いまの場面の照明の並び（器具表と同じ番号）
  const channels = useMemo(() => liveFixtures.map((fixture, index) => ({ id: fixture.id, ch: channelOf(fixture, index), name: fixture.name })), [liveFixtures])
  // いまの場面は画面の照明、ほかの場面は場面に残した照明を読む
  const fixturesOf = (scene: PlanScene) => scene.id === activeId ? liveFixtures : scene.fixtures

  const go = (offset: number) => {
    const next = scenes[activeIndex + offset]
    if (next) selectScene(next.id)
  }

  const printSheet = () => {
    const title = plan.projectTitle || plan.title || '舞台プラン'
    const esc = (text: string) => text.replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c] as string))
    const head = channels.map(c => `<th title="${esc(c.name)}">${esc(c.ch)}</th>`).join('')
    let previous: (number | null)[] = []
    const rows = scenes.map((scene, index) => {
      const fixtures = fixturesOf(scene)
      const levels = channels.map(c => levelOf(fixtures.find(f => f.id === c.id)))
      const cells = levels.map((level, i) => {
        const changed = index > 0 && level !== previous[i]
        return `<td class="${changed ? 'chg' : ''}">${level === null ? '' : level === 0 ? '·' : level}</td>`
      }).join('')
      previous = levels
      const trigger = scene.trigger ? `${scene.triggerType ? SCENE_TRIGGER_LABELS[scene.triggerType] + '：' : ''}${scene.trigger}` : ''
      return `<tr><th>Q${index + 1}</th><td class="name">${esc(sceneDisplayTitle(plan, scene.id))}</td><td class="name">${esc(trigger)}</td><td>${scene.fadeSec ?? DEFAULT_FADE}</td>${cells}</tr>`
    }).join('')
    const key = channels.map(c => `<li><b>${esc(c.ch)}</b> ${esc(c.name)}</li>`).join('')
    const win = window.open('', '_blank')
    if (!win) return
    win.document.write(`<!doctype html><html lang="ja"><head><meta charset="utf-8"><title>${esc(title)} キュー表</title><style>
      body{font:12px/1.5 "Hiragino Sans","Noto Sans JP",sans-serif;color:#161616;margin:16px}
      h1{font-size:18px;margin:0 0 4px}
      table{border-collapse:collapse;width:100%}th,td{border:1px solid #999;padding:3px 4px;text-align:center;font-variant-numeric:tabular-nums}
      thead th{background:#eee}td.name{text-align:left;white-space:nowrap}td.chg{background:#fff1a8;font-weight:700}
      ul{columns:3;padding-left:16px;margin:12px 0 0}li{break-inside:avoid}
      @page{size:A4 landscape;margin:10mm}
    </style></head><body><h1>${esc(title)}　キュー表</h1>
    <table><thead><tr><th>Q</th><th>場面</th><th>きっかけ</th><th>フェード</th>${head}</tr></thead><tbody>${rows}</tbody></table>
    <ul>${key}</ul>${endTag('body')}${endTag('html')}`)
    win.document.close()
    win.focus()
    win.print()
    return
  }

  return <section className="console-desk" role="dialog" aria-label="卓（試作）">
    <header className="console-desk-head">
      <strong>卓</strong><span className="console-desk-badge">試作</span>
      <div className="console-desk-tabs" role="tablist">
        <button type="button" role="tab" aria-selected={tab === 'faders'} onClick={() => setTab('faders')}>フェーダー</button>
        <button type="button" role="tab" aria-selected={tab === 'cues'} onClick={() => setTab('cues')}>キュー表</button>
      </div>
      <div className="console-desk-scene">
        <button type="button" aria-label="前の場面" disabled={activeIndex <= 0} onClick={() => go(-1)}>‹</button>
        <span>Q{activeIndex + 1}　{active ? sceneDisplayTitle(plan, active.id) : '場面がありません'}</span>
        <button type="button" aria-label="次の場面" disabled={activeIndex < 0 || activeIndex >= scenes.length - 1} onClick={() => go(1)}>›</button>
      </div>
      {active && <label className="console-desk-fade">この場面へのフェード
        <input type="number" min={0} max={60} step={0.5} value={active.fadeSec ?? DEFAULT_FADE}
          onChange={event => setFade(active.id, event.target.value === '' ? undefined : Number(event.target.value))} />秒</label>}
      <button type="button" className="console-desk-print" onClick={printSheet}>キュー表を印刷</button>
      <button type="button" className="console-desk-close" aria-label="卓を閉じる" onClick={onClose}>×</button>
    </header>

    {tab === 'faders' && <div className="console-faders">
      {liveFixtures.length === 0 && <p className="console-empty">照明がありません。右の「＋ 追加」から照明を吊ってください。</p>}
      {liveFixtures.map((fixture, index) => {
        const level = levelOf(fixture) ?? 0
        return <div key={fixture.id} className={'console-strip' + (level > 0 ? ' on' : '')}>
          <span className="console-level">{level}</span>
          <input type="range" min={0} max={100} step={1} value={level} aria-label={`${channelOf(fixture, index)} ${fixture.name} のレベル`}
            onChange={event => activeId && setLevel(activeId, fixture.id, Number(event.target.value))} />
          <span className="console-color" style={{ background: rgbHex(fixture.color) }} aria-hidden="true" />
          <button type="button" className="console-ch" title={`${fixture.name}を選ぶ`} onClick={() => select('fixture', fixture.id, 'position')}>{channelOf(fixture, index)}</button>
          <span className="console-name" title={fixture.name}>{fixture.name}</span>
          <div className="console-quick">
            <button type="button" onClick={() => activeId && setLevel(activeId, fixture.id, level > 0 ? 0 : 100)}>{level > 0 ? '消' : 'FL'}</button>
          </div>
        </div>
      })}
    </div>}

    {tab === 'cues' && <div className="console-cues">
      <table>
        <thead><tr><th>Q</th><th className="name">場面</th><th>フェード</th>{channels.map(c => <th key={c.id} title={c.name}>{c.ch}</th>)}</tr></thead>
        <tbody>
          {scenes.map((scene, index) => {
            const fixtures = fixturesOf(scene)
            const before = index > 0 ? fixturesOf(scenes[index - 1]) : null
            return <tr key={scene.id} className={scene.id === activeId ? 'active' : ''}>
              <th><button type="button" onClick={() => selectScene(scene.id)}>Q{index + 1}</button></th>
              <td className="name"><button type="button" onClick={() => selectScene(scene.id)}>{sceneDisplayTitle(plan, scene.id)}</button></td>
              <td><input type="number" min={0} max={60} step={0.5} value={scene.fadeSec ?? DEFAULT_FADE} aria-label={`Q${index + 1} のフェード（秒）`}
                onChange={event => setFade(scene.id, event.target.value === '' ? undefined : Number(event.target.value))} /></td>
              {channels.map(c => {
                const level = levelOf(fixtures.find(f => f.id === c.id))
                const prev = before ? levelOf(before.find(f => f.id === c.id)) : level
                return <td key={c.id} className={(level !== prev ? 'chg' : '') + (level ? ' on' : '')}>
                  {level === null ? '' : <input type="number" min={0} max={100} step={5} value={level} aria-label={`Q${index + 1} ${c.ch} ${c.name} のレベル`}
                    onChange={event => setLevel(scene.id, c.id, Number(event.target.value))} />}
                </td>
              })}
            </tr>
          })}
        </tbody>
      </table>
    </div>}
  </section>
}
