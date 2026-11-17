type SaveStorage = 'local' | 'cloud'

type SaveEventParams = {
  storage: SaveStorage
  authenticated?: boolean
  reason?: string
}

declare global {
  interface Window {
    gtag?: (...args: unknown[]) => void
  }
}

function track(name: string, params: SaveEventParams) {
  if (typeof window === 'undefined' || typeof window.gtag !== 'function') return
  window.gtag('event', name, {
    event_category: 'tomoshibi_save',
    save_storage: params.storage,
    ...(params.authenticated === undefined ? {} : { authenticated: params.authenticated }),
    ...(params.reason ? { reason: params.reason } : {}),
  })
}

export function trackSavePromptViewed(params: SaveEventParams) {
  track('tomoshibi_save_prompt_viewed', params)
}

export function trackSaveStarted(params: SaveEventParams) {
  track('tomoshibi_save_started', params)
}

export function trackSaveCompleted(params: SaveEventParams) {
  track('tomoshibi_save_completed', params)
}

export function trackSaveFailed(params: SaveEventParams) {
  track('tomoshibi_save_failed', params)
}

export function trackSaveAbandoned(params: SaveEventParams) {
  track('tomoshibi_save_abandoned', params)
}
