import type { SerializedScene } from './sceneIO'

type RecordState = { seen: string[]; imported: string[] }
const fallback = new Map<string, RecordState>()
function read(userId: string): RecordState {
  try {
    const data = JSON.parse(localStorage.getItem(`tomoshibi.transfer.v2.${userId}`) || 'null')
    if (Array.isArray(data?.seen) && Array.isArray(data?.imported)) return data
  } catch {}
  return fallback.get(userId) ?? { seen: [], imported: [] }
}
function write(userId: string, data: RecordState) {
  fallback.set(userId, data)
  try { localStorage.setItem(`tomoshibi.transfer.v2.${userId}`, JSON.stringify(data)) } catch {}
}
async function hash(value: unknown) {
  const bytes = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(JSON.stringify(value)))
  return Array.from(new Uint8Array(bytes), byte => byte.toString(16).padStart(2, '0')).join('')
}
export async function transferFingerprint(scene: SerializedScene) {
  const { savedAt: _savedAt, ...content } = scene
  return hash(content)
}
export async function pendingTransfers(userId: string, scenes: SerializedScene[], origins: (string | null | undefined)[]) {
  const state = read(userId)
  const candidates = await Promise.all(scenes.map(async scene => ({ scene, fingerprint: await transferFingerprint(scene), legacy: await hash(scene) })))
  return candidates.filter(item => !state.imported.includes(item.fingerprint)
    && !origins.includes(`local-import:${item.fingerprint}`) && !origins.includes(`local-import:${item.legacy}`))
}
export function hasUnseenTransfers(userId: string, fingerprints: string[]) {
  const seen = read(userId).seen
  return fingerprints.some(fingerprint => !seen.includes(fingerprint))
}
export function acknowledgeTransfers(userId: string, fingerprints: string[]) {
  const state = read(userId)
  write(userId, { ...state, seen: [...new Set([...state.seen, ...fingerprints])] })
}
export function recordTransferred(userId: string, fingerprint: string) {
  const state = read(userId)
  write(userId, { seen: [...new Set([...state.seen, fingerprint])], imported: [...new Set([...state.imported, fingerprint])] })
}
