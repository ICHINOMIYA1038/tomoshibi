// 見本の公演「雨を待つ図書室」。トップページ・使い方の動画・「見本の公演を開く」で使う（2026-11-18 作り直し）。
// 実際の劇場の仕込みに近い組み方にしている:
// - 客席の吊り位置（FOH）から 3 灯の前明かり、1 番バトンから舞台奥の地明かり 2 灯で、演技の場所をむらなく覆う
// - 4 番バトンから冷たい逆光 2 灯で、役者の輪郭と奥行きを出す
// - ホリゾントは上から左右 2 灯で、窓の外の空の色を作る
// - 机・扉・窓の雨（縞のゴボ）・朝日（窓枠のゴボ）・下手の横明かりを、場面の芯にする。稲光はホリゾントと雨明かりを白く飛ばして作る
// 器具は 14 灯（上限 16）。見本を開いた人が 2 灯は足せるようにしておく。
import { useStore, type AudienceBlock, type Fixture, type SceneTriggerType } from '../store'
import type { SetPiece } from '../types'
import { MEASURED_FRESNEL_KEY } from '../photometric/measuredFresnel'
import { MEASURED_CYC_KEY } from '../photometric/measuredCyc'
import type { GoboPattern } from '../lighting/movingHead'
import { templateParts } from '../stageParts'

type Vec3 = [number, number, number]
type RGB = [number, number, number]

/** 色（ゲルに近い値） */
const C = {
  warm: [1, 0.84, 0.68] as RGB,        // 電球色の前明かり（L-203 相当を薄く）
  warmPale: [1, 0.9, 0.8] as RGB,
  night: [0.86, 0.88, 1] as RGB,        // 夜の前明かり。白に少し青
  steel: [0.6, 0.72, 1] as RGB,         // 逆光（スチールブルー）
  lavender: [0.78, 0.7, 1] as RGB,
  moon: [0.55, 0.7, 1] as RGB,
  rainSky: [0.16, 0.28, 0.62] as RGB,   // 雨の夜空
  deepSky: [0.1, 0.14, 0.42] as RGB,
  flash: [0.85, 0.92, 1] as RGB,
  dawnLow: [1, 0.55, 0.28] as RGB,      // 地平の朝焼け
  dawnSky: [0.62, 0.74, 1] as RGB,
  morningSky: [0.78, 0.88, 1] as RGB,
  sun: [1, 0.78, 0.5] as RGB,
  amber: [1, 0.72, 0.45] as RGB,
  door: [0.7, 0.8, 1] as RGB,
}

type Light = {
  key: string
  name: string
  number: string
  preset: string
  measured?: 'fresnel' | 'cyc'
  position: Vec3
  target: Vec3
  beam: number
  gobo?: GoboPattern
  barnDoorAngles?: Fixture['barnDoorAngles']
}

