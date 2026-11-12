import { useStore, type Fixture, type PlanScene } from '../store'
import { createAkaoniPlan } from './createAkaoniPlan'

const PROJECT_TITLE = '赤鬼｜浜辺の演出案・改訂'
const SEA_COLOR: [number, number, number] = [0.28, 0.43, 0.55]

function seaWash(fixture: Fixture, name: string, x: number, intensity: number): Fixture {
  return {
    ...fixture,
    name,
    position: [x, 6.8, -6],
    target: [x, 2.2, -7.2],
    beamAngleDeg: 30,
    intensity,
    color: SEA_COLOR,
    whiteMix: 0,
    enabled: true,
  }
}

export function createAkaoniWashPlan() {
  createAkaoniPlan()
  const store = useStore.getState()
  const plan = store.productionPlan
  const arrival = plan.scenes.find(scene => scene.title === '浜に現れた影')!
  const flower = plan.scenes.find(scene => scene.title === '花のしるし')!
  const shoreChapter = plan.chapters![0].id
  const woman = store.performers.find(person => person.name === 'あの女')!.id
  const demon = store.performers.find(person => person.name === '赤鬼')!.id
  const womanFront = store.fixtures.find(fixture => fixture.name === 'あの女の前明かり')!.id
  const demonFront = store.fixtures.find(fixture => fixture.name === '赤鬼の前明かり')!.id
  const demonRim = store.fixtures.find(fixture => fixture.name === '赤鬼の輪郭')!.id

  const pause = store.addSceneAt(shoreChapter, flower.id)!
  store.updatePerformer(woman, { position: [0.6, 0, -3] })
  store.updatePerformer(demon, { position: [2.2, 0, -4.1] })
  store.updateFixture(womanFront, { target: [0.6, 1.35, -3], intensity: 0.52 })
  store.updateFixture(demonFront, { target: [2.2, 1.35, -4.1], intensity: 0.28 })
  store.updateFixture(demonRim, { target: [2.2, 1.3, -4.1], intensity: 0.16 })
  store.updateScene(pause, {
    title: '境目で足を止める', triggerType: 'sound', trigger: '足音が止まる',
    note: '赤鬼は海との境目に止まり、あの女だけ一歩近づく。二人の間の余白を残し、赤い輪郭は弱める。',
  })
  store.selectScene(arrival.id)

  const centerSeaId = store.addFixture('Chauvet_COLORado2Solo', [0, 6.8, -6])
  const tonbiFrontId = store.addFixture('Fresnel8', [-5.8, 5.8, 1.4])
  const current = useStore.getState()
  const centerSea = current.fixtures.find(fixture => fixture.id === centerSeaId)!
  const tonbiFront = current.fixtures.find(fixture => fixture.id === tonbiFrontId)!
  const originalSeaId = current.fixtures.find(fixture => fixture.name === '海の奥行き')!.id
  const clothLightId = current.fixtures.find(fixture => fixture.name === '赤い布の明かり')!.id

  const scenes: PlanScene[] = current.productionPlan.scenes.map(scene => {
    const originalSea = scene.fixtures.find(fixture => fixture.id === originalSeaId)!
    const base = originalSea.intensity
    const fixtures = scene.fixtures.map(fixture => {
      if (fixture.id === originalSeaId) return seaWash(fixture, '海の面明かり・下手', -3.3, base * 0.6)
      if (fixture.id === clothLightId) return seaWash(fixture, '海の面明かり・上手', 3.3, base * 0.6)
      return fixture
    })
    fixtures.push(seaWash(centerSea, '海の面明かり・中央', 0, base * 0.8))
    fixtures.push({
      ...tonbiFront,
      name: 'とんびの補助明かり',
      position: [-5.8, 5.8, 1.4],
      target: [-4.2, 1.5, -2.8],
      beamAngleDeg: 20,
      intensity: 0.12,
      gelEnabled: false,
      enabled: scene.title === '境目で足を止める' || scene.title === '花のしるし',
    })
    const note = scene.title === '花のしるし'
      ? 'あの女と赤鬼が中央へ近づく。赤い布は二人の前明かりで見せ、床の円形の光だまりを抑える。'
      : scene.note
    return { ...scene, fixtures, note }
  })
  const active = scenes.find(scene => scene.id === current.productionPlan.activeSceneId)!
  useStore.setState(state => ({
    productionPlan: { ...state.productionPlan, projectTitle: PROJECT_TITLE, scenes },
    fixtures: active.fixtures,
    performers: active.performers,
    setPieces: active.setPieces,
    selection: { kind: null, id: null },
  }))
}
