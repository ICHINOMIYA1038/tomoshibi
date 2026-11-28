import { useEffect, useMemo, useState, type MouseEvent } from 'react'
import { focusSelection } from '../scene/focusBus'
import { HierarchyPanel } from './HierarchyPanel'
import { APP_RESTORE_URL, hasAppBridge } from '../io/appBridge'
import { ProjectTitleEdit } from './ProjectTitleEdit'
import { addablePresets, FIXTURE_DISCLAIMER, FIXTURE_PROFILES } from '../lighting/fixtureTypes'
import { addItem, deleteSelection, SET_PIECE_TYPES, type AddItem } from '../objectActions'
import { PART_LABELS } from '../stageParts'
import { sceneDisplayTitle, useStore } from '../store'
import { loginUrl } from '../io/cloud'
import { useCloudSession } from '../io/cloudSession'
import { redoMockWorkspace, undoMockWorkspace, useMockWorkspaceState } from '../io/mockWorkspace'
import { EFFECT_TYPES, FIXTURE_GLYPH, FIXTURE_TILES, Glyph, SET_PIECE_GLYPH, STAGE_PART_KINDS } from './AddPalette'
import { Inspector } from './Inspector'
import { LockButton } from './LockButton'
import { HighlightButton } from './HighlightButton'
import { ChangeScopeBar } from './ChangeScopeBar'
import { FixtureCardNote } from './FixtureNote'

// スマホ（幅 600px 以下）の編集画面。PC の道具の列・ヒエラルキー・インスペクターは出さず、
// 舞台をいつも見せたまま、追加・シーン・設定を下からのシートで出す（2026-11-17 オーナーと決めた案 A）

type Sheet = null | 'add' | 'scenes' | 'inspector' | 'menu' | 'list'
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
      <ProjectTitleEdit className="phone-title" fallback="名称未設定" />
      <UndoRedo />
      <button type="button" className="phone-play" aria-label="通しで見る" onClick={onPlay}>▶</button>
      <button type="button" className="phone-icon" aria-label="そのほかのメニュー" aria-expanded={sheet === 'menu'} onClick={() => setSheet('menu')}>⋯</button>
    </header>
    <div className="phone-view-switch" role="group" aria-label="見え方">
      <button type="button" aria-pressed={view === 'stage'} onClick={() => onView('stage')}>3D</button>
      <button type="button" aria-pressed={view === 'plan'} onClick={() => onView('plan')}>平面図</button>
    </div>
    {/* 置いた物の一覧（PC のヒエラルキー）。2026-11-18 オーナー「スマホから一覧が見れない」 */}
    <button type="button" className="phone-list-button" aria-expanded={sheet === 'list'} onClick={() => setSheet('list')}>一覧</button>
    {view === 'stage' && <ViewPicker />}
    {view === 'stage' && <HouseLightsButton />}

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
    {sheet === 'list' && <PhoneSheet title="置いた物の一覧" tall onClose={() => setSheet(null)}><ListSheet onPicked={() => setSheet(null)} /></PhoneSheet>}
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
  const fixture = useStore(s => s.selection.kind === 'fixture' ? s.fixtures.find(item => item.id === s.selection.id) : undefined)
  if (!selection.kind) return null
  return <div className={'phone-card' + (fixture ? ' has-note' : '')}>
    {fixture && <FixtureCardNote fixture={fixture} />}
    <div className="phone-card-text"><span>{KIND_LABELS[selection.kind] ?? ''}</span><strong>{name ?? KIND_LABELS[selection.kind]}</strong></div>
    <LockButton className="phone-card-lock" />
    <HighlightButton short />
    <button type="button" className="phone-card-main" onClick={onSettings}>設定</button>
    <button type="button" className="phone-icon phone-card-close" aria-label="選ぶのをやめる" onClick={() => useStore.getState().select(null, null)}>×</button>
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
      <button type="button" onClick={() => { s().addChapter() /* 足したあとも一覧を閉じない（続けて場面を足せるように。2026-11-19） */ }}>＋ 章を足す</button>
    </div>
  </>
}

