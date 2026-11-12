import { useEffect, useState } from 'react'
import { WorkspaceNotice } from './WorkspaceNotice'

const CHECK_INTERVAL_MS = 5 * 60 * 1000

// scripts/build-mock.mjs が HTML に埋めるビルド ID。開発サーバーでは無いので確認しない
const currentBuild = () => document.querySelector<HTMLMetaElement>('meta[name="tomoshibi-build"]')?.content ?? ''

const versionUrl = () => {
  const base = location.pathname.startsWith('/mock') ? '/mock/' : '/studio/'
  return `${base}version.json?t=${Date.now()}`
}

async function fetchLatestBuild(): Promise<string | null> {
  try {
    const res = await fetch(versionUrl(), { cache: 'no-store' })
    if (!res.ok) return null
    const body = await res.json() as { build?: unknown }
    return typeof body.build === 'string' ? body.build : null
  } catch {
    return null
  }
}

/** 公開中の版が開いている画面より新しくなったら、再読み込みを促す */
export function UpdateNotice() {
  const [outdated, setOutdated] = useState(false)

  useEffect(() => {
    const build = currentBuild()
    if (!build || outdated) return
    let stopped = false
    const check = async () => {
      if (document.visibilityState !== 'visible') return
      const latest = await fetchLatestBuild()
      if (!stopped && latest && latest !== build) setOutdated(true)
    }
    const timer = window.setInterval(check, CHECK_INTERVAL_MS)
    document.addEventListener('visibilitychange', check)
    window.addEventListener('focus', check)
    void check()
    return () => {
      stopped = true
      window.clearInterval(timer)
      document.removeEventListener('visibilitychange', check)
      window.removeEventListener('focus', check)
    }
  }, [outdated])

  if (!outdated) return null
  return <WorkspaceNotice kind="alert">
    <span>新しい版が公開されました。この画面は古い版のため、再読み込みしてください。</span>
    <button type="button" onClick={() => location.reload()}>再読み込み</button>
  </WorkspaceNotice>
}
