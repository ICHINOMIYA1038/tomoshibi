import { useState } from 'react'
import type { Fixture } from '../store'
import { colorNote, fixtureGuide } from '../lighting/fixtureGuide'

// 器具を選んだときの「この明かりの役目」（右の欄の上と、スマホの札）。開け閉めでき、閉じたことは覚えておく（2026-11-28）

function readOpen(key: string, fallback: boolean) {
  try {
    const value = localStorage.getItem(key)
    return value === 'open' ? true : value === 'closed' ? false : fallback
  } catch { return fallback }
}

function useNoteOpen(key: string, fallback: boolean) {
  const [open, setOpenState] = useState(() => readOpen(key, fallback))
  const setOpen = (next: boolean) => {
    setOpenState(next)
    try { localStorage.setItem(key, next ? 'open' : 'closed') } catch { /* 覚えられなくても使える */ }
  }
  return [open, setOpen] as const
}

const swatch = (rgb: [number, number, number]) =>
  `rgb(${rgb.map(value => Math.round(Math.min(1, Math.max(0, value)) ** (1 / 2.2) * 255)).join(',')})`

function NoteBody({ fixture }: { fixture: Fixture }) {
  const [main, ...more] = fixtureGuide(fixture)
  const color = colorNote(fixture)
  return <div className="fixture-note-body">
    {main && <><h4>{main.label}</h4><p>{main.text}</p></>}
    {more.map(item => <p key={item.key} className="fixture-note-more"><b>{item.label}</b>{item.text}</p>)}
    {color && <p className="fixture-note-color">
      <i aria-hidden="true" style={{ background: swatch(fixture.color) }} />
      <span><b>{color.family}</b>{color.text}</span>
    </p>}
    {color && /#|番台/.test(color.family) && <small>色の番号は、近い色の目安です。</small>}
  </div>
}

/** 右の欄（PC）。いちばん上に、役目の名前と説明を出す */
export function FixtureNote({ fixture }: { fixture: Fixture }) {
  const [open, setOpen] = useNoteOpen('tomoshibi.fixtureNote', true)
  const guide = fixtureGuide(fixture)
  if (!guide.length && !colorNote(fixture)) return null
  const title = guide[0]?.label ?? 'この明かりの色'
  return <section className={'fixture-note' + (open ? ' open' : '')} aria-label="この明かりの役目">
    <button type="button" className="fixture-note-toggle" aria-expanded={open} onClick={() => setOpen(!open)}>
      <span>この明かりの役目</span><strong>{title}</strong><em aria-hidden="true">{open ? '閉じる' : '開く'}</em>
    </button>
    {open && <NoteBody fixture={fixture} />}
  </section>
}

/** スマホの札。最初は 1 行だけ出し、押すと札の上に説明を広げる */
export function FixtureCardNote({ fixture }: { fixture: Fixture }) {
  const [open, setOpen] = useNoteOpen('tomoshibi.fixtureNote.phone', false)
  const guide = fixtureGuide(fixture)
  if (!guide.length && !colorNote(fixture)) return null
  return <div className={'fixture-card-note' + (open ? ' open' : '')}>
    {open && <NoteBody fixture={fixture} />}
    <button type="button" className="fixture-card-note-toggle" aria-expanded={open} onClick={() => setOpen(!open)}>
      {open ? '説明を閉じる' : `${guide[0]?.label ?? 'この色'}とは`}
    </button>
  </div>
}
