import type { Fixture, PlanScene, ProductionPlan } from './store'

// 照明の「仕込み」（吊る位置・機種・名前・吊るバトン）は全シーンで 1 つ。
// 点く・消える、明るさ、色、狙いなどはシーンごと（キュー）。
// データはこれまでどおりシーンごとに照明の写しを持ち、いまのシーンの仕込みをほかのシーンへ写して揃える。

export const SHARED_FIXTURE_KEYS = ['position', 'presetKey', 'name', 'parentId', 'battenId', 'rotationZDeg'] as const
type Shared = Pick<Fixture, typeof SHARED_FIXTURE_KEYS[number]>

function sharedOf(fixture: Fixture): Shared {
  return {
    position: [...fixture.position] as Fixture['position'],
    presetKey: fixture.presetKey,
    name: fixture.name,
    parentId: fixture.parentId,
    battenId: fixture.battenId,
    rotationZDeg: fixture.rotationZDeg,
  }
}

function copyFixture(fixture: Fixture): Fixture {
  return { ...fixture, position: [...fixture.position], target: [...fixture.target], color: [...fixture.color] }
}

/**
 * いまのシーンの照明の仕込みを、ほかのすべてのシーンへ写す。
 * - いまのシーンで足した照明は、ほかのシーンでは消えた状態で足す
 * - いまのシーンで消した（削除した）照明は、ほかのシーンからも消す
 * - 位置・機種・名前などは、いまのシーンの値にする。明るさや狙いは各シーンのまま
 */
export function propagateRig(plan: ProductionPlan, activeFixtures: Fixture[]): ProductionPlan {
  if (!plan.activeSceneId) return plan
  return {
    ...plan,
    scenes: plan.scenes.map(scene => {
      if (scene.id === plan.activeSceneId) return scene
      const own = new Map(scene.fixtures.map(fixture => [fixture.id, fixture]))
      return {
        ...scene,
        fixtures: activeFixtures.map(master => {
          const mine = own.get(master.id)
          return mine ? { ...mine, ...sharedOf(master) } : { ...copyFixture(master), enabled: false }
        }),
      }
    }),
  }
}

const key = (fixture: Fixture) => [
  fixture.presetKey,
  ...fixture.position.map(value => Math.round(value * 100) / 100),
].join('|')

/**
 * 古いプランを、仕込みが全シーンで 1 つの形にする（開いたときに 1 回）。
 * 同じ照明でもシーンによって位置や機種が違うときは、違う分を別の照明に分ける。
 * 分けた照明は、もとのシーンでだけ使い、ほかのシーンでは消えた状態にする。どのシーンも見た目は変わらない
 */
export function unifyRig(scenes: PlanScene[]): PlanScene[] {
  if (scenes.length < 2) return scenes
  type Entry = { id: string; template: Fixture; variant: string; sourceId: string }
  const rig: Entry[] = []
  const usedIds = new Set(scenes.flatMap(scene => scene.fixtures.map(fixture => fixture.id)))
  const variantsOf = new Map<string, string[]>()
  // シーンごとの「照明 id → 仕込みの中の id」
  const mapping = scenes.map(scene => scene.fixtures.map(fixture => {
    const variants = variantsOf.get(fixture.id) ?? []
    let index = variants.indexOf(key(fixture))
    if (index < 0) {
      index = variants.length
      variants.push(key(fixture))
      variantsOf.set(fixture.id, variants)
      let id = fixture.id
      if (index > 0) {
        let n = index + 1
        while (usedIds.has(`${fixture.id}-${n}`)) n++
        id = `${fixture.id}-${n}`
        usedIds.add(id)
      }
      rig.push({ id, template: { ...copyFixture(fixture), id, name: index > 0 ? `${fixture.name}（${index + 1}）` : fixture.name }, variant: key(fixture), sourceId: fixture.id })
    }
    return rig.find(entry => entry.sourceId === fixture.id && entry.variant === key(fixture))!.id
  }))
  const alreadyUnified = rig.every(entry => entry.id === entry.sourceId) &&
    scenes.every(scene => scene.fixtures.length === rig.length)
  if (alreadyUnified) return scenes
  return scenes.map((scene, sceneIndex) => {
    const present = new Map(scene.fixtures.map((fixture, index) => [mapping[sceneIndex][index], fixture]))
    return {
      ...scene,
      fixtures: rig.map(entry => {
        const own = present.get(entry.id)
        return own ? { ...copyFixture(own), id: entry.id, name: entry.template.name } : { ...copyFixture(entry.template), enabled: false }
      }),
    }
  })
}
