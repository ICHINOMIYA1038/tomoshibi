import { useStore } from '../store'

export function createShowcasePlan() {
  const store = useStore.getState()
  store.loadPreset('empty')
  store.ensureScenes()
  store.updateProductionPlan({ projectTitle: '灯の帰路｜演出デモ' })
  store.updateSettings({
    showHouseLights: false, cameraView: 'audience', ambient: 0.12,
    hazeDensity: 0.32, exposure: 1.15, bloom: 0.48,
  })

  const opening = useStore.getState().productionPlan.activeSceneId!
  const firstChapter = useStore.getState().productionPlan.chapters![0].id
  store.updateChapter(firstChapter, '第一章・終電')

  const traveler = store.addPerformer([-8.7, 0, -2])
  const stationMaster = store.addPerformer([8.7, 0, -3])
  store.updatePerformer(traveler, { name: '旅人', color: '#9a6754', onStage: false })
  store.updatePerformer(stationMaster, { name: '駅員', color: '#526c85', onStage: false })

  const bench = store.addPrimitiveSetPiece('platform', [-2.4, 0.45, -4.7])
  const door = store.addPrimitiveSetPiece('box', [4.8, 1.1, -5.4])
  const suitcase = store.addPrimitiveSetPiece('box', [-5, 0.24, -2])
  store.updateSetPiece(bench, { name: 'ホームのベンチ', appearance: 'bench', size: [2.8, 0.9, 0.85], color: '#765c48' })
  store.updateSetPiece(door, { name: '駅の扉', appearance: 'door', size: [1.45, 2.2, 0.22], color: '#555767' })
  store.updateSetPiece(suitcase, { name: '旅人の鞄', appearance: 'suitcase', size: [0.72, 0.48, 0.4], color: '#a86d48' })

  const moonLeft = store.addFixture('Stairville_LEDPar64_RGBW', [-5, 6.2, -5])
  const moonRight = store.addFixture('Stairville_LEDPar64_RGBW', [5, 6.2, -5])
  const follow = store.addFixture('Chauvet_COLORado2Solo', [-2, 7.2, 2])
  const doorLight = store.addFixture('Fresnel8', [6, 5.6, -3.5])
  const dawn = store.addFixture('Chauvet_COLORado2Solo', [0, 6.8, -6])
  const frontLeft = store.addFixture('Chauvet_COLORado2Solo', [-5, 6.5, 2])
  const frontRight = store.addFixture('Chauvet_COLORado2Solo', [5, 6.5, 2])
  store.updateFixture(moonLeft, {
    name: '月明かり・下手', target: [-3, 1.2, -3], intensity: 0.42,
    color: [0.42, 0.62, 1], gelEnabled: true, whiteMix: 0, enabled: true,
  })
  store.updateFixture(moonRight, {
    name: '月明かり・上手', target: [3, 1.2, -3], intensity: 0.35,
    color: [0.45, 0.66, 1], gelEnabled: true, whiteMix: 0, enabled: true,
  })
  store.updateFixture(follow, {
    name: '旅人の追い明かり', target: [-4, 1.2, -2], beamAngleDeg: 26, intensity: 0.42,
    color: [1, 0.75, 0.5], gelEnabled: true, whiteMix: 0.12, enabled: false,
  })
  store.updateFixture(doorLight, {
    name: '扉の明かり', target: [4.8, 1.2, -4.9], intensity: 0.54,
    color: [1, 0.8, 0.5], gelEnabled: true, enabled: false,
  })
  store.updateFixture(dawn, {
    name: '夜明けの逆光', target: [0, 1.5, -2.8], beamAngleDeg: 32, intensity: 0.7,
    color: [1, 0.64, 0.35], gelEnabled: true, whiteMix: 0.08, enabled: false,
  })
  store.updateFixture(frontLeft, {
    name: '下手の前明かり', target: [-2.6, 0.9, -3.2], beamAngleDeg: 30, intensity: 0.56,
    color: [0.72, 0.82, 1], gelEnabled: true, whiteMix: 0.18, enabled: true,
  })
  store.updateFixture(frontRight, {
    name: '上手の前明かり', target: [3.2, 0.9, -3.5], beamAngleDeg: 30, intensity: 0.56,
    color: [0.72, 0.82, 1], gelEnabled: true, whiteMix: 0.18, enabled: true,
  })
  store.updateScene(opening, {
    title: '終電のホーム', note: '誰もいないホーム。青い光の中に、ベンチと扉と置き忘れた鞄が浮かぶ。',
  })

  const footstep = store.addSceneAt(firstChapter, null)!
  store.updatePerformer(traveler, { onStage: true, position: [-4.2, 0, -2] })
  store.updateFixture(follow, { enabled: true, target: [-4.2, 1.2, -2] })
  store.updateScene(footstep, {
    title: '足音', triggerType: 'sound', trigger: '一人分の足音',
    note: '旅人が下手袖から入る。追い明かりは旅人を捉え、月明かりは残す。',
  })

  const lostItem = store.addSceneAt(firstChapter, null)!
  store.updatePerformer(traveler, { position: [-1.2, 0, -2.3] })
  store.updatePerformer(stationMaster, { onStage: true, position: [3.7, 0, -2.8] })
  store.updateSetPiece(suitcase, { position: [-1.2, 0.24, -2] })
  store.updateFixture(follow, { target: [-1.2, 1.2, -2.3] })
  store.updateFixture(doorLight, { enabled: true })
  store.updateScene(lostItem, {
    title: '忘れ物', triggerType: 'dialogue', trigger: 'それ、あなたのですか',
    note: '駅員が上手から現れる。鞄を目印に二人が向かい合い、扉の明かりが点く。',
  })

  const stoppedClock = store.addSceneAt(firstChapter, null)!
  store.updatePerformer(traveler, { position: [0, 0, -3] })
  store.updatePerformer(stationMaster, { position: [2.5, 0, -3] })
  store.updateFixture(follow, { target: [0, 1.3, -3], intensity: 0.42 })
  store.updateFixture(moonRight, { enabled: false })
  store.updateScene(stoppedClock, {
    title: '止まった時計', triggerType: 'sound', trigger: '時計の音が止まる',
    note: '二人が舞台奥で足を止める。上手の月明かりだけ消し、空間を狭める。',
  })

  const blackout = store.addSceneAt(firstChapter, null)!
  store.updateFixture(moonLeft, { enabled: false })
  store.updateFixture(follow, { enabled: false })
  store.updateFixture(doorLight, { enabled: false })
  store.updateFixture(frontLeft, { enabled: false })
  store.updateFixture(frontRight, { enabled: false })
  store.updateFixture(dawn, { enabled: true, intensity: 0.12 })
  store.updateScene(blackout, {
    title: '消灯', triggerType: 'light', trigger: 'ホーム灯が落ちる',
    note: '役者はそのまま。ホームの明かりを落とし、扉の奥に夜明けの気配だけ残す。',
  })

  const secondChapter = store.addChapterAfter(firstChapter)!
  store.updateChapter(secondChapter, '第二章・夜明け')
  const openDoor = useStore.getState().productionPlan.activeSceneId!
  store.updateSetPiece(door, { position: [6.2, 1.1, -5.4] })
  store.updatePerformer(traveler, { position: [2.2, 0, -3.2] })
  store.updatePerformer(stationMaster, { position: [4.2, 0, -3.2] })
  store.updateFixture(dawn, { intensity: 0.62, target: [3, 1.4, -3.5] })
  store.updateFixture(moonLeft, { enabled: true, intensity: 0.22, target: [-2, 0.8, -3.6] })
  store.updateFixture(frontLeft, {
    enabled: true, position: [0, 6.5, 2], target: [2.2, 1.2, -3.2],
    intensity: 0.4, color: [1, 0.75, 0.52],
  })
  store.updateFixture(frontRight, {
    enabled: true, intensity: 0.52, target: [5.1, 1.2, -4.4], color: [1, 0.78, 0.55],
  })
  store.updateScene(openDoor, {
    title: '開く扉', triggerType: 'sound', trigger: '扉が開く音',
    note: '扉を上手に引いて開ける。二人が扉に近づき、逆光をゆっくり強める。',
  })

  const goHome = store.addSceneAt(secondChapter, null)!
  store.updatePerformer(traveler, { position: [3.8, 0, -2.2] })
  store.updatePerformer(stationMaster, { position: [5.3, 0, -3.5] })
  store.updateSetPiece(suitcase, { position: [4.1, 0.24, -2] })
  store.updateFixture(follow, {
    enabled: true, position: [1.5, 7.2, 2], target: [3.8, 1.2, -2.2],
    intensity: 0.5, color: [1, 0.82, 0.57],
  })
  store.updateScene(goHome, {
    title: '帰ろう', triggerType: 'dialogue', trigger: '帰ろう',
    note: '旅人と鞄が扉へ進む。追い明かりの位置と狙いを上手側へ移す。',
  })

  const sunrise = store.addSceneAt(secondChapter, null)!
  store.updatePerformer(traveler, { onStage: false, position: [8.7, 0, -2.2] })
  store.updatePerformer(stationMaster, { onStage: false, position: [8.7, 0, -3.5] })
  store.removeSetPiece(suitcase)
  store.updateFixture(follow, { enabled: false })
  store.updateFixture(dawn, { intensity: 0.9, target: [0, 1.5, -2.8] })
  store.updateFixture(frontLeft, { intensity: 0.48, color: [1, 0.88, 0.72] })
  store.updateFixture(frontRight, { intensity: 0.48, color: [1, 0.88, 0.72] })
  store.updateScene(sunrise, {
    title: '朝の光', triggerType: 'light', trigger: '夜が明ける',
    note: '二人が上手へ退場。鞄も舞台から消え、空になったホームに朝の光が広がる。',
  })

  store.selectScene(footstep)
  store.select(null, null)
}
