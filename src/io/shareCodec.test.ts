import { describe, expect, it } from 'vitest'
import { decodeShare, encodeShare, packScenes, roundNumbers, unpackScenes, sharePayloadFromHash, shareURL, toShareScene } from './shareCodec'
import type { SerializedScene } from './sceneIO'
import type { Fixture, Performer, PlanScene } from '../store'

/** 縮めない形（j）の本体を作る */
const b64url = (text: string) => btoa(String.fromCharCode(...new TextEncoder().encode(text)))
  .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')

const fixture = (intensity: number): Fixture => ({
  id: 'fx-1', name: 'SS 1', presetKey: 'ellipsoidal', position: [1.23456, 7.5, -2.0000001], target: [0, 0, 0],
  beamAngleDeg: 26, intensity, color: [1, .8, .6], gelEnabled: false, whiteMix: 0, colorTempK: 3200, rotationZDeg: 0, enabled: true,
} as Fixture)

const performer = (onStage: boolean, x: number): Performer => ({
  id: 'pf-1', name: '鬼', position: [x, 0, -1], onStage, scale: 1, color: '#a33', pose: 'standing',
  entryVia: 'kami-2', exitVia: 'kyakuseki',
} as Performer)

const scene = (id: string, extra: Partial<PlanScene> = {}): PlanScene => ({
  id, title: id, trigger: 'きっかけ', note: '演出家のメモ', legacySourceKey: 'old',
  fixtures: [fixture(.8)], performers: [performer(true, 1)], setPieces: [], ...extra,
})

const sample = (): SerializedScene => ({
  version: 2, name: 'x', savedAt: '2026-11-23T00:00:00.000Z',
  fixtures: [fixture(1)], performers: [performer(true, 0)], setPieces: [],
  productionPlan: {
    title: '', projectTitle: '赤鬼', scenes: [
      scene('sc-1', { look: { hazeDensity: .3 } }),
      scene('sc-2', { fadeSec: 8, performers: [performer(false, 2)] }),
    ], activeSceneId: 'sc-2', lockOverrides: { 'fixture:fx-1': true },
    venueLayout: { stageShape: 'proscenium', stageWidth: 16, stageDepth: 12, targetCapacity: 0 },
  },
  settings: { hazeDensity: .2, quality: 'ultra', cameraView: 'aerial' },
})

describe('toShareScene', () => {
  it('メモ・固定の上書き・品質を落とし、最初のシーンから始める', () => {
    const shared = toShareScene(sample())
    const plan = shared.productionPlan!
    expect(plan.scenes.map(item => item.note)).toEqual(['', ''])
    expect(plan.scenes.some(item => 'legacySourceKey' in item)).toBe(false)
    expect(plan.lockOverrides).toBeUndefined()
    expect(plan.activeSceneId).toBe('sc-1')
    expect(shared.settings.quality).toBeUndefined()
    expect(shared.settings.cameraView).toBe('aerial')
    expect(shared.fixtures).toEqual([])
  })

  it('出ハケ・切り替えの時間・シーンの見え方は残す', () => {
    const plan = toShareScene(sample()).productionPlan!
    expect(plan.scenes[1].fadeSec).toBe(8)
    expect(plan.scenes[1].performers[0]).toMatchObject({ onStage: false, entryVia: 'kami-2', exitVia: 'kyakuseki' })
    expect(plan.scenes[0].look).toEqual({ hazeDensity: .3 })
    expect(plan.projectTitle).toBe('赤鬼')
  })

  it('数は 3 桁に丸める', () => {
    expect(toShareScene(sample()).productionPlan!.scenes[0].fixtures[0].position).toEqual([1.235, 7.5, -2])
    expect(roundNumbers({ a: [0.12345, 'x', undefined], b: undefined })).toEqual({ a: [0.123, 'x', undefined] })
  })
})

describe('encodeShare / decodeShare', () => {
  it('縮めて URL に入れられる文字だけにし、元に戻せる', async () => {
    const shared = toShareScene(sample())
    const payload = await encodeShare(shared)
    expect(payload[0]).toBe('z')
    expect(payload).toMatch(/^[A-Za-z0-9_-]+$/)
    expect(await decodeShare(payload)).toEqual(shared)
  })

  it('繰り返しの多いプランはよく縮む', async () => {
    const many = sample()
    many.productionPlan!.scenes = Array.from({ length: 40 }, (_, i) => scene(`sc-${i}`))
    const shared = toShareScene(many)
    const payload = await encodeShare(shared)
    expect(payload.length).toBeLessThan(JSON.stringify(shared).length / 5)
  })

  it('縮めていない形（j）も読める', async () => {
    const shared = toShareScene(sample())
    const raw = b64url(JSON.stringify(shared))
    expect(await decodeShare('j' + raw)).toEqual(shared)
  })

  it('壊れた URL・シーンの無い中身は読まない', async () => {
    await expect(decodeShare('xabc')).rejects.toThrow()
    await expect(decodeShare('zAAAA')).rejects.toThrow()
    const empty = b64url(JSON.stringify({ productionPlan: { scenes: [] } }))
    await expect(decodeShare('j' + empty)).rejects.toThrow('シーンがありません')
  })
})

describe('packScenes / unpackScenes', () => {
  it('2 つ目からのシーンは変わった所だけを書き、元に戻せる', () => {
    const shared = toShareScene(sample())
    // 2 つ目のシーン: 役者の出入り口を消し、新しい器具を足す
    const second = shared.productionPlan!.scenes[1]
    const { entryVia: _entry, ...withoutEntry } = second.performers[0]
    second.performers = [withoutEntry as Performer]
    second.fixtures = [...second.fixtures, { ...fixture(.5), id: 'fx-2' }]
    const packed = packScenes(shared)
    const packedSecond = packed.productionPlan!.scenes[1]
    expect(packedSecond.fixtures[0]).toEqual({ id: 'fx-1' })
    expect(packedSecond.fixtures[1]).toMatchObject({ id: 'fx-2', presetKey: 'ellipsoidal' })
    expect(packedSecond.performers[0]).toEqual({ id: 'pf-1', onStage: false, position: [2, 0, -1], '$-': ['entryVia'] })
    expect(unpackScenes(JSON.parse(JSON.stringify(packed)))).toEqual(shared)
  })
})

describe('URL', () => {
  it('ハッシュの #play= だけを共有として扱う', () => {
    expect(sharePayloadFromHash('#play=zAbc-_9')).toBe('zAbc-_9')
    expect(sharePayloadFromHash('#scene=abc')).toBeNull()
    expect(sharePayloadFromHash('')).toBeNull()
    expect(shareURL('https://tomoshibi.gikyokutosyokan.com', 'zAbc'))
      .toBe('https://tomoshibi.gikyokutosyokan.com/studio/#play=zAbc')
  })
})
