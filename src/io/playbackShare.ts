// スタジオの「通しで見る」を、見るだけの URL にして渡す（2026-11-23 オーナー「再生ボタンを押したときの様子だけを共有できるようにしよう」）
import { exportScene, importScene } from './sceneIO'
import { decodeShare, encodeShare, sharePayloadFromHash, shareURL, toShareScene } from './shareCodec'
import { isWorkspaceLibraryPath, isWorkspacePath } from './workspacePath'

const PRODUCTION_ORIGIN = 'https://tomoshibi.gikyokutosyokan.com'

/** いまのプランの全シーンを、通しで見るだけの共有 URL にする */
export async function createPlaybackShareURL(): Promise<string> {
  const payload = await encodeShare(toShareScene(exportScene('shared')))
  const origin = location.protocol === 'http:' || location.protocol === 'https:' ? location.origin : PRODUCTION_ORIGIN
  return shareURL(origin, payload)
}

/** 共有 URL で開かれた画面か（読み込みのときに 1 度だけ決める） */
export function isSharedPlaybackURL(): boolean {
  return typeof location !== 'undefined' && isWorkspacePath() && !isWorkspaceLibraryPath() &&
    sharePayloadFromHash(location.hash) !== null
}

/** 共有 URL の中身を画面に読み込む。この端末の保存データには書かない（自動保存は動かさない） */
export async function loadSharedPlayback(): Promise<boolean> {
  const payload = sharePayloadFromHash(location.hash)
  if (!payload) return false
  try {
    importScene(await decodeShare(payload))
    return true
  } catch (error) {
    console.warn('共有 URL を読めませんでした', error)
    return false
  }
}
