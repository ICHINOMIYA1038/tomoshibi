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

/** アプリに知らせる。いまは広告を出してよいか（無料の人）だけ */
export function postToApp(message: { type: 'ads'; show: boolean }) {
  try { appChannel()?.postMessage(JSON.stringify(message)) } catch { /* 知らせられなくても画面は動かす */ }
}

/** アプリで購入を復元する（アプリが横取りするカスタムスキーム） */
export const APP_RESTORE_URL = 'tomoshibi://restore-purchases'
