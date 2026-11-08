import { useStore, type Fixture, type PlanScene } from '../store'
import { createRainLibraryPlan } from './createRainLibraryPlan'
import { areaWashFixture } from './areaWash'
import { MEASURED_CYC_KEY } from '../photometric/measuredCyc'

const GROUND_NAMES = ['下手の地明かり', '上手の地明かり', '舞台奥・下手の地明かり', '舞台奥・上手の地明かり'] as const
const GROUND_COLOR: Fixture['color'] = [1, 0.85, 0.72]

const GROUND_CUES: Record<string, [number, number, number, number, number]> = {
  '閉館前': [0.16, 0.06, 0.10, 0.04, 0.06],
  '遅い来訪者': [0.12, 0.18, 0.07, 0.10, 0.08],
  '返された本': [0.06, 0.06, 0.04, 0.04, 0.16],
  '雷鳴': [0, 0, 0, 0, 0],
  '余白の言葉': [0.06, 0.06, 0.04, 0.04, 0.14],
  '雨がやむ': [0.15, 0.15, 0.10, 0.10, 0.11],
  '本を持って出る': [0.07, 0.18, 0.04, 0.12, 0.07],
  '開館': [0.19, 0.19, 0.13, 0.13, 0.12],
}
const AREA_CUES: Record<string, [number, number, number]> = {
  '閉館前': [0.09, 0, 0.025],
  '遅い来訪者': [0.07, 0.09, 0.025],
  '返された本': [0.025, 0.025, 0.09],
  '雷鳴': [0, 0, 0],
  '余白の言葉': [0.025, 0.025, 0.08],
  '雨がやむ': [0.065, 0.065, 0.04],
  '本を持って出る': [0.025, 0.09, 0.025],
  '開館': [0.08, 0.04, 0.025],
}
const SCENE_NOTES: Record<string, string> = {
  '閉館前': '司書のいる下手と本を見せ、上手の窓は青く残す。',
  '遅い来訪者': '来訪者が上手から入る。上手の地明かりを広げ、司書と本も見失わない。',
  '返された本': '二人と机上の本を中央の同じ面の中で見せる。書架は落とす。',
  '雷鳴': '地明かりと前明かりを消す。窓と二人の輪郭を冷たい光で浮かべ、本と書架は暗くする。',
  '余白の言葉': '中央の地明かりと前明かりを戻し、二人と机上の本を見せる。',
  '雨がやむ': '左右の地明かりを広げ、窓の青から朝の暖色へ移る。',
  '本を持って出る': '上手へ向かう来訪者と本を見せ、下手の司書は弱く残す。',
  '開館': '来訪者と本は退場する。司書、机、書架、窓を朝の広い明かりで見せて終える。',
}
const WINDOW_CUES: Record<string, number> = {
  '閉館前': 0.10,
  '遅い来訪者': 0.10,
  '返された本': 0.09,
  '雷鳴': 0.15,
  '余白の言葉': 0.07,
  '雨がやむ': 0.05,
  '本を持って出る': 0.04,
  '開館': 0.015,
}

function groundTarget(name: string): Fixture['target'] {
  if (name === '下手の地明かり') return [-3.5, 1, -2]
  if (name === '上手の地明かり') return [3.5, 1, -2]
  if (name === '舞台奥・下手の地明かり') return [-3, 1, -5]
  return [3, 1, -5]
}

function reviseScene(scene: PlanScene): PlanScene {
  const groundLevels = GROUND_CUES[scene.title]
  const areaLevels = AREA_CUES[scene.title]
  const fixtures: Fixture[] = scene.fixtures.map((fixture): Fixture => {
    const groundIndex = GROUND_NAMES.indexOf(fixture.name as typeof GROUND_NAMES[number])
    if (groundIndex >= 0) {
      return areaWashFixture(fixture, {
        target: groundTarget(fixture.name),
        intensity: groundLevels[groundIndex],
        color: GROUND_COLOR,
      })
    }
    if (fixture.name === '司書の前明かり' || fixture.name === '来訪者の前明かり') {
      const left = fixture.name === '司書の前明かり'
      return areaWashFixture(fixture, {
        name: left ? '前明かり・下手の面' : '前明かり・上手の面',
        target: [left ? -2.5 : 2.5, 1.5, -2.4],
        intensity: areaLevels[left ? 0 : 1],
        color: GROUND_COLOR,
      })
    }
    if (fixture.name === '司書の輪郭' || fixture.name === '来訪者の輪郭') {
      return { ...fixture, enabled: false }
    }
    if (fixture.name === '書架の面明かり') return { ...fixture, enabled: false }
    if (fixture.name === '本と机の灯り') {
      return { ...fixture, intensity: fixture.intensity * 0.25 }
    }
    if (fixture.name === '窓からの雨明かり') {
      return {
        ...fixture,
        presetKey: 'CycWashStudy',
        photometricProfile: MEASURED_CYC_KEY,
        position: [4.2, 6.6, -2.5],
        target: [4.2, 3.45, -7.6],
        beamAngleDeg: 40,
        intensity: WINDOW_CUES[scene.title],
        enabled: true,
      }
    }
    if (fixture.name === '夜明けの逆光') {
      return {
        ...fixture,
        presetKey: 'CycWashStudy',
        photometricProfile: MEASURED_CYC_KEY,
        position: [0, 6.6, -2.5],
        target: [0, 3.45, -7.6],
        beamAngleDeg: 40,
        intensity: 0.06,
      }
    }
    return fixture
  })
  const groundTemplate = fixtures.find(fixture => fixture.name === '下手の地明かり')!
  const frontTemplate = fixtures.find(fixture => fixture.name === '前明かり・下手の面')!
  fixtures.push(areaWashFixture({
    ...groundTemplate,
    id: 'f-rain-ground-center-study',
    name: '地明かり・中央',
    position: [0, 6.8, 0.5],
  }, {
    target: [0, 1, -2.4], intensity: groundLevels[4], color: GROUND_COLOR,
  }))
  fixtures.push(areaWashFixture({
    ...frontTemplate,
    id: 'f-rain-front-center-study',
    name: '前明かり・中央の面',
    position: [0, 5.8, 1.4],
  }, {
    target: [0, 1.5, -2.3], intensity: areaLevels[2], beamAngleDeg: 36, color: GROUND_COLOR,
  }))
  return { ...scene, fixtures, note: SCENE_NOTES[scene.title] ?? scene.note }
}

export function createRainLibraryLightingStudyPlan() {
  createRainLibraryPlan()
  useStore.setState(state => {
    const scenes = state.productionPlan.scenes.map(reviseScene)
    const active = scenes.find(scene => scene.id === state.productionPlan.activeSceneId)!
    return {
      productionPlan: { ...state.productionPlan, projectTitle: '雨を待つ図書室｜面明かり試作', scenes },
      fixtures: active.fixtures,
    }
  })
}
