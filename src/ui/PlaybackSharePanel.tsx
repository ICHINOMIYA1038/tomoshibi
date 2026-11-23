import { useEffect, useRef, useState } from 'react'
import { createPlaybackShareURL } from '../io/playbackShare'

/** これより長い URL は、送り先（メール・一部のチャット）で途中が切れることがある */
const LONG_URL = 8000

/** 通しで見るの「共有」。見るだけの URL を作り、コピーするか、スマホの共有シートで送る */
export function PlaybackSharePanel({ onClose }: { onClose: () => void }) {
  const [url, setURL] = useState('')
  const [error, setError] = useState('')
  const [status, setStatus] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)
  const canShare = typeof navigator !== 'undefined' && typeof navigator.share === 'function'

  useEffect(() => {
    let alive = true
    createPlaybackShareURL()
      .then(next => { if (alive) setURL(next) })
      .catch(() => { if (alive) setError('共有 URL を作れませんでした。もう一度お試しください。') })
    return () => { alive = false }
  }, [])

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return
      // 通しで見るの Esc（編集に戻る）より先に、この欄だけを閉じる
      event.preventDefault()
      event.stopImmediatePropagation()
      onClose()
    }
    window.addEventListener('keydown', onKey, true)
    return () => window.removeEventListener('keydown', onKey, true)
  }, [onClose])

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(url)
      setStatus('コピーしました')
    } catch {
      inputRef.current?.select()
      setStatus('コピーできませんでした。URL を選んだので、手でコピーしてください')
    }
  }
  const share = async () => {
    try {
      await navigator.share({ url, title: 'TOMOSHIBI小屋の舞台プラン' })
    } catch (shareError) {
      if (shareError instanceof DOMException && shareError.name === 'AbortError') return
      void copy()
    }
  }

  return <div className="stage-playback-share" role="dialog" aria-label="見るだけの共有 URL">
    <div className="stage-playback-share-head">
      <strong>見るだけの共有 URL</strong>
      <button type="button" className="stage-playback-share-close" onClick={onClose} aria-label="閉じる">×</button>
    </div>
    <p>開いた人には、この「通しで見る」の画面だけが出ます。編集はできず、ログインも要りません。シーンのメモは入りません。</p>
    {error ? <p className="stage-playback-share-error" role="alert">{error}</p>
      : <>
        <input ref={inputRef} readOnly value={url || '作っています…'} aria-label="共有 URL"
          onFocus={event => event.currentTarget.select()} />
        <div className="stage-playback-share-actions">
          <button type="button" className="stage-playback-primary" disabled={!url} onClick={copy}>コピー</button>
          {canShare && <button type="button" disabled={!url} onClick={share}>送る…</button>}
          <span role="status">{status}</span>
        </div>
        {url.length > LONG_URL && <p className="stage-playback-share-note">
          URL が長めです（{url.length.toLocaleString()} 文字）。送り先によっては途中で切れることがあります。</p>}
      </>}
  </div>
}