const LIGHTS: Light[] = [
  // 客席の吊り位置（FOH）。斜め 45° 前後で顔を見せる
  { key: 'fohL', name: '前明かり・下手', number: '1', preset: 'Fresnel10', measured: 'fresnel', position: [-4.4, 8.6, 6.8], target: [-3.2, 1.4, -1.0], beam: 34, barnDoorAngles: { top: 3, left: 6 } },
  { key: 'fohC', name: '前明かり・中央', number: '2', preset: 'Fresnel10', measured: 'fresnel', position: [0, 8.6, 6.8], target: [0, 1.4, -1.6], beam: 34, barnDoorAngles: { top: 3 } },
  { key: 'fohR', name: '前明かり・上手', number: '3', preset: 'Fresnel10', measured: 'fresnel', position: [4.4, 8.6, 6.8], target: [3.2, 1.4, -1.0], beam: 34, barnDoorAngles: { top: 3, right: 6 } },
  // 1 番バトン。舞台奥の演技の場所
  { key: 'usL', name: '奥の地明かり・下手', number: '4', preset: 'Fresnel10', measured: 'fresnel', position: [-3.4, 8, 0.8], target: [-3.4, 1.5, -5.0], beam: 40, barnDoorAngles: { top: 4 } },
  { key: 'usR', name: '奥の地明かり・上手', number: '5', preset: 'Fresnel10', measured: 'fresnel', position: [3.4, 8, 0.8], target: [3.0, 1.5, -5.0], beam: 40, barnDoorAngles: { top: 4 } },
  // 4 番バトン。逆光
  { key: 'backL', name: '逆光・下手', number: '6', preset: 'Fresnel10', measured: 'fresnel', position: [-3, 8, -5.2], target: [-2.4, 0, -1.4], beam: 44 },
  { key: 'backR', name: '逆光・上手', number: '7', preset: 'Fresnel10', measured: 'fresnel', position: [3, 8, -5.2], target: [2.4, 0, -1.4], beam: 44 },
  // ホリゾント
  // 1 台だと中央だけが明るい。左右 2 台で幕の全体をむらなく染める（床置きのロアーは 1 台だと V 字のむらが出るので使わない）
  { key: 'cycL', name: 'ホリゾント・下手', number: '8', preset: 'CycWashStudy', measured: 'cyc', position: [-3.2, 7.2, -4.2], target: [-3.2, 3.6, -7.4], beam: 40 },
  { key: 'cycR', name: 'ホリゾント・上手', number: '9', preset: 'CycWashStudy', measured: 'cyc', position: [3.2, 7.2, -4.2], target: [3.2, 3.6, -7.4], beam: 40 },
  // 場面の芯
  { key: 'desk', name: '机の灯り', number: '10', preset: 'Source4_19', position: [0.8, 8, -0.95], target: [0.2, 0.78, -2.6], beam: 19 },
  { key: 'rain', name: '窓の雨明かり', number: '11', preset: 'Source4_26', position: [3.2, 5.6, -6.9], target: [1.2, 0, -3.0], beam: 26, gobo: 'lines' },
  { key: 'door', name: '扉の明かり', number: '12', preset: 'Source4_26', position: [4.4, 8, -2.7], target: [4.5, 0, -2.4], beam: 24 },
  { key: 'sun', name: '朝日', number: '13', preset: 'Source4_26', position: [4.6, 4.4, -6.9], target: [-0.4, 0, -2.4], beam: 26, gobo: 'window' },
  { key: 'side', name: '横明かり・下手', number: '14', preset: 'Source4_26', position: [-6.6, 4.6, -2.4], target: [-0.6, 0.4, -2.4], beam: 26 },
]

type Cue = { level: number; color?: RGB; target?: Vec3 }
/** 実測の配光（ETC のフレネル）は、距離の 2 乗で落ちる本物の明るさになる。場面の値（0〜1 の感覚）にこれを掛けて出す */
const FRESNEL_GAIN = 4.2
type Look = Partial<Record<string, number | Cue>>

type Place = { position: Vec3; facingDeg?: number; onStage?: boolean }
type Scene = {
  title: string
  triggerType?: SceneTriggerType
  trigger?: string
  note: string
  librarian: Place
  visitor: Place
  look: Look
  suitcase?: boolean
  bookOnDesk?: boolean
  bookWithVisitor?: boolean
}

