import { useStore, type Fixture, type PlanScene } from '../store'
import { createAkaoniWashPlan } from './createAkaoniWashPlan'
import { MEASURED_FRESNEL_KEY } from '../photometric/measuredFresnel'
import { MEASURED_CYC_KEY } from '../photometric/measuredCyc'

const SEA_NAMES = new Set(['海の面明かり・下手', '海の面明かり・中央', '海の面明かり・上手'])
const FRONT_NAMES = new Set(['あの女の前明かり', '浜の人物の前明かり', '赤鬼の前明かり'])
const GROUND_POWER_SCALE = 1.29

function reviseFixture(fixture: Fixture, scene: PlanScene): Fixture {
  if (FRONT_NAMES.has(fixture.name)) {
    const performerName = fixture.name === 'あの女の前明かり' ? 'あの女'
      : fixture.name === '赤鬼の前明かり' ? '赤鬼' : 'ミズカネ'
    const performer = scene.performers.find(person => person.name === performerName)
    return {
      ...fixture,
      presetKey: 'Source4_19',
      target: performer ? [performer.position[0], 1.7, performer.position[2]] : fixture.target,
      beamAngleDeg: 17,
      intensity: fixture.intensity * 0.015,
    }
  }
  if (fixture.name === '赤鬼の輪郭') {
    return {
      ...fixture,
      presetKey: 'ETC_S4LED_Lustr_26',
      target: [fixture.target[0], 1.7, fixture.target[2]],
      beamAngleDeg: 23,
      intensity: fixture.intensity * 0.025,
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
    const scenes: PlanScene[] = state.productionPlan.scenes.map(scene => {
      const ground = scene.fixtures.filter(fixture => fixture.name.startsWith('地明かり・'))
      const fixtures = scene.fixtures.map(fixture => {
        const frontGround = fixture.name.includes('手前')
        const withDistribution: Fixture = fixture.name.startsWith('地明かり・')
          ? {
            ...fixture,
            photometricProfile: MEASURED_FRESNEL_KEY,
            target: [Math.sign(fixture.position[0]) * (frontGround ? 3.5 : 3), 1, frontGround ? -2 : -5],
            beamAngleDeg: 44,
            intensity: fixture.intensity * GROUND_POWER_SCALE,
          }
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
      })
      const template = ground.find(fixture => fixture.name === '地明かり・手前下手')!
      fixtures.push({
        ...template,
        id: 'f-ground-center-study',
        name: '地明かり・中央',
        photometricProfile: MEASURED_FRESNEL_KEY,
        position: [0, 6.8, 0.2],
        target: [0, 1, -2],
        beamAngleDeg: 44,
        intensity: ground.reduce((sum, fixture) => sum + fixture.intensity, 0) * 0.2 * GROUND_POWER_SCALE * 0.7 * (scene.title === '花のしるし' ? 0.7 : 1),
      })
      return {
        ...scene,
        fixtures,
        setPieces: scene.setPieces.map(piece => piece.name === '浜の地面'
          ? { ...piece, position: [0, 0.01, -2.25], size: [12, 0.02, 7.5] }
          : piece),
      }
    })
    const active = scenes.find(scene => scene.id === state.productionPlan.activeSceneId)!
    return {
      productionPlan: {
        ...state.productionPlan,
        projectTitle: '赤鬼｜測光配光の照明試作',
        scenes,
      },
      fixtures: active.fixtures,
      setPieces: active.setPieces,
    }
  })
}
