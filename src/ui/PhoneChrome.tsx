import { useEffect, useMemo, useState } from 'react'
import { addablePresets, FIXTURE_DISCLAIMER, FIXTURE_PROFILES } from '../lighting/fixtureTypes'
import { addItem, deleteSelection, SET_PIECE_TYPES, type AddItem } from '../objectActions'
import { PART_LABELS } from '../stageParts'
import { sceneDisplayTitle, useStore } from '../store'
import { accountUrl, loginUrl } from '../io/cloud'
import { useCloudSession } from '../io/cloudSession'
import { redoMockWorkspace, undoMockWorkspace, useMockWorkspaceState } from '../io/mockWorkspace'
import { EFFECT_TYPES, FIXTURE_GLYPH, FIXTURE_TILES, Glyph, SET_PIECE_GLYPH, STAGE_PART_KINDS } from './AddPalette'
import { Inspector } from './Inspector'
import { scopeOf } from '../scope'
import { ChangeScopeBar } from './ChangeScopeBar'

// スマホ（幅 600px 以下）の編集画面。PC の道具の列・ヒエラルキー・インスペクターは出さず、
// 舞台をいつも見せたまま、追加・シーン・設定を下からのシートで出す（2026-11-17 オーナーと決めた案 A）

type Sheet = null | 'add' | 'scenes' | 'inspector' | 'menu'
type Toast = { label: string; kind: string; id: string }
type AddTab = 'light' | 'cast' | 'set'

const KIND_LABELS: Record<string, string> = { fixture: '照明', performer: '役者', setpiece: '舞台セット', stagepart: '舞台の部品', stage: '舞台の床', audience: '客席' }

export function PhoneChrome({ title, view, onView, onBack, onPlay }: {
  title: string
  view: 'stage' | 'plan'
  onView: (view: 'stage' | 'plan') => void
  onBack: () => void
  onPlay: () => void
}) {
  const [sheet, setSheet] = useState<Sheet>(null)
  const [toast, setToast] = useState<Toast | null>(null)
  const selection = useStore(s => s.selection)
  // 物を選び直したら、前の「足しました」は消す
  useEffect(() => { if (toast && selection.id !== toast.id) setToast(null) }, [selection.id, toast])
  // 設定のシートで物を消したら、シートも閉じる
  useEffect(() => { if (sheet === 'inspector' && !selection.id) setSheet(null) }, [sheet, selection.id])
  useEffect(() => {
    if (!toast) return
    const timer = window.setTimeout(() => setToast(null), 7000)
    return () => window.clearTimeout(timer)
  }, [toast])

  const added = (item: AddItem, label: string) => {
    const id = addItem(item)
    setSheet(null)
    onView('stage')
    useStore.getState().updateSettings({ panelOpen: false })
    if (id) setToast({ label, kind: item.kind, id })
  }

  return <>
    <header className="phone-top">
      <button type="button" className="phone-icon" aria-label="プロジェクト一覧へ戻る" onClick={onBack}>←</button>
      <div className="phone-title">{title || '名称未設定'}</div>
      <button type="button" className="phone-play" onClick={onPlay}>▶ 通し</button>
      <button type="button" className="phone-icon" aria-label="そのほかのメニュー" aria-expanded={sheet === 'menu'} onClick={() => setSheet('menu')}>⋯</button>
    </header>
    <div className="phone-view-switch" role="group" aria-label="見え方">
      <button type="button" aria-pressed={view === 'stage'} onClick={() => onView('stage')}>3D</button>
      <button type="button" aria-pressed={view === 'plan'} onClick={() => onView('plan')}>平面図</button>
    </div>

    <ChangeScopeBar phone />
    <GestureHint view={view} />
    {toast ? <div className="phone-card phone-toast" role="status">
      <div className="phone-card-text"><strong>{toast.label}を足しました</strong></div>
      <button type="button" className="phone-card-main" onClick={() => setSheet('inspector')}>設定</button>
      <button type="button" className="phone-card-link" onClick={() => {
        useStore.getState().select(toast.kind as never, toast.id)
        deleteSelection()
        setToast(null)
      }}>取り消す</button>
    </div> : selection.id && sheet === null && <SelectedCard onSettings={() => setSheet('inspector')} />}

    <footer className="phone-bottom">
      <SceneStepper onOpen={() => setSheet('scenes')} />
      <button type="button" className="phone-add" aria-expanded={sheet === 'add'} onClick={() => setSheet('add')}>＋ 追加</button>
    </footer>

    {sheet === 'add' && <PhoneSheet title="何を足しますか" onClose={() => setSheet(null)}><AddSheet onAdd={added} onSettings={id => { useStore.getState().select('performer', id); setSheet('inspector') }} /></PhoneSheet>}
    {sheet === 'scenes' && <PhoneSheet title="シーン" tall onClose={() => setSheet(null)}><ScenesSheet onDone={() => setSheet(null)} /></PhoneSheet>}
    {sheet === 'inspector' && <PhoneSheet title="設定" tall onClose={() => setSheet(null)}><div className="phone-inspector"><Inspector /></div></PhoneSheet>}
    {sheet === 'menu' && <PhoneSheet title="メニュー" onClose={() => setSheet(null)}><MenuSheet onDone={() => setSheet(null)} /></PhoneSheet>}
  </>
}

