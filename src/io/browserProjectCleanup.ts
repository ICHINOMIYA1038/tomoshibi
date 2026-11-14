type Entry = { area: 'local' | 'session'; key: string; value: string | null }
const projectKeys = ['syoumei.mock.scenes', 'syoumei.scenes', 'tomoshibi.workspace.handoff.v1', 'tomoshibi.mock.workspace.v1']
export function captureBrowserProjects(): Entry[] {
  return (['local', 'session'] as const).flatMap(area => {
    const storage = area === 'local' ? localStorage : sessionStorage
    return projectKeys.flatMap(key => {
      const value = storage.getItem(key)
      // アカウントの編集中キャッシュは、ログイン前のプロジェクトとは別に保持する。
      if (key === 'tomoshibi.mock.workspace.v1' && value && JSON.parse(value).activeCloudProject) return []
      return [{ area, key, value }]
    })
  })
}
export function clearBrowserProjects(snapshot: Entry[]) {
  for (const entry of snapshot) {
    const storage = entry.area === 'local' ? localStorage : sessionStorage
    if (storage.getItem(entry.key) !== entry.value) throw new Error('ブラウザ内のプロジェクトが更新されています。保存したプロジェクトはアカウントにあります。残す内容をもう一度確認してください。')
  }
  for (const entry of snapshot) (entry.area === 'local' ? localStorage : sessionStorage).removeItem(entry.key)
}