const SCENES: Array<Scene & { chapter: 0 | 1 }> = [
  {
    chapter: 0, title: '閉館前', note: '雨の夜、閉館の支度。司書のいる受付と机を暖かく、窓の外は深い青。窓から雨の筋が床に落ちる。',
    librarian: { position: [-3.6, 0, -0.2], facingDeg: 20 },
    visitor: { position: [7.6, 0, -2.6], onStage: false },
    look: {
      fohL: { level: 0.2, color: C.warm }, fohC: { level: 0.12, color: C.warm }, fohR: { level: 0.08, color: C.night },
      usL: { level: 0.1, color: C.warm }, usR: { level: 0.06, color: C.night },
      backL: { level: 0.1, color: C.steel }, backR: { level: 0.1, color: C.steel },
      cycL: { level: 0.1, color: C.rainSky }, cycR: { level: 0.1, color: C.rainSky },
      desk: 0.5, rain: { level: 0.7, color: C.moon }, side: { level: 0.35, color: C.amber },
    },
    bookOnDesk: false,
  },
  {
    chapter: 0, title: '遅い来訪者', triggerType: 'sound', trigger: '扉の鈴', note: '上手の扉から来訪者が入る。扉の外の冷たい光と、上手の前明かりで顔を見せる。',
    librarian: { position: [-3.4, 0, -0.6], facingDeg: 70 },
    visitor: { position: [4.6, 0, -2.4], facingDeg: -80 },
    look: {
      fohL: { level: 0.18, color: C.warm }, fohC: { level: 0.12, color: C.warm }, fohR: { level: 0.2, color: C.night },
      usL: { level: 0.08, color: C.warm }, usR: { level: 0.1, color: C.night },
      backL: { level: 0.1, color: C.steel }, backR: { level: 0.14, color: C.steel },
      cycL: { level: 0.1, color: C.rainSky }, cycR: { level: 0.1, color: C.rainSky },
      desk: 0.45, rain: { level: 0.7, color: C.moon }, door: { level: 0.45, color: C.door }, side: { level: 0.28, color: C.amber },
    },
    suitcase: true,
  },
  {
    chapter: 0, title: '返された本', triggerType: 'dialogue', trigger: 'この本を、返しに来ました', note: '二人が机をはさむ。机の灯りと中央の前明かりに絞り、書架と窓は沈める。',
    librarian: { position: [-1.1, 0, -2.0], facingDeg: 60 },
    visitor: { position: [1.5, 0, -2.0], facingDeg: -60 },
    look: {
      fohL: { level: 0.08, color: C.warm }, fohC: { level: 0.26, color: C.warm }, fohR: { level: 0.08, color: C.night },
      usL: { level: 0.04, color: C.warm }, usR: { level: 0.04, color: C.night },
      backL: { level: 0.14, color: C.steel }, backR: { level: 0.14, color: C.steel },
      cycL: { level: 0.06, color: C.rainSky }, cycR: { level: 0.06, color: C.rainSky },
      desk: 0.85, rain: { level: 0.45, color: C.moon }, side: { level: 0.22, color: C.amber },
    },
    suitcase: true, bookOnDesk: true,
  },
  {
    chapter: 0, title: '雷鳴', triggerType: 'sound', trigger: '近くで雷が鳴る', note: '前明かりを落とす。稲光で窓の外と二人の輪郭だけを白く浮かべる。',
    librarian: { position: [-1.1, 0, -2.0], facingDeg: 150 },
    visitor: { position: [1.5, 0, -2.0], facingDeg: -150 },
    look: {
      backL: { level: 0.3, color: C.steel }, backR: { level: 0.3, color: C.steel },
      cycL: { level: 0.32, color: C.flash }, cycR: { level: 0.32, color: C.flash },
      rain: { level: 0.9, color: C.flash },
    },
    suitcase: true, bookOnDesk: true,
  },
  {
    chapter: 1, title: '余白の言葉', triggerType: 'dialogue', trigger: '続きを、読んでください', note: '雷が去る。机の灯りと二人の顔だけを残し、空はもっとも暗い青に。',
    librarian: { position: [-0.7, 0, -2.0], facingDeg: 80 },
    visitor: { position: [0.9, 0, -2.0], facingDeg: -80 },
    look: {
      fohL: { level: 0.05, color: C.warm }, fohC: { level: 0.2, color: C.warmPale },
      backL: { level: 0.12, color: C.lavender }, backR: { level: 0.12, color: C.lavender },
      cycL: { level: 0.05, color: C.deepSky }, cycR: { level: 0.05, color: C.deepSky },
      desk: 0.9, rain: { level: 0.3, color: C.moon }, side: { level: 0.2, color: C.amber },
    },
    suitcase: true, bookOnDesk: true,
  },
  {
    chapter: 1, title: '雨がやむ', triggerType: 'sound', trigger: '雨音が止む', note: '雨の筋が消え、地平から朝焼けが上がる。前明かりを少しずつ戻す。',
    librarian: { position: [-0.7, 0, -2.0], facingDeg: 160 },
    visitor: { position: [1.6, 0, -3.4], facingDeg: 170 },
    look: {
      fohL: { level: 0.14, color: C.warm }, fohC: { level: 0.2, color: C.warm }, fohR: { level: 0.14, color: C.warm },
      usL: { level: 0.1, color: C.warm }, usR: { level: 0.1, color: C.warm },
      backL: { level: 0.12, color: C.lavender }, backR: { level: 0.12, color: C.lavender },
      cycL: { level: 0.3, color: C.dawnLow, target: [-3.2, 1.4, -7.4] }, cycR: { level: 0.3, color: C.dawnLow, target: [3.2, 1.4, -7.4] },
      desk: 0.5, sun: { level: 0.35, color: C.dawnLow }, side: { level: 0.25, color: C.amber },
    },
    suitcase: true, bookOnDesk: true,
  },
  {
    chapter: 1, title: '本を持って出る', triggerType: 'dialogue', trigger: 'また明日', note: '来訪者が本を持って上手の扉へ。朝日が窓枠の形で床に入る。司書は机に残る。',
    librarian: { position: [-0.6, 0, -1.6], facingDeg: 60 },
    visitor: { position: [4.4, 0, -2.4], facingDeg: 90 },
    look: {
      fohL: { level: 0.16, color: C.warm }, fohC: { level: 0.18, color: C.warm }, fohR: { level: 0.24, color: C.warm },
      usL: { level: 0.12, color: C.warm }, usR: { level: 0.16, color: C.warm },
      backL: { level: 0.14, color: C.amber }, backR: { level: 0.14, color: C.amber },
      cycL: { level: 0.3, color: C.dawnSky, target: [-3.2, 2.4, -7.4] }, cycR: { level: 0.3, color: C.dawnSky, target: [3.2, 2.4, -7.4] },
      desk: 0.35, sun: { level: 0.8, color: C.sun }, door: { level: 0.5, color: C.sun }, side: { level: 0.2, color: C.amber },
    },
    suitcase: false, bookWithVisitor: true,
  },
  {
    chapter: 1, title: '開館', triggerType: 'light', trigger: '朝の光が広がる', note: '来訪者は去った。朝の光で部屋全体を明るく見せて終える。',
    librarian: { position: [-3.6, 0, -0.4], facingDeg: 0 },
    visitor: { position: [7.6, 0, -2.4], onStage: false },
    look: {
      fohL: { level: 0.36, color: C.warmPale }, fohC: { level: 0.36, color: C.warmPale }, fohR: { level: 0.36, color: C.warmPale },
      usL: { level: 0.24, color: C.warmPale }, usR: { level: 0.24, color: C.warmPale },
      backL: { level: 0.16, color: C.amber }, backR: { level: 0.16, color: C.amber },
      cycL: { level: 0.45, color: C.morningSky, target: [-3.2, 3.6, -7.4] }, cycR: { level: 0.45, color: C.morningSky, target: [3.2, 3.6, -7.4] },
      sun: { level: 0.9, color: C.sun }, side: { level: 0.25, color: C.amber },
    },
    suitcase: false,
  },
]

