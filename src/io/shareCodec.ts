// 「通しで見る」の共有 URL（/studio/#play=...）の中身を作る・読む。
// サーバーには何も置かない。プランの JSON を縮めて URL のハッシュに入れる（ハッシュはサーバーへ送られない）。
//
// 形式: `#play=<版><本体>`
//   版 'z' … JSON を deflate-raw で縮め、base64url にしたもの（ふつうはこれ）
//   版 'j' … 縮めずに JSON を base64url にしたもの（CompressionStream の無い古いブラウザで作ったとき）
import type { SerializedScene } from './sceneIO'

export const SHARE_HASH_KEY = 'play'

/** 共有に入れない中身を落とし、数を丸めて短くする */
export function toShareScene(scene: SerializedScene): SerializedScene {
  const plan = scene.productionPlan
  const scenes = (plan?.scenes ?? []).map(item => {
    // シーンのメモは演出家の手元の覚え書き。通しで見るの画面には出ないので、共有には入れない
    const { note: _note, legacySourceKey: _legacy, ...rest } = item
    return { ...rest, note: '' }
  })
  const { lockOverrides: _locks, ...planRest } = plan ?? { title: '', scenes: [], activeSceneId: null }
  return roundNumbers({
    version: 2,
    name: 'shared',
    savedAt: scene.savedAt,
    // 舞台の中身はシーンの側にある（読み込むと最初のシーンから始まる）
    fixtures: [],
    performers: [],
    setPieces: [],
    productionPlan: { ...planRest, scenes, activeSceneId: scenes[0]?.id ?? null },
    settings: {
      hazeDensity: scene.settings.hazeDensity,
      ambient: scene.settings.ambient,
      exposure: scene.settings.exposure,
      bloom: scene.settings.bloom,
      showHouseLights: scene.settings.showHouseLights,
      cameraView: scene.settings.cameraView,
      // 描く品質は、開いた人の端末に合わせる（入れない）
    },
  })
}

/** 小数を 3 桁（mm・0.001 の明るさ）に丸める。見た目は変わらず、URL が短くなる */
export function roundNumbers<T>(value: T): T {
  if (typeof value === 'number') return (Number.isFinite(value) ? Math.round(value * 1000) / 1000 : value) as T
  if (Array.isArray(value)) return value.map(item => roundNumbers(item)) as T
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value)
      .filter(([, item]) => item !== undefined)
      .map(([key, item]) => [key, roundNumbers(item)])) as T
  }
  return value
}

function toBase64Url(bytes: Uint8Array): string {
  let binary = ''
  for (let i = 0; i < bytes.length; i += 0x8000) binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000))
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

function fromBase64Url(text: string): Uint8Array {
  const base64 = text.replace(/-/g, '+').replace(/_/g, '/')
  const binary = atob(base64 + '='.repeat((4 - base64.length % 4) % 4))
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
  return bytes
}

async function pipe(bytes: Uint8Array, stream: GenericTransformStream): Promise<Uint8Array> {
  const output = new Blob([bytes as BlobPart]).stream().pipeThrough(stream as unknown as TransformStream<Uint8Array, Uint8Array>)
  return new Uint8Array(await new Response(output).arrayBuffer())
}

const canCompress = () => typeof CompressionStream === 'function' && typeof DecompressionStream === 'function'

// ---- シーンどうしの差分 ----
// 2 つ目からのシーンの照明・役者・セットは、前のシーンの同じ id の物から変わった所だけを書く。
// 多くのシーンで同じ器具が同じ所に吊ってあるので、縮める前に半分以下になる
type Entity = { id: string } & Record<string, unknown>
const ENTITY_KEYS = ['fixtures', 'performers', 'setPieces'] as const
/** 差分で消えた項目の名前（前のシーンにはあったが、このシーンには無い） */
const REMOVED = '$-'

