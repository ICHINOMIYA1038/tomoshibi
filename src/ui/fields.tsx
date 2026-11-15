import { useEffect, useState, type ReactNode } from 'react'

/**
 * インスペクターの数字の欄（Unity と同じく、ラベルの横に数字）。
 * 打っている途中（「-」や「1.」）は文字のまま持ち、数字として読めたときだけ反映する
 */
export function NumberField({ label, value, min, max, step = .1, unit = 'm', onChange, disabled }: {
  label: string; value: number; min?: number; max?: number; step?: number; unit?: string
  onChange: (value: number) => void; disabled?: boolean
}) {
  const shown = String(Math.round(value * 100) / 100)
  const [draft, setDraft] = useState(shown)
  const [editing, setEditing] = useState(false)
  useEffect(() => { if (!editing) setDraft(shown) }, [shown, editing])
  const commit = (text: string) => {
    const next = Number(text)
    if (text.trim() === '' || !Number.isFinite(next)) return
    onChange(Math.min(max ?? Infinity, Math.max(min ?? -Infinity, next)))
  }
  return <label className="inspector-number">
    <span>{label}</span>
    <input type="number" inputMode="decimal" step={step} min={min} max={max} value={editing ? draft : shown} disabled={disabled}
      onFocus={() => { setEditing(true); setDraft(shown) }}
      onBlur={() => setEditing(false)}
      onKeyDown={event => { if (event.key === 'Enter') event.currentTarget.blur() }}
      onChange={event => { setDraft(event.target.value); commit(event.target.value) }} />
    <small>{unit}</small>
  </label>
}

/** インスペクターの 1 まとまり（Unity のコンポーネント） */
export function InspectorSection({ title, children }: { title: string; children: ReactNode }) {
  return <section className="inspector-section">
    <h3>{title}</h3>
    {children}
  </section>
}
