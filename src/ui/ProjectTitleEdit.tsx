import { useState } from 'react'
import { useStore } from '../store'
import { renameProject } from '../io/renameProject'

/** 編集画面の上のプロジェクト名。押すとその場で名前を変えられる。Enter か外を押すと決まり、Esc でやめる */
export function ProjectTitleEdit({ className, fallback }: { className: string; fallback: string }) {
  const title = useStore(s => s.productionPlan.projectTitle)?.trim() ?? ''
  const [draft, setDraft] = useState<string | null>(null)
  const commit = () => {
    if (draft === null) return
    const next = draft.trim()
    setDraft(null)
    if (next && next !== title) renameProject(next)
  }
  if (draft !== null) return <input className={className + ' editing'} autoFocus value={draft} maxLength={60}
    aria-label="プロジェクト名" enterKeyHint="done"
    onFocus={event => event.currentTarget.select()}
    onChange={event => setDraft(event.target.value)}
    onBlur={commit}
    onKeyDown={event => {
      if (event.key === 'Enter' && !event.nativeEvent.isComposing) { event.preventDefault(); commit() }
      if (event.key === 'Escape') setDraft(null)
    }} />
  return <button type="button" className={className} title={(title || fallback) + '（押すと名前を変えられます）'}
    aria-label={`プロジェクト名「${title || fallback}」。押すと変えられます`} onClick={() => setDraft(title)}>
    <span className="project-title-text">{title || fallback}</span>
    <svg className="project-title-pen" viewBox="0 0 16 16" width="12" height="12" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round">
      <path d="M3 13l1-3.5L11 2.5l2.5 2.5L6.5 12z" /><path d="M9.5 4l2.5 2.5" />
    </svg>
  </button>
}