function diffEntities(previous: Entity[], current: Entity[]): Entity[] {
  const before = new Map(previous.map(item => [item.id, item]))
  return current.map(item => {
    const old = before.get(item.id)
    if (!old) return item
    const diff: Entity = { id: item.id }
    for (const [key, value] of Object.entries(item))
      if (key !== 'id' && JSON.stringify(value) !== JSON.stringify(old[key])) diff[key] = value
    const removed = Object.keys(old).filter(key => !(key in item))
    if (removed.length) diff[REMOVED] = removed
    return diff
  })
}

function patchEntities(previous: Entity[], packed: Entity[]): Entity[] {
  const before = new Map(previous.map(item => [item.id, item]))
  return packed.map(item => {
    const old = before.get(item.id)
    if (!old) return item
    const { [REMOVED]: removed, ...changes } = item
    const next: Entity = { ...old, ...changes }
    if (Array.isArray(removed)) for (const key of removed) delete next[key as string]
    return next
  })
}

type Packed = SerializedScene & { packed?: 1 }

export function packScenes(scene: SerializedScene): Packed {
  const scenes = scene.productionPlan?.scenes
  if (!scenes?.length) return scene
  return {
    ...scene, packed: 1,
    productionPlan: {
      ...scene.productionPlan!,
      scenes: scenes.map((item, index) => index === 0 ? item : {
        ...item,
        ...Object.fromEntries(ENTITY_KEYS.map(key => [key,
          diffEntities(scenes[index - 1][key] as unknown as Entity[], item[key] as unknown as Entity[])])),
      }),
    },
  }
}

export function unpackScenes(packed: Packed): SerializedScene {
  const { packed: flag, ...scene } = packed
  const scenes = scene.productionPlan?.scenes
  if (flag !== 1 || !Array.isArray(scenes)) return scene
  const restored: typeof scenes = []
  scenes.forEach((item, index) => {
    restored.push(index === 0 ? item : {
      ...item,
      ...Object.fromEntries(ENTITY_KEYS.map(key => [key, patchEntities(
        restored[index - 1][key] as unknown as Entity[],
        Array.isArray(item[key]) ? item[key] as unknown as Entity[] : [])])),
    })
  })
  return { ...scene, productionPlan: { ...scene.productionPlan!, scenes: restored } }
}

/** 共有の中身を、URL のハッシュに入れる文字列にする */
export async function encodeShare(scene: SerializedScene): Promise<string> {
  const json = new TextEncoder().encode(JSON.stringify(packScenes(scene)))
  if (!canCompress()) return 'j' + toBase64Url(json)
  return 'z' + toBase64Url(await pipe(json, new CompressionStream('deflate-raw')))
}

/** 共有の文字列から中身を戻す。壊れていれば例外を投げる */
export async function decodeShare(payload: string): Promise<SerializedScene> {
  const kind = payload[0]
  const body = fromBase64Url(payload.slice(1))
  let json: Uint8Array
  if (kind === 'z') {
    if (!canCompress()) throw new Error('このブラウザでは共有 URL を開けません')
    json = await pipe(body, new DecompressionStream('deflate-raw'))
  } else if (kind === 'j') json = body
  else throw new Error('共有 URL の形式が違います')
  const parsed = JSON.parse(new TextDecoder().decode(json)) as Packed
  if (!parsed || typeof parsed !== 'object' || !Array.isArray(parsed.productionPlan?.scenes) || !parsed.productionPlan.scenes.length)
    throw new Error('共有 URL にシーンがありません')
  return unpackScenes(parsed)
}

/** URL のハッシュから共有の文字列を取り出す。無ければ null */
export function sharePayloadFromHash(hash: string): string | null {
  const match = hash.match(new RegExp(`^#${SHARE_HASH_KEY}=([A-Za-z0-9_-]+)`))
  return match ? match[1] : null
}

export function shareURL(origin: string, payload: string): string {
  return `${origin}/studio/#${SHARE_HASH_KEY}=${payload}`
}