const block = (id: string, name: string, x: number, z: number, rows: number, columns: number): AudienceBlock => ({
  id: `sample-${id}`, name, position: [x, z], rows, seatsPerRow: columns, rowSpacing: 0.9, seatSpacing: 0.62, rotationDeg: 0,
})

type Prop = Pick<SetPiece, 'name' | 'size' | 'color' | 'position'> & { kind?: 'box' | 'platform'; appearance?: SetPiece['appearance']; rotationY?: number }
const PROPS: Record<string, Prop> = {
  platform: { kind: 'platform', name: '奥の段', size: [11, 0.3, 2.4], color: '#4a3c35', position: [0, 0.15, -5.9] },
  shelfL: { name: '書架・下手', appearance: 'bookshelf', size: [2.2, 2.6, 0.5], color: '#4b3833', position: [-4.6, 1.6, -6.6] },
  shelfC: { name: '書架・中央', appearance: 'bookshelf', size: [2.2, 2.6, 0.5], color: '#4b3833', position: [-2.2, 1.6, -6.6] },
  window: { name: '雨の窓', appearance: 'window', size: [2.8, 2.7, 0.16], color: '#5b6877', position: [2.4, 1.95, -6.7] },
  bench: { name: '窓辺のベンチ', appearance: 'bench', size: [1.8, 0.45, 0.5], color: '#6a5040', position: [2.4, 0.525, -5.6] },
  door: { name: '上手の扉', appearance: 'door', size: [1.1, 2.2, 0.14], color: '#5f504c', position: [5.4, 1.1, -2.6], rotationY: -Math.PI / 2 },
  counter: { name: '受付の台', size: [2.2, 1.0, 0.7], color: '#6b4f3e', position: [-4.3, 0.5, -1.0] },
  desk: { name: '閲覧机', appearance: 'table', size: [2.2, 0.76, 1.1], color: '#715241', position: [0.2, 0.38, -2.6] },
  stack: { name: '返却の本の山', size: [0.5, 0.3, 0.36], color: '#8c6a4a', position: [-4.8, 1.15, -1.0] },
}

