// 見本の公演「ロミオとジュリエット」（シェイクスピア）。トップページ・使い方の動画・「見本の公演を開く」で使う（2026-11-18）。
// 作品は著作権が切れている。台詞は翻訳の著作権を避けるため引かず、場面の名前と説明は自分の言葉で書く。
// 実際の劇場の仕込みに近い組み方にしている（雨を待つ図書室で作った吊りを引き継ぐ）:
// - 客席の吊り位置（FOH）から前明かり 3 灯、1 番バトンから舞台奥の地明かり 2 灯。実測の配光で演技の場所をむらなく覆う
// - 4 番バトンから逆光 2 灯。ホリゾントは上から左右 2 灯（1 台だと中央だけ明るい）
// - 芯の明かり: ピンの特別（場面ごとに狙いを変える。舞踏会のジュリエット、バルコニー、霊廟の棺台）、
//   月明かり（木漏れ日のゴボ）、窓明かり（窓枠のゴボ）、下手・上手の横明かり
// 器具は 14 灯（上限 16）。見本を開いた人が 2 灯は足せるようにしておく。
import { useStore, type AudienceBlock, type Fixture, type SceneTriggerType } from '../store'
import type { SetPiece } from '../types'
import { MEASURED_FRESNEL_KEY } from '../photometric/measuredFresnel'
import { MEASURED_CYC_KEY } from '../photometric/measuredCyc'
import type { GoboPattern } from '../lighting/movingHead'
import { templateParts } from '../stageParts'

type Vec3 = [number, number, number]
type RGB = [number, number, number]

const C = {
  day: [1, 0.92, 0.8] as RGB,
  warm: [1, 0.84, 0.68] as RGB,
  gold: [1, 0.76, 0.48] as RGB,
  rose: [1, 0.62, 0.66] as RGB,
  night: [0.8, 0.84, 1] as RGB,
  steel: [0.6, 0.72, 1] as RGB,
  moon: [0.62, 0.74, 1] as RGB,
  lavender: [0.8, 0.72, 1] as RGB,
  red: [1, 0.42, 0.3] as RGB,
  amber: [1, 0.72, 0.45] as RGB,
  torch: [1, 0.6, 0.32] as RGB,
  pale: [1, 0.95, 0.9] as RGB,
  skyDay: [0.55, 0.75, 1] as RGB,
  skyGold: [1, 0.66, 0.36] as RGB,
  skyNight: [0.1, 0.16, 0.48] as RGB,
  skyDeep: [0.06, 0.08, 0.3] as RGB,
  skyDawn: [0.9, 0.62, 0.7] as RGB,
  skyRed: [0.9, 0.36, 0.22] as RGB,
  skyGrey: [0.62, 0.66, 0.78] as RGB,
}

type Light = {
  key: string; name: string; number: string; preset: string; measured?: 'fresnel' | 'cyc'
  position: Vec3; target: Vec3; beam: number; gobo?: GoboPattern; barnDoorAngles?: Fixture['barnDoorAngles']
}