function PhoneSheet({ title, tall = false, onClose, children }: { title: string; tall?: boolean; onClose: () => void; children: React.ReactNode }) {
  return <>
    <div className="phone-sheet-backdrop" onClick={onClose} />
    <section className={'phone-sheet' + (tall ? ' tall' : '')} aria-label={title} role="dialog">
      <div className="phone-sheet-head">
        <h2>{title}</h2>
        <button type="button" className="phone-icon" aria-label="閉じる" onClick={onClose}>×</button>
      </div>
      <div className="phone-sheet-body">{children}</div>
    </section>
  </>
}

function SelectedCard({ onSettings }: { onSettings: () => void }) {
  const selection = useStore(s => s.selection)
  const name = useStore(s => {
    const { kind, id } = s.selection
    if (kind === 'fixture') return s.fixtures.find(item => item.id === id)?.name
    if (kind === 'performer') return s.performers.find(item => item.id === id)?.name
    if (kind === 'setpiece') return s.setPieces.find(item => item.id === id)?.name
    if (kind === 'audience') return s.productionPlan.audienceBlocks?.find(item => item.id === id)?.name
    if (kind === 'stage') return '舞台'
    return undefined
  })
  if (!selection.kind) return null
  return <div className="phone-card">
    <div className="phone-card-text"><span>{KIND_LABELS[selection.kind] ?? ''}{scopeOf(selection.kind) && <b className={'scope-tag ' + scopeOf(selection.kind)!.kind}>{scopeOf(selection.kind)!.short}</b>}</span><strong>{name ?? KIND_LABELS[selection.kind]}</strong></div>
    <button type="button" className="phone-card-main" onClick={onSettings}>設定</button>
    <button type="button" className="phone-card-sub" onClick={() => useStore.getState().select(null, null)}>選ぶのをやめる</button>
  </div>
}

function SceneStepper({ onOpen }: { onOpen: () => void }) {
  const plan = useStore(s => s.productionPlan)
  const selectScene = useStore(s => s.selectScene)
  const index = plan.scenes.findIndex(item => item.id === plan.activeSceneId)
  const scene = plan.scenes[index]
  return <div className="phone-scene">
    <button type="button" aria-label="前のシーン" disabled={index <= 0} onClick={() => selectScene(plan.scenes[index - 1].id)}>‹</button>
    <button type="button" className="phone-scene-name" aria-label={`${scene ? sceneDisplayTitle(plan, scene.id) : 'シーン'}。シーン一覧を開く`} onClick={onOpen}>
      <small>シーン {index + 1} / {plan.scenes.length}</small>
      <strong>{scene ? sceneDisplayTitle(plan, scene.id) : 'シーン'}</strong>
    </button>
    <button type="button" aria-label="次のシーン" disabled={index < 0 || index >= plan.scenes.length - 1} onClick={() => selectScene(plan.scenes[index + 1].id)}>›</button>
  </div>
}

