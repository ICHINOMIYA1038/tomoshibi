import { useStore, type AudienceBlock, type Fixture, type SceneTriggerType, type VenueLayout } from '../store'
import type { SetPiece } from '../types'
import { areaWashFixture } from './areaWash'

export type VenueStudyKind = 'proscenium' | 'round' | 'thrust' | 'custom'

type Vec3 = [number, number, number]
type Light = { name: string; position: Vec3; target: Vec3; beam: number }
type Person = { name: string; color: string; position: Vec3 }
type Scene = {
  title: string
  triggerType?: SceneTriggerType
  trigger?: string
  note: string
  positions: Vec3[]
  visible?: boolean[]
  levels: number[]
}
type Study = {
  title: string
  chapter: string
  venue: VenueLayout
  seats: AudienceBlock[]
  people: Person[]
  props: Array<Pick<SetPiece, 'name' | 'appearance' | 'size' | 'color' | 'position'>>
  lights: Light[]
  scenes: Scene[]
}

const block = (id: string, name: string, x: number, z: number, rows: number, columns: number, rotationDeg = 0): AudienceBlock => ({
  id: `venue-study-${id}`, name, position: [x, z], rows, seatsPerRow: columns,
  rowSpacing: .9, seatSpacing: .62, rotationDeg,
})