const LIGHTS: Light[] = [
  { key: 'fohL', name: '前明かり・下手', number: '1', preset: 'Fresnel10', measured: 'fresnel', position: [-4.4, 8.6, 6.8], target: [-3.2, 1.4, -1.0], beam: 34, barnDoorAngles: { top: 3, left: 6 } },
  { key: 'fohC', name: '前明かり・中央', number: '2', preset: 'Fresnel10', measured: 'fresnel', position: [0, 8.6, 6.8], target: [0, 1.4, -1.6], beam: 34, barnDoorAngles: { top: 3 } },
  { key: 'fohR', name: '前明かり・上手', number: '3', preset: 'Fresnel10', measured: 'fresnel', position: [4.4, 8.6, 6.8], target: [3.2, 1.4, -1.0], beam: 34, barnDoorAngles: { top: 3, right: 6 } },
  { key: 'usL', name: '奥の地明かり・下手', number: '4', preset: 'Fresnel10', measured: 'fresnel', position: [-3.4, 8, 0.8], target: [-3.4, 1.5, -5.0], beam: 40, barnDoorAngles: { top: 4 } },
  { key: 'usR', name: '奥の地明かり・上手', number: '5', preset: 'Fresnel10', measured: 'fresnel', position: [3.4, 8, 0.8], target: [3.0, 1.5, -5.0], beam: 40, barnDoorAngles: { top: 4 } },
  { key: 'backL', name: '逆光・下手', number: '6', preset: 'Fresnel10', measured: 'fresnel', position: [-3, 8, -5.2], target: [-2.4, 0, -1.4], beam: 44 },
  { key: 'backR', name: '逆光・上手', number: '7', preset: 'Fresnel10', measured: 'fresnel', position: [3, 8, -5.2], target: [2.4, 0, -1.4], beam: 44 },
  { key: 'cycL', name: 'ホリゾント・下手', number: '8', preset: 'CycWashStudy', measured: 'cyc', position: [-3.2, 7.2, -4.2], target: [-3.2, 3.6, -7.4], beam: 40 },
  { key: 'cycR', name: 'ホリゾント・上手', number: '9', preset: 'CycWashStudy', measured: 'cyc', position: [3.2, 7.2, -4.2], target: [3.2, 3.6, -7.4], beam: 40 },
  // ピンの特別。狙いは場面ごとに変える
  { key: 'pin', name: 'ピン・特別', number: '10', preset: 'Source4_19', position: [0.6, 8, -0.95], target: [0, 1.2, -2.2], beam: 19 },
  { key: 'moon', name: '月明かり', number: '11', preset: 'Source4_26', position: [5.6, 7.6, -5.6], target: [0.6, 0, -2.4], beam: 26, gobo: 'leaves' },
  { key: 'window', name: '窓明かり', number: '12', preset: 'Source4_26', position: [-4.6, 5.0, -6.9], target: [-0.6, 0, -2.6], beam: 26, gobo: 'window' },
  { key: 'sideL', name: '横明かり・下手', number: '13', preset: 'Source4_26', position: [-6.6, 4.6, -2.4], target: [-0.6, 0.4, -2.4], beam: 26 },
  { key: 'sideR', name: '横明かり・上手', number: '14', preset: 'Source4_26', position: [6.6, 4.6, -2.0], target: [0.6, 0.4, -2.0], beam: 26 },
]

type Cue = { level: number; color?: RGB; target?: Vec3; position?: Vec3 }
type Look = Partial<Record<string, number | Cue>>
type Place = Vec3 | { position: Vec3; facingDeg?: number; pose?: 'standing' | 'sitting' | 'kneeling' | 'lying' }

/** 実測の配光（ETC のフレネル）は、距離の 2 乗で落ちる本物の明るさになる。場面の値（0〜1 の感覚）にこれを掛けて出す */
const FRESNEL_GAIN = 4.2

type Prop = Pick<SetPiece, 'name' | 'size' | 'color'> & { kind?: 'box' | 'platform'; appearance?: SetPiece['appearance']; rotationY?: number }
const PROPS: Record<string, Prop> = {
  fountain: { name: '広場の噴水', size: [1.8, 0.8, 1.8], color: '#6f6a62' },
  benchL: { name: '広場のベンチ', appearance: 'bench', size: [1.8, 0.45, 0.5], color: '#6a5040' },
  table: { name: '宴の卓', appearance: 'table', size: [3.0, 0.78, 1.0], color: '#6b4a36' },
  benchT: { name: '宴の長椅子', appearance: 'bench', size: [2.6, 0.45, 0.45], color: '#5c4232' },
  balcony: { name: 'バルコニー', size: [2.6, 2.0, 1.4], color: '#9a8c7c' },
  balconyWindow: { name: 'ジュリエットの部屋の窓', appearance: 'window', size: [1.6, 2.2, 0.14], color: '#3a4250' },
  cellTable: { name: '神父の机', appearance: 'table', size: [1.6, 0.78, 0.9], color: '#6b4f3e' },
  herbs: { name: '薬草の棚', appearance: 'bookshelf', size: [2.0, 2.4, 0.45], color: '#4b3833' },
  bed: { name: 'ジュリエットの寝台', size: [2.2, 0.5, 1.3], color: '#7a5b5b' },
  roomWindow: { name: '寝室の窓', appearance: 'window', size: [2.4, 2.6, 0.16], color: '#5b6877' },
  bier: { kind: 'platform', name: '霊廟の棺台', size: [2.4, 0.7, 1.1], color: '#55504c' },
}
type PropPlace = { at: Vec3; rotationY?: number }