function AddSheet({ onAdd, onSettings }: { onAdd: (item: AddItem, label: string) => void; onSettings: (id: string) => void }) {
  const [tab, setTab] = useState<AddTab>('light')
  const performers = useStore(s => s.performers)
  const tile = (key: string, item: AddItem, glyph: string, label: string, note?: string) =>
    <button key={key} type="button" className="phone-tile" onClick={() => onAdd(item, label)}>
      <Glyph name={glyph} /><span>{label}</span>{note && <small>{note}</small>}
    </button>
  return <>
    <div className="phone-tabs" role="tablist">
      {([['light', '照明'], ['cast', '役者・客席'], ['set', '舞台セット']] as Array<[AddTab, string]>).map(([key, label]) =>
        <button key={key} type="button" role="tab" aria-selected={tab === key} onClick={() => setTab(key)}>{label}</button>)}
    </div>
    <p className="phone-note">押すと舞台に置いて、この画面を閉じます。</p>
    {tab === 'light' && <>
      <div className="phone-tiles">
        {FIXTURE_TILES.filter(item => addablePresets(item.kind).length).map(item => {
          const preset = item.preset ?? addablePresets(item.kind)[0]
          const model = FIXTURE_PROFILES[preset]?.model ?? item.label
          return tile(item.kind, { kind: 'fixture', preset }, FIXTURE_GLYPH[item.kind] ?? 'lamp', item.label, model.replace(item.label, '').trim() || undefined)
        })}
      </div>
      <p className="phone-note small">{FIXTURE_DISCLAIMER}</p>
    </>}
    {tab === 'cast' && <div className="phone-tiles">
      {tile('performer', { kind: 'performer' }, 'performer', '役者', '全シーンに足す')}
      {tile('audience', { kind: 'audience' }, 'audience', '客席')}
    </div>}
    {/* いまの役者。舞台にいない役者は 3D にも平面図にも出ないので、ここから出し入れ・設定できるようにする（2026-11-17） */}
    {tab === 'cast' && performers.length > 0 && <>
      <h3 className="phone-subhead">このシーンの役者</h3>
      <ul className="phone-cast">
        {performers.map(performer => {
          const on = performer.onStage !== false
          return <li key={performer.id}>
            <span className="phone-cast-dot" style={{ background: performer.color }} aria-hidden="true">{performer.name.trim().slice(0, 1)}</span>
            <span className="phone-cast-name">{performer.name}<small>{on ? '舞台上' : '舞台外'}</small></span>
            <button type="button" onClick={() => useStore.getState().updatePerformer(performer.id, { onStage: !on })}>{on ? '舞台から外す' : '舞台に出す'}</button>
            <button type="button" onClick={() => onSettings(performer.id)}>設定</button>
          </li>
        })}
      </ul>
    </>}
    {tab === 'set' && <>
      <div className="phone-tiles">
        {SET_PIECE_TYPES.filter(item => !EFFECT_TYPES.has(item.id)).map(item => tile(item.id, { kind: 'setpiece', type: item.id }, SET_PIECE_GLYPH[item.id], item.label))}
        {SET_PIECE_TYPES.filter(item => EFFECT_TYPES.has(item.id)).map(item => tile(item.id, { kind: 'setpiece', type: item.id }, SET_PIECE_GLYPH[item.id], item.label))}
      </div>
      <h3 className="phone-subhead">舞台の部品</h3>
      <div className="phone-tiles">
        {STAGE_PART_KINDS.map(kind => tile(kind, { kind: 'stagepart', part: kind }, kind, PART_LABELS[kind]))}
      </div>
    </>}
  </>
}

function ScenesSheet({ onDone }: { onDone: () => void }) {
  const plan = useStore(s => s.productionPlan)
  const [openId, setOpenId] = useState<string | null>(null)
  const [confirmId, setConfirmId] = useState<string | null>(null)
  const chapterOf = (sequenceId?: string) => plan.sequences?.find(item => item.id === sequenceId)?.chapterId
  const rows = useMemo(() => plan.scenes.map((scene, index) => {
    const chapterId = chapterOf(scene.sequenceId)
    const first = index === 0 || chapterOf(plan.scenes[index - 1].sequenceId) !== chapterId
    return { scene, index, chapter: first ? plan.chapters?.find(item => item.id === chapterId) : undefined }
  }), [plan])
  const lastChapterId = plan.chapters?.[plan.chapters.length - 1]?.id
  const s = () => useStore.getState()
  return <>
    <ol className="phone-scenes">
      {rows.map(({ scene, index, chapter }) => {
        const current = scene.id === plan.activeSceneId
        const name = sceneDisplayTitle(plan, scene.id)
        return <li key={scene.id}>
          {chapter && <div className="phone-chapter">{chapter.title}</div>}
          <div className={'phone-scene-row' + (current ? ' current' : '')}>
            <button type="button" className="phone-scene-pick" aria-current={current || undefined}
              onClick={() => { s().selectScene(scene.id); onDone() }}>
              <span className="phone-scene-no">{index + 1}</span>{name}{current && <em>いま</em>}
            </button>
            <button type="button" className="phone-icon" aria-label={`${name}の操作`} aria-expanded={openId === scene.id}
              onClick={() => { setOpenId(openId === scene.id ? null : scene.id); setConfirmId(null) }}>⋯</button>
          </div>
          {openId === scene.id && <div className="phone-scene-actions">
            <label><span>名前</span><input defaultValue={scene.title} placeholder={name}
              onBlur={event => s().updateScene(scene.id, { title: event.target.value })} /></label>
            <div className="phone-row-buttons">
              <button type="button" disabled={index === 0} onClick={() => s().moveScene(scene.id, plan.scenes[index - 1].id, 'before')}>上へ</button>
              <button type="button" disabled={index === plan.scenes.length - 1} onClick={() => s().moveScene(scene.id, plan.scenes[index + 1].id, 'after')}>下へ</button>
              {confirmId === scene.id
                ? <button type="button" className="danger" onClick={() => { s().removeScene(scene.id); setOpenId(null) }}>本当に消す</button>
                : <button type="button" disabled={plan.scenes.length <= 1} onClick={() => setConfirmId(scene.id)}>消す</button>}
            </div>
          </div>}
          {current && <button type="button" className="phone-add-scene" onClick={() => { s().addScene(); onDone() }}>＋ この後にシーンを足す</button>}
        </li>
      })}
    </ol>
    <div className="phone-sheet-foot">
      <button type="button" className="phone-primary" disabled={!lastChapterId}
        onClick={() => { if (lastChapterId) s().addSceneAt(lastChapterId, null); onDone() }}>＋ 最後にシーンを足す</button>
      <button type="button" onClick={() => { s().addChapter(); onDone() }}>＋ 章を足す</button>
    </div>
  </>
}

