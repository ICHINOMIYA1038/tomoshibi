import { useStore, type Fixture, type PlanScene } from '../store'
import { createAkaoniWashPlan } from './createAkaoniWashPlan'
import { MEASURED_FRESNEL_KEY } from '../photometric/measuredFresnel'
import { MEASURED_CYC_KEY } from '../photometric/measuredCyc'

const SEA_NAMES = new Set(['海の面明かり・下手', '海の面明かり・中央', '海の面明かり・上手'])
const FRONT_NAMES = new Set(['あの女の前明かり', '浜の人物の前明かり', '赤鬼の前明かり'])
const GROUND_NAMES = ['地明かり・手前下手', '地明かり・手前上手', '地明かり・奥下手', '地明かり・奥上手'] as const
const GROUND_CUES: Record<string, [number, number, number, number, number]> = {
  '波のあと': [0.25, 0.24, 0.16, 0.16, 0.10],
  '浜に現れた影': [0.17, 0.24, 0.08, 0.20, 0.08],
  '境目で足を止める': [0.08, 0.13, 0.04, 0.10, 0.18],
  '花のしるし': [0.06, 0.07, 0.03, 0.05, 0.22],
  '洞窟で向き合う': [0.08, 0.015, 0.15, 0.015, 0.04],
  '海の向こうへ': [0.01, 0.01, 0.03, 0.03, 0.045],
}
const AREA_CUES: Record<string, [number, number, number]> = {
  '波のあと': [0.10, 0.10, 0],
  '浜に現れた影': [0.08, 0.08, 0],
  '境目で足を止める': [0.025, 0.03, 0.08],
  '花のしるし': [0.02, 0.02, 0.10],
  '洞窟で向き合う': [0.08, 0.015, 0],
  '海の向こうへ': [0.05, 0.05, 0.035],
}
const SCENE_NOTES: Record<string, string> = {
  '浜に現れた影': '赤鬼が海側から現れ、ミズカネは上手へ退く。上手の地明かりを増やし、赤鬼だけを狙う灯りは使わない。',
  '境目で足を止める': '赤鬼は海との境目に止まり、あの女だけ一歩近づく。二人のいる中央の面を広く照らし、周囲は落とす。',
  '花のしるし': 'あの女と赤鬼が中央へ近づく。中央の地明かりと前明かりを重ね、赤い布と二人を同じ面の中で見せる。',
  '洞窟で向き合う': '洞窟の口を二つの岩で示す。あの女と赤鬼を内側に、ミズカネととんびを外側に置く。下手の地明かりと前明かりで内側を広く見せる。',
  '海の向こうへ': '四人が舟に乗る。浜の地明かりを弱め、海の青と舟の輪郭を残す。人物の面を弱い前明かりで支える。',
}

function areaTarget(sceneTitle: string, area: 'left' | 'right' | 'center'): Fixture['target'] {
  if (sceneTitle === '海の向こうへ') {
    return [area === 'center' ? 0 : area === 'left' ? -1 : 1, 1.5, -5.5]
  }
  if (area === 'center') {
    return sceneTitle === '花のしるし' ? [0.9, 1.6, -2.7] : [1.2, 1.6, -3.6]
  }
  if (sceneTitle === '洞窟で向き合う') {
    return [area === 'left' ? -3.4 : -0.2, 1.5, -4.2]
  }
  return [area === 'left' ? -3 : 3, 1.5, -3]
}

function reviseFixture(fixture: Fixture, scene: PlanScene): Fixture {
  if (FRONT_NAMES.has(fixture.name)) {
    const area = fixture.name === 'あの女の前明かり' ? 'left'
      : fixture.name === '赤鬼の前明かり' ? 'center' : 'right'
    const intensity = AREA_CUES[scene.title]?.[area === 'left' ? 0 : area === 'right' ? 1 : 2] ?? 0
    return {
      ...fixture,
      name: area === 'center' ? '前明かり・中央の面' : area === 'left' ? '前明かり・下手の面' : '前明かり・上手の面',
      presetKey: 'Fresnel10',
      photometricProfile: MEASURED_FRESNEL_KEY,
      target: areaTarget(scene.title, area),
      beamAngleDeg: area === 'center' ? 36 : 44,
      intensity,
      enabled: intensity > 0,
    }
  }
  if (fixture.name === 'とんびの補助明かり') {
    return { ...fixture, enabled: false }
  }
  if (fixture.name === '赤鬼の輪郭') {
    return { ...fixture, enabled: false }
  }
  if (scene.title === '洞窟で向き合う' && fixture.name === '洞窟の内側') {
    return { ...fixture, enabled: false }
  }
  if (scene.title === '海の向こうへ' && fixture.name === '舟の逆光') {
    return { ...fixture, enabled: false }
  }
  return fixture
}

export function createAkaoniLightingStudyPlan() {
  createAkaoniWashPlan()
  useStore.setState(state => {
    const scenes: PlanScene[] = state.productionPlan.scenes.map(scene => {
      const ground = scene.fixtures.filter(fixture => fixture.name.startsWith('地明かり・'))
      const levels = GROUND_CUES[scene.title]
      const fixtures = scene.fixtures.map(fixture => {
        const frontGround = fixture.name.includes('手前')
        const groundIndex = GROUND_NAMES.indexOf(fixture.name as typeof GROUND_NAMES[number])
        const withDistribution: Fixture = fixture.name.startsWith('地明かり・')
          ? {
            ...fixture,
            photometricProfile: MEASURED_FRESNEL_KEY,
            target: [Math.sign(fixture.position[0]) * (frontGround ? 3.5 : 3), 1, frontGround ? -2 : -5],
            beamAngleDeg: 44,
            intensity: levels && groundIndex >= 0 ? levels[groundIndex] : fixture.intensity,
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
        intensity: levels?.[4] ?? 0.1,
      })
      return {
        ...scene,
        fixtures,
        note: SCENE_NOTES[scene.title] ?? scene.note,
        setPieces: scene.setPieces.map(piece => piece.name === '浜の地面'
          ? { ...piece, position: [0, 0.01, -2], size: [16, 0.02, 12], color: '#625e57' }
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