const studies: Record<VenueStudyKind, Study> = {
  proscenium: {
    title: '手紙の幕｜額縁舞台', chapter: '第一章・届かない手紙',
    venue: { stageShape: 'proscenium', stageWidth: 14, stageDepth: 10, targetCapacity: 192 },
    seats: [block('pro-left', '客席・下手', -3.6, 10, 8, 12), block('pro-right', '客席・上手', 3.6, 10, 8, 12)],
    people: [
      { name: '差出人', color: '#9f745c', position: [-2.7, 0, -2.6] },
      { name: '受取人', color: '#59748a', position: [3.6, 0, -3.2] },
    ],
    props: [
      { name: '手紙を置く机', appearance: 'table', size: [1.7, .82, 1], color: '#745844', position: [0, .41, -4] },
      { name: '奥の扉', appearance: 'door', size: [1.25, 2.2, .18], color: '#6a5b59', position: [4.7, 1.1, -6.6] },
    ],
    lights: [
      { name: '地明かり・手前下手', position: [-3.5, 7.2, 1], target: [-2.4, 1, -1.4], beam: 44 },
      { name: '地明かり・手前上手', position: [3.5, 7.2, 1], target: [2.4, 1, -1.4], beam: 44 },
      { name: '地明かり・奥下手', position: [-3.5, 7.2, -5.5], target: [-2.4, 1, -4.5], beam: 44 },
      { name: '地明かり・奥上手', position: [3.5, 7.2, -5.5], target: [2.4, 1, -4.5], beam: 44 },
      { name: '前明かり・下手', position: [-5, 13.5, 16], target: [-2.4, 1.5, -2.8], beam: 19 },
      { name: '前明かり・上手', position: [5, 13.5, 16], target: [2.4, 1.5, -2.8], beam: 19 },
      { name: '机の面', position: [0, 7, -1], target: [0, 1.4, -4], beam: 35 },
      { name: '扉の面', position: [5.4, 6.5, -3.5], target: [4.7, 1.3, -6.3], beam: 30 },
    ],
    scenes: [
      { title: '宛先のない手紙', note: '机と差出人を見せ、奥の扉は暗くする。', positions: [[-2.7, 0, -2.6], [3.6, 0, -3.2]], visible: [true, false], levels: [.18, .08, .12, .06, .25, .07, .10, 0] },
      { title: '扉が開く', triggerType: 'sound', trigger: '扉の音', note: '受取人が奥の扉から現れる。上手の面と扉を明るくする。', positions: [[-2.2, 0, -2.6], [3.4, 0, -4.9]], levels: [.16, .19, .10, .14, .22, .29, .12, .12] },
      { title: '手紙を渡す', triggerType: 'dialogue', trigger: '受け取って', note: '二人が机に寄り、中央の面を広げて手元を見せる。', positions: [[-1.3, 0, -2.5], [1.3, 0, -2.5]], levels: [.17, .17, .10, .10, .24, .24, .18, .03] },
    ],
  },
  round: {
    title: '広場の時計｜円形舞台', chapter: '第一章・時計の周り',
    venue: { stageShape: 'round', stageWidth: 12, stageDepth: 12, targetCapacity: 270 },
    seats: [
      block('round-front-left', '南側・下手', -3.7, 11, 5, 9), block('round-front-right', '南側・上手', 3.7, 11, 5, 9),
      block('round-back-left', '北側・下手', -3.7, -17, 5, 9, 180), block('round-back-right', '北側・上手', 3.7, -17, 5, 9, 180),
      block('round-left', '西側', -14, -3, 5, 9, -90), block('round-right', '東側', 14, -3, 5, 9, 90),
    ],
    people: [
      { name: '時計守', color: '#9e755e', position: [-2.5, 0, -2] },
      { name: '旅人', color: '#617993', position: [2.5, 0, -4] },
    ],
    props: [
      { name: '時計の台座', appearance: 'basic', size: [1.2, .75, 1.2], color: '#827461', position: [0, .375, -3] },
      { name: '広場のベンチ', appearance: 'bench', size: [2.1, .75, .7], color: '#765b47', position: [-2.8, .375, -6] },
    ],
    lights: [
      { name: '北西の面', position: [-6, 8.5, -10], target: [-2.3, 1.2, -4.7], beam: 42 },
      { name: '北東の面', position: [6, 8.5, -10], target: [2.3, 1.2, -4.7], beam: 42 },
      { name: '南西の面', position: [-6, 8.5, 4], target: [-2.3, 1.2, -1.3], beam: 42 },
      { name: '南東の面', position: [6, 8.5, 4], target: [2.3, 1.2, -1.3], beam: 42 },
      { name: '西側の面', position: [-10, 9, -3], target: [-1, 1.5, -3], beam: 30 },
      { name: '東側の面', position: [10, 9, -3], target: [1, 1.5, -3], beam: 30 },
      { name: '南側の面', position: [0, 11, 12], target: [0, 1.5, -3], beam: 24 },
      { name: '北側の面', position: [0, 11, -18], target: [0, 1.5, -3], beam: 24 },
    ],
    scenes: [
      { title: '時計が止まる', triggerType: 'sound', trigger: '鐘が一つ鳴る', note: 'どの客席からも二人が見えるよう、中央の時計を低くする。四方から面を重ねる。', positions: [[-2.5, 0, -2], [2.5, 0, -4]], levels: [.15, .15, .15, .15, .12, .12, .20, .20] },
      { title: '時計を回る', triggerType: 'dialogue', trigger: 'こちらへ', note: '二人は時計の反対側へ回る。背後になる客席が入れ替わるため、四方の面を残す。', positions: [[1.8, 0, -1.6], [-1.8, 0, -4.5]], levels: [.16, .16, .16, .16, .13, .13, .18, .18] },
      { title: '再び動き出す', triggerType: 'light', trigger: '時計の針が動く', note: '二人が離れ、時計の周囲に明かりが広がる。', positions: [[-3.1, 0, -4.8], [3.1, 0, -1.3]], levels: [.22, .22, .22, .22, .15, .15, .22, .22] },
    ],
  },
  thrust: {
    title: '渡り橋｜張り出し舞台', chapter: '第一章・橋の上',
    venue: { stageShape: 'thrust', stageWidth: 14, stageDepth: 12, targetCapacity: 182 },
    seats: [
      block('thrust-front-left', '正面・下手', -3.3, 10.5, 7, 7), block('thrust-front-right', '正面・上手', 3.3, 10.5, 7, 7),
      block('thrust-left', '下手側', -10, -1.7, 7, 6, -90), block('thrust-right', '上手側', 10, -1.7, 7, 6, 90),
    ],
    people: [
      { name: '橋を渡る人', color: '#9c7057', position: [0, 0, 1.1] },
      { name: '待つ人', color: '#68818a', position: [-3.7, 0, -5.1] },
    ],
    props: [
      { name: '橋の手すり・下手', appearance: 'basic', size: [.22, .75, 3.4], color: '#786653', position: [-3, .375, .2] },
      { name: '橋の手すり・上手', appearance: 'basic', size: [.22, .75, 3.4], color: '#786653', position: [3, .375, .2] },
      { name: '奥の門', appearance: 'door', size: [1.3, 2.2, .2], color: '#625b57', position: [0, 1.1, -7] },
    ],
    lights: [
      { name: '橋・先端下手', position: [-3.7, 8, 3], target: [-1.4, 1, .7], beam: 38 },
      { name: '橋・先端上手', position: [3.7, 8, 3], target: [1.4, 1, .7], beam: 38 },
      { name: '舞台奥・下手', position: [-4.5, 7.5, -7.5], target: [-2.5, 1, -4.6], beam: 42 },
      { name: '舞台奥・上手', position: [4.5, 7.5, -7.5], target: [2.5, 1, -4.6], beam: 42 },
      { name: '正面の面', position: [0, 13, 14], target: [0, 1.5, -1.5], beam: 23 },
      { name: '下手客席側の面', position: [-11, 10, -1.5], target: [-1.4, 1.5, -1.8], beam: 28 },
      { name: '上手客席側の面', position: [11, 10, -1.5], target: [1.4, 1.5, -1.8], beam: 28 },
      { name: '門の面', position: [0, 7, -4.5], target: [0, 1.4, -7], beam: 30 },
    ],
    scenes: [
      { title: '橋の先', note: '張り出した先端と奥の門を別の明かりで見せる。左右の客席側も人物の面を支える。', positions: [[0, 0, 1.1], [-3.7, 0, -5.1]], levels: [.18, .18, .12, .12, .23, .16, .16, .10] },
      { title: '呼び止める', triggerType: 'dialogue', trigger: '待って', note: '待つ人が奥から橋へ進む。照明を橋の中央に寄せる。', positions: [[.6, 0, 1], [-1.2, 0, -1.6]], levels: [.20, .20, .10, .10, .25, .19, .19, .03] },
      { title: '門へ戻る', triggerType: 'sound', trigger: '門が閉まる音', note: '二人が門へ戻り、先端を暗く、奥を明るくする。', positions: [[1.4, 0, -4.7], [-1.2, 0, -4.2]], levels: [.04, .04, .20, .20, .17, .14, .14, .14] },
    ],
  },
  custom: {
    title: '折れた庭｜自由配置', chapter: '第一章・庭の境界',
    venue: { stageShape: 'custom', stageWidth: 12, stageDepth: 11, stageVertices: [[-6, -8], [3, -8], [5, -5], [6, 0], [2, 3], [-3, 2], [-6, -1]], targetCapacity: 94 },
    seats: [
      block('custom-front-left', '正面・下手', -2, 9.2, 5, 7), block('custom-front-right', '正面・上手', 3, 9.2, 5, 7),
      block('custom-left', '下手側', -12, -2, 4, 6, -90),
    ],
    people: [
      { name: '庭師', color: '#93745b', position: [-2.2, 0, -3.4] },
      { name: '訪問者', color: '#66828d', position: [2.2, 0, -.8] },
    ],
    props: [
      { name: '庭のベンチ', appearance: 'bench', size: [1.9, .75, .7], color: '#736450', position: [-3.5, .375, -5.2] },
      { name: '境界の石', appearance: 'basic', size: [.8, .55, .8], color: '#74716c', position: [3.2, .275, -4] },
      { name: '小さな門', appearance: 'door', size: [1, 1.9, .18], color: '#756855', position: [4.5, .95, -1] },
    ],
    lights: [
      { name: '庭・手前下手', position: [-4, 7.2, 2], target: [-2.5, 1, -1.2], beam: 42 },
      { name: '庭・手前上手', position: [3.5, 7.2, 2], target: [2.3, 1, -1.2], beam: 42 },
      { name: '庭・奥下手', position: [-4, 7.2, -7], target: [-2.5, 1, -5], beam: 42 },
      { name: '庭・奥上手', position: [3.5, 7.2, -7], target: [2.3, 1, -5], beam: 42 },
      { name: '正面の面', position: [0, 12, 13], target: [0, 1.5, -2.5], beam: 23 },
      { name: '左客席側の面', position: [-11, 10, -2], target: [-2, 1.5, -2.5], beam: 27 },
      { name: '門の面', position: [6, 7, -1], target: [4.2, 1.3, -1], beam: 32 },
      { name: 'ベンチの面', position: [-5.5, 7, -3.5], target: [-3.5, 1.2, -5.2], beam: 32 },
    ],
    scenes: [
      { title: '境界を見つける', note: '折れた舞台の輪郭を客席から読めるよう、庭の面を弱くつなぐ。', positions: [[-2.2, 0, -3.4], [2.2, 0, -.8]], levels: [.17, .17, .13, .13, .22, .18, .08, .08] },
      { title: '石を渡す', triggerType: 'dialogue', trigger: 'これを', note: '二人が中央で向き合う。小さな石を目印にする。', positions: [[-.8, 0, -2.2], [1.1, 0, -2.3]], levels: [.19, .19, .12, .12, .24, .18, .04, .04] },
      { title: '門から去る', triggerType: 'sound', trigger: '足音が遠ざかる', note: '訪問者は門へ向かい、庭師とベンチは暗く残す。', positions: [[-2.8, 0, -4.6], [3.7, 0, -.8]], levels: [.07, .19, .05, .12, .16, .10, .16, .02] },
    ],
  },
}