function MenuSheet({ onDone }: { onDone: () => void }) {
  const { canUndo, canRedo } = useMockWorkspaceState()
  const { user } = useCloudSession()
  const settings = useStore(s => s.settings)
  const update = useStore(s => s.updateSettings)
  const views: Array<[string, string]> = [['audience', '客席から'], ['aerial', '上から'], ['sidewing', '袖から'], ['free', '自由']]
  return <div className="phone-menu">
    <div className="phone-row-buttons">
      <button type="button" disabled={!canUndo} onClick={undoMockWorkspace}>↶ 元に戻す</button>
      <button type="button" disabled={!canRedo} onClick={redoMockWorkspace}>↷ やり直す</button>
    </div>
    <h3 className="phone-subhead">見る位置</h3>
    <div className="phone-row-buttons">
      {views.map(([key, label]) => <button key={key} type="button" aria-pressed={settings.cameraView === key}
        onClick={() => { update({ cameraView: key as never }); onDone() }}>{label}</button>)}
    </div>
    <div className="phone-row-buttons">
      <button type="button" aria-pressed={!!settings.showHouseLights} onClick={() => update({ showHouseLights: !settings.showHouseLights })}>
        客電 {settings.showHouseLights ? 'ON' : 'OFF'}</button>
    </div>
    <h3 className="phone-subhead">そのほか</h3>
    <div className="phone-menu-list">
      <button type="button" onClick={() => { update({ settingsOpen: true }); onDone() }}>表示の設定</button>
      <button type="button" onClick={() => { update({ showHelp: true }); onDone() }}>使い方</button>
      <a href={user ? accountUrl() : loginUrl()}>{user ? 'アカウント' : 'ログイン'}</a>
    </div>
  </div>
}

const GESTURE_HINT_KEY = 'tomoshibi.gestureHintSeen'
/** 最初の 1 回だけ、指の使い方を短く出す。押すか 8 秒で消え、次からは出さない（2026-11-17） */
function GestureHint({ view }: { view: 'stage' | 'plan' }) {
  const [show, setShow] = useState(() => { try { return !localStorage.getItem(GESTURE_HINT_KEY) } catch { return false } })
  const close = () => { setShow(false); try { localStorage.setItem(GESTURE_HINT_KEY, '1') } catch { /* 覚えられなくても使える */ } }
  useEffect(() => {
    if (!show) return
    const timer = window.setTimeout(close, 8000)
    return () => window.clearTimeout(timer)
  }, [show])
  if (!show) return null
  return <button type="button" className="phone-gesture-hint" onClick={close} aria-label="指の使い方。押すと閉じます">
    <span><b>1 本指</b>{view === 'plan' ? '図を動かす・物を動かす' : '視点を動かす・物を動かす'}</span>
    <span><b>2 本指</b>{view === 'plan' ? '広げて拡大' : '広げて拡大・ひねって回転'}</span>
  </button>
}
