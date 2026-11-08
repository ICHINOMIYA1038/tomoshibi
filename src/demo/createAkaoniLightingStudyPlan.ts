import { useStore, type Fixture, type PlanScene } from '../store'
import { createAkaoniWashPlan } from './createAkaoniWashPlan'
import { MEASURED_FRESNEL_KEY } from '../photometric/measuredFresnel'
import { MEASURED_CYC_KEY } from '../photometric/measuredCyc'

const SEA_NAMES = new Set(['海の面明かり・下手', '海の面明かり・中央', '海の面明かり・上手'])
const FRONT_NAMES = new Set(['あの女の前明かり', '浜の人物の前明かり', '赤鬼の前明かり'])

function reviseFixture(fixture: Fixture, scene: PlanScene): Fixture {
  if (FRONT_NAMES.has(fixture.name)) {
    const performerName = fixture.name === 'あの女の前明かり' ? 'あの女'
      : fixture.name === '赤鬼の前明かり' ? '赤鬼' : 'ミズカネ'
    const performer = scene.performers.find(person => person.name === performerName)
    return {
      ...fixture,
      presetKey: 'Source4_26',
      target: performer ? [performer.position[0], 1.7, performer.position[2]] : fixture.target,
      beamAngleDeg: 23,
      intensity: fixture.intensity * 0.06,
    }
  }
  if (scene.title === '花のしるし' && fixture.name.startsWith('地明かり・')) {
    return { ...fixture, intensity: fixture.intensity * 0.7 }
  }
  return fixture
}

export function createAkaoniLightingStudyPlan() {
  createAkaoniWashPlan()
  useStore.setState(state => {
    const scenes: PlanScene[] = state.productionPlan.scenes.map(scene => ({
      ...scene,
      fixtures: scene.fixtures.map(fixture => {
        const withDistribution: Fixture = fixture.name.startsWith('地明かり・')
          ? { ...fixture, photometricProfile: MEASURED_FRESNEL_KEY }
          : SEA_NAMES.has(fixture.name) ? {
            ...fixture,
            presetKey: 'CycWashStudy',
            photometricProfile: MEASURED_CYC_KEY,
            position: [fixture.position[0], 6.6, -2.5],
            target: [fixture.target[0], 3.45, -7.6],
            beamAngleDeg: 40,
            intensity: fixture.intensity * 0.72,
          } : fixture
        return reviseFixture(withDistribution, scene)
      }),
    }))
    const active = scenes.find(scene => scene.id === state.productionPlan.activeSceneId)!
    return {
      productionPlan: {
        ...state.productionPlan,
        projectTitle: '赤鬼｜測光配光の照明試作',
        scenes,
      },
      fixtures: active.fixtures,
    }
  })
}