export const VENUE_STUDY_LINKS: Array<{ kind: VenueStudyKind; label: string; detail: string }> = [
  { kind: 'proscenium', label: '額縁舞台', detail: '正面客席・192席' },
  { kind: 'round', label: '円形舞台', detail: '四方の客席・270席' },
  { kind: 'thrust', label: '張り出し舞台', detail: '三方の客席・182席' },
  { kind: 'custom', label: '自由配置', detail: '変形舞台・94席' },
]

export function createVenueTemplatePlan(kind: VenueStudyKind) {
  const study = studies[kind]
  const store = useStore.getState()
  store.loadPreset('empty')
  store.ensureScenes()
  store.updateVenueLayout(study.venue)
  useStore.setState(state => ({
    productionPlan: {
      ...state.productionPlan,
      audienceBlocks: study.seats.map(seat => ({ ...seat, position: [...seat.position] as AudienceBlock['position'] })),
    },
  }))
}

export function createVenueStudyPlan(kind: VenueStudyKind) {
  const study = studies[kind]
  const store = useStore.getState()
  store.loadPreset('empty')
  store.ensureScenes()
  store.updateProductionPlan({ projectTitle: study.title })
  store.updateVenueLayout(study.venue)
  store.updateSettings({
    showHouseLights: false, cameraView: 'audience', ambient: .10,
    hazeDensity: .2, exposure: 1.25, bloom: .3,
  })
  useStore.setState(state => ({
    productionPlan: { ...state.productionPlan, audienceBlocks: study.seats },
  }))
  const opening = useStore.getState().productionPlan.activeSceneId!
  const chapter = useStore.getState().productionPlan.chapters![0].id
  store.updateChapter(chapter, study.chapter)
  const personIds = study.people.map(person => {
    const id = store.addPerformer(person.position)
    store.updatePerformer(id, { name: person.name, color: person.color, pose: 'standing' })
    return id
  })
  study.props.forEach(prop => {
    const id = store.addPrimitiveSetPiece('box', prop.position)
    store.updateSetPiece(id, prop)
  })
  const lightIds = study.lights.map(light => {
    const id = store.addFixture('Fresnel10', light.position)
    const fixture = useStore.getState().fixtures.find(item => item.id === id)!
    store.updateFixture(id, areaWashFixture(fixture, {
      name: light.name, target: light.target, beamAngleDeg: light.beam,
      intensity: 0, color: [1, .86, .75] as Fixture['color'],
    }))
    return id
  })
  const applyScene = (scene: Scene, sceneId: string) => {
    personIds.forEach((id, index) => store.updatePerformer(id, {
      position: scene.positions[index], onStage: scene.visible?.[index] ?? true,
    }))
    lightIds.forEach((id, index) => store.updateFixture(id, {
      intensity: scene.levels[index], enabled: scene.levels[index] > 0,
    }))
    store.updateScene(sceneId, {
      title: scene.title, triggerType: scene.triggerType ?? 'other', trigger: scene.trigger ?? '', note: scene.note,
    })
  }
  applyScene(study.scenes[0], opening)
  for (const scene of study.scenes.slice(1)) {
    const id = store.addSceneAt(chapter, null)!
    applyScene(scene, id)
  }
  store.selectScene(opening)
  store.select(null, null)
}
