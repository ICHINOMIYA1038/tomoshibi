// iOS アプリ（2026-11-18 の版から）とのやりとり。アプリは TomoshibiApp という口を持つ。
// 古い版のアプリやブラウザでは口が無いので、何もしない。

type Handler = { postMessage: (message: string) => void }
function appChannel(): Handler | undefined {
  if (typeof window === 'undefined') return undefined
  return (window as unknown as { webkit?: { messageHandlers?: Record<string, Handler> } }).webkit?.messageHandlers?.TomoshibiApp
}

/** 広告の帯と「購入を復元」の置き場所が新しくなった版のアプリか */
export function hasAppBridge(): boolean {
  return Boolean(appChannel())
}

type AppMessage =
  | { type: 'ads'; show: boolean }
  /** .tomoshibi のファイルを書き出す。WKWebView ではリンクのダウンロードが効かないので、アプリが共有シートで渡す */
  | { type: 'export'; name: string; text: string }

/** アプリに知らせる（広告を出してよいか、ファイルの書き出し） */
export function postToApp(message: AppMessage) {
  try { appChannel()?.postMessage(JSON.stringify(message)) } catch { /* 知らせられなくても画面は動かす */ }
}

/** アプリで購入を復元する（アプリが横取りするカスタムスキーム） */
export const APP_RESTORE_URL = 'tomoshibi://restore-purchases'

// ---- ファイルのやりとり（1.0.5 のアプリから） ----
// アプリはページを読み終えるたびに window.__tomoshibiAppFeatures を置く。古い版のアプリには無い
type AppWindow = Window & {
  __tomoshibiAppFeatures?: string[]
  __tomoshibiPendingImports?: { name: string; text: string }[]
}
const appWindow = () => (typeof window === 'undefined' ? undefined : (window as AppWindow))

/** アプリがその機能を持つか（'fileExport'：書き出しを共有シートで渡す、'fileImport'：開いたファイルを渡す） */
export function appHasFeature(feature: 'fileExport' | 'fileImport'): boolean {
  return hasAppBridge() && Boolean(appWindow()?.__tomoshibiAppFeatures?.includes(feature))
}

/** アプリで開かれた .tomoshibi のファイルが届くと、この名前のイベントが window に飛ぶ */
export const APP_IMPORT_EVENT = 'tomoshibi:app-import'

/** アプリから届いて、まだ読み込んでいないファイルがあるか */
export function hasAppImports(): boolean {
  return Boolean(appWindow()?.__tomoshibiPendingImports?.length)
}

/** アプリから届いたファイルを受け取る（受け取ったものは消す） */
export function takeAppImports(): { name: string; text: string }[] {
  const w = appWindow()
  if (!w?.__tomoshibiPendingImports?.length) return []
  const items = w.__tomoshibiPendingImports
  w.__tomoshibiPendingImports = []
  return items
}
