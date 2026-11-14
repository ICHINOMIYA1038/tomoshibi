import { isNativeApp } from '../io/cloud'

/**
 * 削除・上書きなどの確認を出し、押された方を返す。
 * iOS アプリ（1.0.4 ビルド 12 まで）の WebView は window.confirm を出さずに「キャンセル」を返すため、
 * 削除などのボタンを押しても何も起きなかった。アプリの中では画面の中に確認を出す。
 * ふつうのブラウザでは、これまでどおりブラウザの確認を使う。
 */
export function askConfirm(message: string, okLabel = 'OK'): Promise<boolean> {
  if (!isNativeApp()) return Promise.resolve(window.confirm(message))
  return new Promise(resolve => {
    const previousFocus = document.activeElement as HTMLElement | null
    const backdrop = document.createElement('div')
    backdrop.className = 'ask-confirm-backdrop'
    const dialog = document.createElement('div')
    dialog.className = 'ask-confirm'
    dialog.setAttribute('role', 'alertdialog')
    dialog.setAttribute('aria-modal', 'true')
    const text = document.createElement('p')
    text.className = 'ask-confirm-message'
    text.textContent = message
    const actions = document.createElement('div')
    actions.className = 'ask-confirm-actions'
    const cancel = document.createElement('button')
    cancel.type = 'button'
    cancel.textContent = 'キャンセル'
    const ok = document.createElement('button')
    ok.type = 'button'
    ok.className = 'ask-confirm-ok'
    ok.textContent = okLabel
    actions.append(cancel, ok)
    dialog.append(text, actions)
    backdrop.append(dialog)

    const finish = (result: boolean) => {
      document.removeEventListener('keydown', onKey, true)
      backdrop.remove()
      previousFocus?.focus?.()
      resolve(result)
    }
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') { event.preventDefault(); finish(false) }
    }
    cancel.addEventListener('click', () => finish(false))
    ok.addEventListener('click', () => finish(true))
    // 外側を押したら閉じる（キャンセル扱い）。ダイアログの中の操作では閉じない
    backdrop.addEventListener('pointerdown', event => { if (event.target === backdrop) finish(false) })
    document.addEventListener('keydown', onKey, true)
    document.body.append(backdrop)
    ok.focus()
  })
}