function MenuSheet({ onDone }: { onDone: () => void }) {
  // 元に戻す・やり直すは上の帯に、見る位置と客電は「一覧」の横にあるので、メニューには入れない（2026-11-18 オーナー）
  const { user } = useCloudSession()
  const settings = useStore(s => s.settings)
  const update = useStore(s => s.updateSettings)
  return <div className="phone-menu">
    <h3 className="phone-subhead">そのほか</h3>
    <div className="phone-menu-list">
      <button type="button" onClick={() => { update({ settingsOpen: true }); onDone() }}>表示の設定</button>
      <a href="/help" target="_blank" rel="noopener" onClick={onDone}>使い方</a>
      <a href={user ? '/account' : loginUrl()}>{user ? 'アカウント' : '新規登録・ログイン'}</a>
      {/* アプリの下の帯を広告にしたので、購入の復元はここと Pro のページから（2026-11-18） */}
      {hasAppBridge() && <a href={APP_RESTORE_URL}>購入を復元</a>}
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

/** 元に戻す・やり直す。スマホでは「⋯」の中だけだと見つからないので、上の列にも出す（2026-11-17） */
function UndoRedo() {
  const { canUndo, canRedo } = useMockWorkspaceState()
  return <>
    <button type="button" className="phone-icon" aria-label="元に戻す" disabled={!canUndo} onClick={undoMockWorkspace}>↶</button>
    <button type="button" className="phone-icon" aria-label="やり直す" disabled={!canRedo} onClick={redoMockWorkspace}>↷</button>
  </>
}

/** 置いた物の一覧。行を押して選ぶと閉じて 3D でその物に寄り、下の札から設定や固定ができる */
function ListSheet({ onPicked }: { onPicked: () => void }) {
  const selected = useStore(s => s.selection.id)
  const [first] = useState(selected)
  // 選んだら一覧を閉じ、3D の視点をその物に寄せる（ダブルタップと同じ動き。2026-11-18）
  useEffect(() => { if (selected && selected !== first) { onPicked(); focusSelection() } }, [selected, first, onPicked])
  // すでに選ばれている物の行を押しても選択は変わらないので、上の仕組みでは閉じなかった。行の名前を押したら必ず閉じて寄る（2026-11-18）
  const pickSame = (event: MouseEvent) => {
    if (!(event.target as HTMLElement).closest('.hierarchy-name')) return
    window.setTimeout(() => { if (useStore.getState().selection.id === first && first) { onPicked(); focusSelection() } }, 0)
  }
  return <div className="phone-list unity-panel" onClick={pickSame}><HierarchyPanel /></div>
}

const VIEWS: Array<[string, string]> = [['audience', '客席から'], ['aerial', '上から'], ['sidewing', '袖から'], ['free', '自由']]
/** 3D の見る位置。「一覧」の横のボタンから小窓で選ぶ（2026-11-18 オーナー「見る位置は一覧の横に」） */
function ViewPicker() {
  const current = useStore(s => s.settings.cameraView)
  const update = useStore(s => s.updateSettings)
  const [open, setOpen] = useState(false)
  const label = VIEWS.find(([key]) => key === current)?.[1] ?? '見る位置'
  return <>
    <button type="button" className="phone-view-picker" aria-expanded={open} aria-haspopup="true" onClick={() => setOpen(value => !value)}>
      {label} <span aria-hidden="true">▾</span></button>
    {open && <div className="phone-view-picker-menu" role="group" aria-label="見る位置">
      {VIEWS.map(([key, text]) => <button key={key} type="button" aria-pressed={current === key}
        onClick={() => { update({ cameraView: key as never }); setOpen(false) }}>{text}</button>)}
    </div>}
  </>
}

/** 客電（客席の明かり）の入・切。3D の上の列の右端に置く（2026-11-18 オーナー「客電はメニューでなく画面に」） */
function HouseLightsButton() {
  const on = useStore(s => !!s.settings.showHouseLights)
  const update = useStore(s => s.updateSettings)
  return <button type="button" className={'phone-house-lights' + (on ? ' on' : '')} aria-pressed={on}
    onClick={() => update({ showHouseLights: !on })}>客電 {on ? 'ON' : 'OFF'}</button>
}