export function createSampleProduction() {
  const store = useStore.getState()
  store.loadPreset('empty')
  store.ensureScenes()
  store.updateProductionPlan({ projectTitle: '雨を待つ図書室' })
  const venue = { stageShape: 'proscenium' as const, stageWidth: 14, stageDepth: 10, targetCapacity: 192, stageTemplate: 'proscenium' as const }
  // 額縁舞台のひな形から、いちばん手前の袖幕だけ外す。客席からの前明かりを受けて、灰色の箱のように見えていた
  store.updateVenueLayout({ ...venue, stageParts: templateParts('proscenium', venue).filter(part => !/^wing-(left|right)-1$/.test(part.id)) })
  store.updateSettings({ showHouseLights: false, cameraView: 'audience', ambient: 0.07, hazeDensity: 0.07, exposure: 1.3, bloom: 0.25 })
  useStore.setState(state => ({
    productionPlan: { ...state.productionPlan, audienceBlocks: [block('left', '客席・下手', -3.6, 10, 8, 12), block('right', '客席・上手', 3.6, 10, 8, 12)] },
  }))
  const plan = useStore.getState().productionPlan
  const chapterIds = [plan.chapters![0].id]
  store.updateChapter(chapterIds[0], '第一章・閉館')

  const librarian = store.addPerformer([-3.6, 0, -0.2])
  const visitor = store.addPerformer([7.6, 0, -2.6])
  store.updatePerformer(librarian, { name: '司書', color: '#8b665e', pose: 'standing' })
  store.updatePerformer(visitor, { name: '来訪者', color: '#4f6578', pose: 'standing' })

  const ids: Record<string, string> = {}
  for (const [key, prop] of Object.entries(PROPS)) {
    const id = store.addPrimitiveSetPiece(prop.kind ?? 'box', prop.position)
    const { kind: _kind, rotationY, ...fields } = prop
    store.updateSetPiece(id, { ...fields, ...(rotationY ? { rotation: [0, rotationY, 0] as [number, number, number] } : {}) })
    ids[key] = id
  }
  const addBook = () => {
    const id = store.addPrimitiveSetPiece('box', [0.4, 0.81, -2.6])
    store.updateSetPiece(id, { name: '返された本', size: [0.42, 0.1, 0.3], color: '#9a4e3a' })
    return id
  }
  const addSuitcase = () => {
    const id = store.addPrimitiveSetPiece('box', [4.2, 0.21, -1.7])
    store.updateSetPiece(id, { name: '来訪者の鞄', appearance: 'suitcase', size: [0.6, 0.42, 0.22], color: '#3f3a3a' })
    return id
  }

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

  let book: string | null = null
  let suitcase: string | null = null
  const apply = (scene: Scene, sceneId: string) => {
    const place = (id: string, p: Place) => store.updatePerformer(id, { position: p.position, facingDeg: p.facingDeg ?? 0, onStage: p.onStage ?? true })
    place(librarian, scene.librarian)
    place(visitor, scene.visitor)
    if (scene.suitcase && !suitcase) suitcase = addSuitcase()
    if (!scene.suitcase && suitcase) { store.removeSetPiece(suitcase); suitcase = null }
    const wantBook = scene.bookOnDesk || scene.bookWithVisitor
    if (wantBook && !book) book = addBook()
    if (!wantBook && book) { store.removeSetPiece(book); book = null }
    if (book && scene.bookWithVisitor) store.updateSetPiece(book, { position: [scene.visitor.position[0] - 0.3, 1.05, scene.visitor.position[2] + 0.25] })
    else if (book) store.updateSetPiece(book, { position: [0.4, 0.81, -2.6] })
    LIGHTS.forEach((light, index) => {
      const raw = scene.look[light.key]
      const cue: Cue = typeof raw === 'number' ? { level: raw } : raw ?? { level: 0 }
      const level = Math.min(1, cue.level * (light.measured === 'fresnel' ? FRESNEL_GAIN : 1))
      store.updateFixture(lightIds[index], {
        intensity: level, enabled: level > 0,
        ...(cue.color ? { color: cue.color } : {}),
        ...(cue.target ? { target: cue.target } : {}),
      })
    })
    store.updateScene(sceneId, { title: scene.title, triggerType: scene.triggerType ?? 'other', trigger: scene.trigger ?? '', note: scene.note })
  }

  let sceneId = useStore.getState().productionPlan.activeSceneId!
  SCENES.forEach((scene, index) => {
    if (index > 0) {
      if (scene.chapter === 1 && chapterIds.length === 1) {
        const second = store.addChapterAfter(chapterIds[0])!
        store.updateChapter(second, '第二章・夜明け')
        chapterIds.push(second)
        sceneId = useStore.getState().productionPlan.activeSceneId!
      } else sceneId = store.addSceneAt(chapterIds[scene.chapter], null)!
    }
    apply(scene, sceneId)
  })
  store.selectScene(useStore.getState().productionPlan.scenes[0].id)
  store.select(null, null)
}