const CAST = ['ロミオ', 'ジュリエット', 'マキューシオ', 'ティボルト', '乳母', 'ロレンス神父'] as const
type Name = typeof CAST[number]
const CAST_COLOR: Record<Name, string> = {
  'ロミオ': '#5d6f8a', 'ジュリエット': '#b08a8a', 'マキューシオ': '#7c8a5d', 'ティボルト': '#8a3f3a', '乳母': '#8a7a62', 'ロレンス神父': '#6b5a48',
}

type Scene = {
  chapter: number
  title: string
  triggerType?: SceneTriggerType
  trigger?: string
  note: string
  cast: Partial<Record<Name, Place>>
  props: Partial<Record<keyof typeof PROPS, PropPlace>>
  look: Look
}

const CHAPTERS = ['第一幕・出会い', '第二幕・誓い', '第三幕・決闘と別れ', '第五幕・霊廟']

const SCENES: Scene[] = [
  {
    chapter: 0, title: 'ヴェローナの広場', triggerType: 'other', trigger: '幕開き', note: '真昼の広場。両家の若者がにらみ合う。空は高い青、地明かりは白く強く。',
    cast: { 'マキューシオ': { position: [-2.6, 0, -1.2], facingDeg: 60 }, 'ティボルト': { position: [2.2, 0, -1.6], facingDeg: -60 }, 'ロミオ': { position: [-4.6, 0, -3.6], facingDeg: 30 } },
    props: { fountain: { at: [0, 0.4, -4.2] }, benchL: { at: [-4.2, 0.225, -4.6] } },
    look: {
      fohL: { level: 0.32, color: C.day }, fohC: { level: 0.32, color: C.day }, fohR: { level: 0.32, color: C.day },
      usL: { level: 0.26, color: C.day }, usR: { level: 0.26, color: C.day },
      backL: { level: 0.2, color: C.amber }, backR: { level: 0.2, color: C.amber },
      cycL: { level: 0.5, color: C.skyDay }, cycR: { level: 0.5, color: C.skyDay },
      sideL: { level: 0.3, color: C.day }, sideR: { level: 0.3, color: C.day },
    },
  },
  {
    chapter: 0, title: 'キャピュレット家の舞踏会', triggerType: 'sound', trigger: '舞曲が始まる', note: '金色の宴の間。人の輪から離れた所で、ロミオとジュリエットが出会う。二人にだけピンを足す。',
    cast: { 'ロミオ': { position: [-0.9, 0, -1.4], facingDeg: 70 }, 'ジュリエット': { position: [0.7, 0, -1.4], facingDeg: -70 }, 'ティボルト': { position: [3.8, 0, -3.8], facingDeg: -110 }, '乳母': { position: [-3.8, 0, -3.6], facingDeg: 40 } },
    props: { table: { at: [0, 0.39, -4.4] }, benchT: { at: [0, 0.225, -5.2] } },
    look: {
      fohL: { level: 0.16, color: C.gold }, fohC: { level: 0.12, color: C.gold }, fohR: { level: 0.16, color: C.gold },
      usL: { level: 0.22, color: C.gold }, usR: { level: 0.22, color: C.gold },
      backL: { level: 0.22, color: C.rose }, backR: { level: 0.22, color: C.rose },
      cycL: { level: 0.3, color: C.skyGold }, cycR: { level: 0.3, color: C.skyGold },
      pin: { level: 0.9, color: C.pale, target: [-0.1, 1.2, -1.4] }, sideL: { level: 0.25, color: C.amber }, sideR: { level: 0.25, color: C.rose },
    },
  },
  {
    chapter: 1, title: 'バルコニー', triggerType: 'other', trigger: '夜の庭', note: '月夜の庭。上手のバルコニーにジュリエット、下の木陰にロミオ。月明かりが木漏れ日の形で落ちる。',
    cast: { 'ジュリエット': { position: [3.2, 2.0, -5.0], facingDeg: -30 }, 'ロミオ': { position: [0.6, 0, -2.6], facingDeg: 150 } },
    props: { balcony: { at: [3.2, 1.0, -5.0] }, balconyWindow: { at: [3.2, 3.1, -5.75] }, benchL: { at: [-2.6, 0.225, -3.2] } },
    look: {
      fohL: { level: 0.05, color: C.night }, fohC: { level: 0.07, color: C.night }, fohR: { level: 0.1, color: C.night },
      backL: { level: 0.16, color: C.steel }, backR: { level: 0.2, color: C.steel },
      cycL: { level: 0.12, color: C.skyNight }, cycR: { level: 0.12, color: C.skyNight },
      pin: { level: 0.6, color: C.pale, position: [3.0, 8, -2.7], target: [3.2, 2.6, -5.0] }, moon: { level: 0.85, color: C.moon }, sideR: { level: 0.2, color: C.moon, target: [3.0, 1.2, -4.2] },
    },
  },
  {
    chapter: 1, title: 'ロレンス神父の庵', triggerType: 'light', trigger: '朝の光', note: '朝の庵。ひそかな婚礼。窓枠の形の光が床に入り、二人と神父を結ぶ。',
    cast: { 'ロレンス神父': { position: [0, 0, -3.2], facingDeg: 0 }, 'ロミオ': { position: [-1.0, 0, -2.0], facingDeg: 60 }, 'ジュリエット': { position: [1.0, 0, -2.0], facingDeg: -60 } },
    props: { cellTable: { at: [-2.6, 0.39, -4.2] }, herbs: { at: [3.8, 1.2, -6.2] } },
    look: {
      fohL: { level: 0.12, color: C.warm }, fohC: { level: 0.16, color: C.warm }, fohR: { level: 0.1, color: C.warm },
      usL: { level: 0.08, color: C.warm }, usR: { level: 0.08, color: C.warm },
      backL: { level: 0.12, color: C.amber }, backR: { level: 0.12, color: C.amber },
      cycL: { level: 0.12, color: C.skyDawn }, cycR: { level: 0.12, color: C.skyDawn },
      window: { level: 0.9, color: C.amber }, sideL: { level: 0.2, color: C.amber },
    },
  },
  {
    chapter: 2, title: '広場の決闘', triggerType: 'other', trigger: '剣が抜かれる', note: '照りつける午後。マキューシオが倒れ、ロミオがティボルトを討つ。空と横明かりを赤く、影を濃く。',
    cast: { 'ロミオ': { position: [-1.2, 0, -1.8], facingDeg: 80 }, 'ティボルト': { position: [1.4, 0, -1.9], facingDeg: -80 }, 'マキューシオ': { position: [-3.4, 0, -2.8], facingDeg: 40, pose: 'kneeling' } },
    props: { fountain: { at: [0, 0.4, -4.2] }, benchL: { at: [-4.2, 0.225, -4.6] } },
    look: {
      fohL: { level: 0.1, color: C.amber }, fohC: { level: 0.12, color: C.amber }, fohR: { level: 0.1, color: C.amber },
      backL: { level: 0.3, color: C.red }, backR: { level: 0.3, color: C.red },
      cycL: { level: 0.4, color: C.skyRed }, cycR: { level: 0.4, color: C.skyRed },
      sideL: { level: 0.7, color: C.amber }, sideR: { level: 0.7, color: C.red },
    },
  },
  {
    chapter: 2, title: '夜明けの別れ', triggerType: 'sound', trigger: '鳥の声', note: '寝室の夜明け。窓の外がしらむ。追放されるロミオとジュリエットの別れ。',
    cast: { 'ロミオ': { position: [-0.4, 0, -2.4], facingDeg: 70 }, 'ジュリエット': { position: [0.8, 0, -2.4], facingDeg: -70 } },
    props: { bed: { at: [-2.6, 0.25, -3.6] }, roomWindow: { at: [1.6, 1.8, -6.7] } },
    look: {
      fohL: { level: 0.06, color: C.lavender }, fohC: { level: 0.12, color: C.lavender }, fohR: { level: 0.06, color: C.lavender },
      backL: { level: 0.14, color: C.lavender }, backR: { level: 0.14, color: C.lavender },
      cycL: { level: 0.22, color: C.skyDawn, target: [-3.2, 1.8, -7.4] }, cycR: { level: 0.22, color: C.skyDawn, target: [3.2, 1.8, -7.4] },
      window: { level: 0.55, color: C.lavender, position: [2.4, 5.0, -6.9], target: [-0.2, 0, -2.4] },
    },
  },
  {
    chapter: 3, title: '霊廟', triggerType: 'other', trigger: '暗闇', note: '冷たい霊廟。棺台に眠るジュリエット。たいまつの暖色を一つだけ、あとは青い闇と冷気。',
    cast: { 'ジュリエット': { position: [0, 0.7, -3.4], facingDeg: 90, pose: 'lying' }, 'ロミオ': { position: [-1.5, 0, -2.7], facingDeg: 70, pose: 'kneeling' } },
    props: { bier: { at: [0, 0.35, -3.4] } },
    look: {
      backL: { level: 0.22, color: C.steel }, backR: { level: 0.22, color: C.steel },
      cycL: { level: 0.06, color: C.skyDeep, target: [-3.2, 3.6, -7.4] }, cycR: { level: 0.06, color: C.skyDeep, target: [3.2, 3.6, -7.4] },
      pin: { level: 0.8, color: C.torch, position: [0.6, 8, -0.95], target: [-0.6, 0.9, -3.2] }, sideL: { level: 0.25, color: C.torch },
    },
  },
  {
    chapter: 3, title: '両家の和解', triggerType: 'light', trigger: '夜が明ける', note: '灰色の夜明け。両家が棺台を囲み、手を取り合う。空がゆっくり白み、舞台全体を静かに見せて終える。',
    cast: { 'ロレンス神父': { position: [0, 0, -1.6], facingDeg: 0 }, '乳母': { position: [-2.4, 0, -2.2], facingDeg: 50 }, 'ジュリエット': { position: [0, 0.7, -3.4], facingDeg: 90, pose: 'lying' }, 'ロミオ': { position: [1.7, 0, -3.0], facingDeg: -40, pose: 'kneeling' } },
    props: { bier: { at: [0, 0.35, -3.4] } },
    look: {
      fohL: { level: 0.16, color: C.pale }, fohC: { level: 0.2, color: C.pale }, fohR: { level: 0.16, color: C.pale },
      usL: { level: 0.12, color: C.pale }, usR: { level: 0.12, color: C.pale },
      backL: { level: 0.16, color: C.lavender }, backR: { level: 0.16, color: C.lavender },
      cycL: { level: 0.4, color: C.skyGrey, target: [-3.2, 2.4, -7.4] }, cycR: { level: 0.4, color: C.skyGrey, target: [3.2, 2.4, -7.4] },
      pin: { level: 0.4, color: C.pale, target: [0, 1.0, -3.4] },
    },
  },
]

