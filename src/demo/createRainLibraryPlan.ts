import { useStore } from '../store'

export function createRainLibraryPlan() {
  const store = useStore.getState()
  store.loadPreset('empty')
  store.ensureScenes()
  store.updateProductionPlan({ projectTitle: '雨を待つ図書室｜演出デモ' })
  store.updateSettings({
    showHouseLights: false, cameraView: 'audience', ambient: 0.08,
    hazeDensity: 0.23, exposure: 1.35, bloom: 0.32,
  })

  const opening = useStore.getState().productionPlan.activeSceneId!
  const firstChapter = useStore.getState().productionPlan.chapters![0].id
  store.updateChapter(firstChapter, '第一章・閉館')

  const librarian = store.addPerformer([-1.5, 0, -1.7])
  const visitor = store.addPerformer([8.7, 0, -2.4])
  store.updatePerformer(librarian, { name: '司書', color: '#8b665e', onStage: true })
  store.updatePerformer(visitor, { name: '来訪者', color: '#667c8c', onStage: false })

  const table = store.addPrimitiveSetPiece('box', [-0.5, 0.4, -2.9])
  const shelf = store.addPrimitiveSetPiece('box', [-4.4, 1.35, -6.1])
  const window = store.addPrimitiveSetPiece('box', [4.1, 1.4, -6.6])
  const book = store.addPrimitiveSetPiece('box', [-0.5, 0.86, -2.9])
  store.updateSetPiece(table, { name: '閲覧机', appearance: 'table', size: [2.4, 0.8, 1.2], color: '#715241' })
  store.updateSetPiece(shelf, { name: '書架', appearance: 'bookshelf', size: [2.3, 2.7, 0.55], color: '#4b3833' })
  store.updateSetPiece(window, { name: '雨の窓', appearance: 'window', size: [2.6, 2.8, 0.16], color: '#5b6877' })
  store.updateSetPiece(book, { name: '返却された本', size: [0.48, 0.12, 0.34], color: '#b28a57' })

  const frontLeft = store.addFixture('Fresnel8', [-3.8, 5.4, 0.8])
  const frontRight = store.addFixture('Fresnel8', [4.4, 5.2, 0.8])
  const tableLight = store.addFixture('Chauvet_COLORado2Solo', [-1.1, 6.8, 0])
  const shelfLight = store.addFixture('Fresnel8', [-5.5, 5.8, -3.7])
  const windowLight = store.addFixture('Chauvet_COLORado2Solo', [4.8, 6.2, -5.2])
  const leftRim = store.addFixture('Stairville_LEDPar64_RGBW', [-4.5, 6.3, -6.3])
  const rightRim = store.addFixture('Stairville_LEDPar64_RGBW', [4.5, 6.3, -6.3])
  const lightning = store.addFixture('Chauvet_COLORado2Solo', [5.7, 6.5, -5])
  const dawn = store.addFixture('Chauvet_COLORado2Solo', [0, 6.8, -6.8])
  const frontWashLeft = store.addFixture('Fresnel10', [-4.7, 6.8, 0.5])
  const frontWashRight = store.addFixture('Fresnel10', [4.7, 6.8, 0.5])
  const rearWashLeft = store.addFixture('Fresnel10', [-4.5, 6.8, -5.5])
  const rearWashRight = store.addFixture('Fresnel10', [4.5, 6.8, -5.5])
  store.updateFixture(frontLeft, {
    name: '司書の前明かり', target: [-1.5, 1.3, -2], beamAngleDeg: 30,
    intensity: 0.72, color: [1, 0.82, 0.64], gelEnabled: true, whiteMix: 0.22,
  })
  store.updateFixture(frontRight, {
    name: '来訪者の前明かり', target: [2.8, 1.3, -2.5], beamAngleDeg: 32,
    intensity: 0.76, color: [0.88, 0.9, 1], gelEnabled: true, whiteMix: 0.25, enabled: false,
  })
  store.updateFixture(tableLight, {
    name: '本と机の灯り', target: [-0.5, 0.85, -2.9], beamAngleDeg: 27,
    intensity: 0.3, color: [1, 0.72, 0.43], gelEnabled: true, whiteMix: 0.12,
  })
  store.updateFixture(shelfLight, {
    name: '書架の面明かり', target: [-4.4, 1.4, -5.9], beamAngleDeg: 28,
    intensity: 0.48, color: [1, 0.82, 0.66], gelEnabled: true, whiteMix: 0.16,
  })
  store.updateFixture(windowLight, {
    name: '窓からの雨明かり', target: [3.9, 1.4, -5.3], beamAngleDeg: 29,
    intensity: 0.24, color: [0.45, 0.66, 1], gelEnabled: true, whiteMix: 0.04,
  })
  store.updateFixture(leftRim, {
    name: '司書の輪郭', target: [-1.4, 1.3, -2.1],
    intensity: 0.25, color: [0.65, 0.78, 1], gelEnabled: true, whiteMix: 0.06,
  })
  store.updateFixture(rightRim, {
    name: '来訪者の輪郭', target: [2, 1.3, -2.7],
    intensity: 0.28, color: [0.52, 0.72, 1], gelEnabled: true, whiteMix: 0.04, enabled: false,
  })
  store.updateFixture(lightning, {
    name: '稲光', position: [5.5, 4.5, -5.2], target: [4.1, 1.7, -6.5], beamAngleDeg: 12,
    intensity: 0.07, color: [0.82, 0.9, 1], gelEnabled: true, whiteMix: 0.22, enabled: false,
  })
  store.updateFixture(dawn, {
    name: '夜明けの逆光', target: [0.5, 1.5, -3.2], beamAngleDeg: 34,
    intensity: 0.65, color: [1, 0.72, 0.45], gelEnabled: true, whiteMix: 0.1, enabled: false,
  })
  store.updateFixture(frontWashLeft, {
    name: '下手の地明かり', target: [-3.7, 0, -2], beamAngleDeg: 32,
    intensity: 0.52, color: [1, 0.84, 0.7], gelEnabled: true,
  })
  store.updateFixture(frontWashRight, {
    name: '上手の地明かり', target: [3.7, 0, -2], beamAngleDeg: 32,
    intensity: 0.48, color: [0.76, 0.85, 1], gelEnabled: true,
  })
  store.updateFixture(rearWashLeft, {
    name: '舞台奥・下手の地明かり', target: [-3.5, 0, -4.9], beamAngleDeg: 30,
    intensity: 0.3, color: [0.71, 0.8, 1], gelEnabled: true,
  })
  store.updateFixture(rearWashRight, {
    name: '舞台奥・上手の地明かり', target: [3.5, 0, -4.9], beamAngleDeg: 30,
    intensity: 0.3, color: [0.67, 0.78, 1], gelEnabled: true,
  })
  store.updateScene(opening, {
    title: '閉館前', note: '見せるもの：司書の顔、本、書架。窓の青を弱く残し、机の暖色を視線の中心にする。',
  })

  const arrival = store.addSceneAt(firstChapter, null)!
  store.updatePerformer(visitor, { onStage: true, position: [3.5, 0, -2.4] })
  store.updateFixture(frontRight, { enabled: true, target: [3.7, 1.3, -2.4] })
  store.updateFixture(rightRim, { enabled: true, target: [3.1, 1.3, -2.5] })
  store.updateFixture(frontWashRight, { intensity: 0.55 })
  store.updateScene(arrival, {
    title: '遅い来訪者', triggerType: 'sound', trigger: '扉の鈴',
    note: '来訪者が上手から入る。来訪者の前明かりと輪郭を加え、司書と本も見失わない。',
  })

  const returnBook = store.addSceneAt(firstChapter, null)!
  store.updatePerformer(visitor, { position: [1.8, 0, -1.8] })
  store.updatePerformer(librarian, { position: [-1.5, 0, -1.7] })
  store.updateFixture(frontRight, { target: [1.8, 1.3, -1.8] })
  store.updateFixture(rightRim, { target: [1.8, 1.3, -2] })
  store.updateFixture(tableLight, { intensity: 0.38 })
  store.updateFixture(shelfLight, { intensity: 0.18 })
  store.updateFixture(frontWashLeft, { intensity: 0.42 })
  store.updateFixture(frontWashRight, { intensity: 0.44 })
  store.updateFixture(rearWashLeft, { intensity: 0.2 })
  store.updateFixture(rearWashRight, { intensity: 0.2 })
  store.updateScene(returnBook, {
    title: '返された本', triggerType: 'dialogue', trigger: 'この本を、返しに来ました',
    note: '二人と机上の本を三角形に見せる。書架を落として、会話と本に視線を集める。',
  })

  const thunder = store.addSceneAt(firstChapter, null)!
  store.updateFixture(frontLeft, { enabled: false })
  store.updateFixture(frontRight, { enabled: false })
  store.updateFixture(tableLight, { enabled: false })
  store.updateFixture(shelfLight, { enabled: false })
  store.updateFixture(windowLight, { intensity: 0.47 })
  store.updateFixture(leftRim, { intensity: 0.42 })
  store.updateFixture(rightRim, { intensity: 0.42 })
  store.updateFixture(lightning, { enabled: true })
  store.updateFixture(frontWashLeft, { enabled: false })
  store.updateFixture(frontWashRight, { enabled: false })
  store.updateFixture(rearWashLeft, { enabled: false })
  store.updateFixture(rearWashRight, { enabled: false })
  store.updateScene(thunder, {
    title: '雷鳴', triggerType: 'sound', trigger: '近くで雷が鳴る',
    note: '顔を意図的に隠す。窓と二人の輪郭を冷たい光で浮かべ、本と書架は暗くする。',
  })

  const secondChapter = store.addChapterAfter(firstChapter)!
  store.updateChapter(secondChapter, '第二章・夜明け')
  const words = useStore.getState().productionPlan.activeSceneId!
  store.updateFixture(lightning, { enabled: false })
  store.updateFixture(windowLight, { intensity: 0.2 })
  store.updateFixture(leftRim, { intensity: 0.18 })
  store.updateFixture(rightRim, { intensity: 0.18 })
  store.updateFixture(frontLeft, { enabled: true, intensity: 0.68 })
  store.updateFixture(frontRight, { enabled: true, intensity: 0.76 })
  store.updateFixture(tableLight, { enabled: true, intensity: 0.33 })
  store.updateFixture(frontWashLeft, { enabled: true, intensity: 0.38 })
  store.updateFixture(frontWashRight, { enabled: true, intensity: 0.4 })
  store.updateFixture(rearWashLeft, { enabled: true, intensity: 0.16 })
  store.updateFixture(rearWashRight, { enabled: true, intensity: 0.16 })
  store.updateScene(words, {
    title: '余白の言葉', triggerType: 'dialogue', trigger: '続きを、読んでください',
    note: '雷が去り、暖色の机と二人の顔を戻す。背景は静かに沈める。',
  })

  const clearSky = store.addSceneAt(secondChapter, null)!
  store.updatePerformer(librarian, { position: [-0.8, 0, -1.7] })
  store.updatePerformer(visitor, { position: [0.9, 0, -1.7] })
  store.updateFixture(frontLeft, { target: [-0.8, 1.3, -1.8], intensity: 0.66, color: [1, 0.88, 0.72] })
  store.updateFixture(frontRight, { target: [0.9, 1.3, -1.8], intensity: 0.66, color: [1, 0.86, 0.7] })
  store.updateFixture(windowLight, { intensity: 0.12 })
  store.updateFixture(dawn, { enabled: true, intensity: 0.54 })
  store.updateFixture(frontWashLeft, { intensity: 0.47, color: [1, 0.88, 0.76] })
  store.updateFixture(frontWashRight, { intensity: 0.45, color: [1, 0.87, 0.74] })
  store.updateFixture(rearWashLeft, { intensity: 0.28, color: [1, 0.78, 0.61] })
  store.updateFixture(rearWashRight, { intensity: 0.28, color: [1, 0.77, 0.59] })
  store.updateScene(clearSky, {
    title: '雨がやむ', triggerType: 'sound', trigger: '雨音が止む',
    note: '二人が机に寄る。窓の青を弱め、夜明けの逆光と柔らかい前明かりを重ねる。',
  })

  const leave = store.addSceneAt(secondChapter, null)!
  store.updatePerformer(visitor, { position: [4.1, 0, -1.5] })
  store.updateFixture(frontRight, { target: [4.0, 1.3, -1.5], intensity: 0.8, beamAngleDeg: 32 })
  store.updateFixture(rightRim, { target: [3.5, 1.3, -1.6], intensity: 0.25 })
  store.updateSetPiece(book, { position: [3.9, 1.05, -1.5] })
  store.updateFixture(tableLight, { intensity: 0.22 })
  store.updateFixture(frontWashLeft, { intensity: 0.4 })
  store.updateFixture(frontWashRight, { intensity: 0.55 })
  store.updateScene(leave, {
    title: '本を持って出る', triggerType: 'dialogue', trigger: 'また明日',
    note: '来訪者が本を持ち上手へ向かう。前明かりを移動先まで広げ、司書も明るさを保つ。',
  })

  const emptyRoom = store.addSceneAt(secondChapter, null)!
  store.updatePerformer(visitor, { onStage: false, position: [8.7, 0, -1.5] })
  store.removeSetPiece(book)
  store.updateFixture(frontRight, { enabled: false })
  store.updateFixture(rightRim, { enabled: false })
  store.updateFixture(frontLeft, { intensity: 0.9 })
  store.updateFixture(tableLight, { intensity: 0.12 })
  store.updateFixture(dawn, { intensity: 0.74, target: [1.6, 1.4, -3.5] })
  store.updateFixture(shelfLight, { enabled: true, intensity: 0.42 })
  store.updateFixture(frontWashLeft, { intensity: 0.53 })
  store.updateFixture(frontWashRight, { intensity: 0.5 })
  store.updateFixture(rearWashLeft, { intensity: 0.36 })
  store.updateFixture(rearWashRight, { intensity: 0.36 })
  store.updateScene(emptyRoom, {
    title: '開館', triggerType: 'light', trigger: '朝の光が広がる',
    note: '来訪者と本は退場する。司書、机、書架、窓を朝の光で見せて終える。',
  })

  store.selectScene(returnBook)
  store.select(null, null)
}
