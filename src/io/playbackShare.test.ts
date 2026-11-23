import { describe, expect, it } from 'vitest'
import { exportScene, importScene } from './sceneIO'
import { decodeShare, encodeShare, toShareScene } from './shareCodec'
import { useStore } from '../store'
import { createSampleProduction } from '../demo/createSampleProduction'

describe('作例（/studio/?demo=2）の共有', () => {
  it('URL に入れて読み込むと、全シーン・出ハケ・切り替えの時間が同じになる', async () => {
    createSampleProduction()
    const before = exportScene('x').productionPlan!
    const payload = await encodeShare(toShareScene(exportScene('x')))
    console.log(`作例の共有 URL の中身: ${payload.length} 文字（シーン ${before.scenes.length}）`)
    expect(payload.length).toBeLessThan(16000)

    useStore.setState({ productionPlan: { title: '', scenes: [], activeSceneId: null } })
    importScene(await decodeShare(payload))
    const after = useStore.getState().productionPlan
    expect(after.scenes.map(item => item.title)).toEqual(before.scenes.map(item => item.title))
    expect(after.scenes.map(item => item.fadeSec)).toEqual(before.scenes.map(item => item.fadeSec))
    expect(after.scenes.map(item => item.performers.map(p => [p.id, p.onStage, p.entryVia, p.exitVia])))
      .toEqual(before.scenes.map(item => item.performers.map(p => [p.id, p.onStage, p.entryVia, p.exitVia])))
    expect(after.scenes.map(item => item.fixtures.map(f => f.intensity)))
      .toEqual(before.scenes.map(item => item.fixtures.map(f => Math.round(f.intensity * 1000) / 1000)))
    expect(after.activeSceneId).toBe(after.scenes[0].id)
  })
})