const block = (id: string, name: string, x: number, z: number, rows: number, columns: number): AudienceBlock => ({
  id: `sample-${id}`, name, position: [x, z], rows, seatsPerRow: columns, rowSpacing: 0.9, seatSpacing: 0.62, rotationDeg: 0,
})

export function createSampleProduction() {
  const store = useStore.getState()
  store.loadPreset('empty')
  store.ensureScenes()
  store.updateProductionPlan({ projectTitle: 'ロミオとジュリエット' })
  const venue = { stageShape: 'proscenium' as const, stageWidth: 14, stageDepth: 10, targetCapacity: 192, stageTemplate: 'proscenium' as const }
  // 額縁舞台のひな形から、いちばん手前の袖幕だけ外す。客席からの前明かりを受けて、灰色の箱のように見えていた
  store.updateVenueLayout({ ...venue, stageParts: templateParts('proscenium', venue).filter(part => !/^wing-(left|right)-1$/.test(part.id)) })
  store.updateSettings({ showHouseLights: false, cameraView: 'audience', ambient: 0.07, hazeDensity: 0.07, exposure: 1.3, bloom: 0.25 })
  useStore.setState(state => ({
    productionPlan: { ...state.productionPlan, audienceBlocks: [block('left', '客席・下手', -3.6, 10, 8, 12), block('right', '客席・上手', 3.6, 10, 8, 12)] },
  }))
  const chapterIds = [useStore.getState().productionPlan.chapters![0].id]
  store.updateChapter(chapterIds[0], CHAPTERS[0])

  const castIds = Object.fromEntries(CAST.map((name, index) => {
    const id = store.addPerformer([-6 + index, 0, 2])
    store.updatePerformer(id, { name, color: CAST_COLOR[name], pose: 'standing', onStage: false })
    return [name, id]
  })) as Record<Name, string>

  const lightIds = LIGHTS.map(light => {
    const id = store.addFixture(light.preset, light.position)
    store.updateFixture(id, {
      name: light.name, number: light.number, target: light.target, beamAngleDeg: light.beam,
      ...(light.measured === 'fresnel' ? { photometricProfile: MEASURED_FRESNEL_KEY } : {}),
      ...(light.measured === 'cyc' ? { photometricProfile: MEASURED_CYC_KEY } : {}),
      ...(light.gobo ? { gobo: light.gobo } : {}),
      ...(light.barnDoorAngles ? { barnDoorAngles: light.barnDoorAngles } : {}),
      gelEnabled: true, whiteMix: 0.1, intensity: 0, enabled: false,
    })
    return id
  })

  // 場面ごとに要るセットだけを置く（前の場面の物は外す）
  const placed: Partial<Record<keyof typeof PROPS, string>> = {}
  const apply = (scene: Scene, sceneId: string) => {
    for (const name of CAST) {
      const place = scene.cast[name]
      const position = place ? (Array.isArray(place) ? place : place.position) : [-6, 0, 2] as Vec3
      const facingDeg = place && !Array.isArray(place) ? place.facingDeg ?? 0 : 0
      const pose = place && !Array.isArray(place) ? place.pose ?? 'standing' : 'standing'
      store.updatePerformer(castIds[name], { position, facingDeg, pose, onStage: !!place })
    }
    for (const key of Object.keys(PROPS) as Array<keyof typeof PROPS>) {
      const want = scene.props[key]
      const id = placed[key]
      if (!want && id) { store.removeSetPiece(id); delete placed[key]; continue }
      if (!want) continue
      const prop = PROPS[key]
      const piece = id ?? store.addPrimitiveSetPiece(prop.kind ?? 'box', want.at)
      const { kind: _kind, rotationY: _r, ...fields } = prop
      const rotationY = want.rotationY ?? prop.rotationY
      store.updateSetPiece(piece, { ...fields, position: want.at, ...(rotationY ? { rotation: [0, rotationY, 0] as Vec3 } : {}) })
      placed[key] = piece
    }
    LIGHTS.forEach((light, index) => {
      const raw = scene.look[light.key]
      const cue: Cue = typeof raw === 'number' ? { level: raw } : raw ?? { level: 0 }
      const level = Math.min(1, cue.level * (light.measured === 'fresnel' ? FRESNEL_GAIN : 1))
      store.updateFixture(lightIds[index], {
        intensity: level, enabled: level > 0,
        ...(cue.color ? { color: cue.color } : {}),
        ...(cue.target ? { target: cue.target } : {}),
        ...(cue.position ? { position: cue.position } : {}),
      })
    })
    store.updateScene(sceneId, { title: scene.title, triggerType: scene.triggerType ?? 'other', trigger: scene.trigger ?? '', note: scene.note })
  }

  let sceneId = useStore.getState().productionPlan.activeSceneId!
  SCENES.forEach((scene, index) => {
    if (index > 0) {
      if (scene.chapter >= chapterIds.length) {
        const next = store.addChapterAfter(chapterIds[chapterIds.length - 1])!
        store.updateChapter(next, CHAPTERS[scene.chapter])
        chapterIds.push(next)
        sceneId = useStore.getState().productionPlan.activeSceneId!
      } else sceneId = store.addSceneAt(chapterIds[scene.chapter], null)!
    }
    apply(scene, sceneId)
  })
  store.selectScene(useStore.getState().productionPlan.scenes[0].id)
  store.select(null, null)
}
