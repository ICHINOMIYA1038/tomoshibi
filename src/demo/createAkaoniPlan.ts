import { useStore } from '../store'

export function createAkaoniPlan() {
  const store = useStore.getState()
  store.loadPreset('empty')
  store.ensureScenes()
  store.updateProductionPlan({ projectTitle: '赤鬼｜浜辺の演出案' })
  store.updateSettings({
    showHouseLights: false, cameraView: 'audience', ambient: 0.06,
    hazeDensity: 0.19, exposure: 1.3, bloom: 0.25,
  })

  const opening = useStore.getState().productionPlan.activeSceneId!
  const shoreChapter = useStore.getState().productionPlan.chapters![0].id
  store.updateChapter(shoreChapter, '第一章・浜辺')

  const woman = store.addPerformer([-2.1, 0, -2.2])
  const tonbi = store.addPerformer([-4.2, 0, -2.8])
  const mizukane = store.addPerformer([3.9, 0, -2.6])
  const demon = store.addPerformer([8.7, 0, -4.2])
  store.updatePerformer(woman, { name: 'あの女', color: '#9f756d', onStage: true })
  store.updatePerformer(tonbi, { name: 'とんび', color: '#777e79', onStage: true })
  store.updatePerformer(mizukane, { name: 'ミズカネ', color: '#7a7182', onStage: true })
  store.updatePerformer(demon, { name: '赤鬼', color: '#b75d4b', onStage: false })

  const shore = store.addPrimitiveSetPiece('platform', [0, 0.04, -2.9])
  const sea = store.addPrimitiveSetPiece('platform', [0, 0.02, -6.3])
  const caveLeft = store.addPrimitiveSetPiece('box', [-4.8, 1.1, -5.25])
  const caveRight = store.addPrimitiveSetPiece('box', [-2.4, 1, -5.4])
  store.updateSetPiece(shore, { name: '浜の地面', size: [10.5, 0.08, 5.2], color: '#806e5b' })
  store.updateSetPiece(sea, { name: '海との境界', size: [10.6, 0.04, 1.4], color: '#304752' })
  store.updateSetPiece(caveLeft, { name: '洞窟・左の岩', size: [1, 2.2, 0.6], color: '#383b3b' })
  store.updateSetPiece(caveRight, { name: '洞窟・右の岩', size: [0.8, 2, 0.6], color: '#343737' })

  const frontLeftWash = store.addFixture('Fresnel10', [-4.8, 6.8, 0.2])
  const frontRightWash = store.addFixture('Fresnel10', [4.8, 6.8, 0.2])
  const rearLeftWash = store.addFixture('Fresnel10', [-4.8, 6.8, -5.8])
  const rearRightWash = store.addFixture('Fresnel10', [4.8, 6.8, -5.8])
  const womanFront = store.addFixture('Fresnel8', [-4.5, 5.8, 1.4])
  const groupFront = store.addFixture('Fresnel8', [4.5, 5.8, 1.4])
  const demonFront = store.addFixture('Fresnel8', [1, 5.8, 1.4])
  const seaLight = store.addFixture('Chauvet_COLORado2Solo', [0, 6.8, -6])
  const demonRim = store.addFixture('Stairville_LEDPar64_RGBW', [2, 6.6, -5.8])
  const caveLight = store.addFixture('Stairville_LEDPar64_RGBW', [-5.3, 6.2, -6])
  const clothLight = store.addFixture('Chauvet_COLORado2Solo', [0, 6.8, -1])
  const boatRim = store.addFixture('Chauvet_COLORado2Solo', [4.8, 6.7, -6.7])
  store.updateFixture(frontLeftWash, {
    name: '地明かり・手前下手', target: [-2.8, 1, -2.5], beamAngleDeg: 28,
    intensity: 0.22, gelEnabled: false,
  })
  store.updateFixture(frontRightWash, {
    name: '地明かり・手前上手', target: [2.8, 1, -2.5], beamAngleDeg: 28,
    intensity: 0.2, gelEnabled: false,
  })
  store.updateFixture(rearLeftWash, {
    name: '地明かり・奥下手', target: [-2.8, 1, -4.7], beamAngleDeg: 26,
    intensity: 0.12, gelEnabled: false,
  })
  store.updateFixture(rearRightWash, {
    name: '地明かり・奥上手', target: [2.8, 1, -4.7], beamAngleDeg: 26,
    intensity: 0.12, gelEnabled: false,
  })
  store.updateFixture(womanFront, {
    name: 'あの女の前明かり', target: [-2.1, 1.35, -2.2], beamAngleDeg: 28,
    intensity: 0.52, gelEnabled: false,
  })
  store.updateFixture(groupFront, {
    name: '浜の人物の前明かり', target: [3.9, 1.35, -2.6], beamAngleDeg: 28,
    intensity: 0.42, gelEnabled: false,
  })
  store.updateFixture(demonFront, {
    name: '赤鬼の前明かり', target: [3, 1.35, -4.2], beamAngleDeg: 26,
    intensity: 0.3, gelEnabled: false, enabled: false,
  })
  store.updateFixture(seaLight, {
    name: '海の奥行き', target: [0, 2.2, -7.2], beamAngleDeg: 26,
    intensity: 0.16, color: [0.28, 0.43, 0.55], whiteMix: 0,
  })
  store.updateFixture(demonRim, {
    name: '赤鬼の輪郭', target: [3, 1.3, -4.2], intensity: 0.28,
    color: [0.86, 0.22, 0.16], whiteMix: 0, enabled: false,
  })
  store.updateFixture(caveLight, {
    name: '洞窟の内側', target: [-3.6, 1.2, -5.2], intensity: 0.28,
    color: [0.95, 0.68, 0.38], whiteMix: 0, enabled: false,
  })
  store.updateFixture(clothLight, {
    name: '赤い布の明かり', target: [0.3, 0.2, -2.4], beamAngleDeg: 18,
    intensity: 0.12, color: [1, 0.78, 0.47], whiteMix: 0, enabled: false,
  })
  store.updateFixture(boatRim, {
    name: '舟の逆光', target: [0, 1.2, -5.7], beamAngleDeg: 28,
    intensity: 0.2, color: [0.42, 0.58, 0.75], whiteMix: 0, enabled: false,
  })
  store.updateScene(opening, {
    title: '波のあと', triggerType: 'sound', trigger: '波音が静まる',
    note: '野田秀樹『赤鬼』を題材にした非公式の配置案。とんびは下手、あの女は中央、ミズカネは上手。海の境界だけ青く残す。',
  })

  const arrival = store.addSceneAt(shoreChapter, null)!
  store.updatePerformer(demon, { onStage: true, position: [3, 0, -4.2] })
  store.updatePerformer(mizukane, { position: [4.6, 0, -1.8] })
  store.updateFixture(demonFront, { enabled: true, intensity: 0.2 })
  store.updateFixture(demonRim, { enabled: true })
  store.updateFixture(seaLight, { intensity: 0.22 })
  store.updateFixture(frontRightWash, { intensity: 0.16 })
  store.updateScene(arrival, {
    title: '浜に現れた影', triggerType: 'light', trigger: '海の奥に輪郭が現れる',
    note: '赤鬼が海側から現れ、ミズカネは上手へ退く。輪郭の赤は赤鬼だけに使い、地明かりの色は変えない。',
  })

  const flower = store.addSceneAt(shoreChapter, null)!
  const redCloth = store.addPrimitiveSetPiece('box', [0.9, 0.04, -2.6])
  store.updateSetPiece(redCloth, { name: '赤い布（花のしるし）', size: [0.8, 0.08, 0.5], color: '#a24a3a' })
  store.updatePerformer(woman, { position: [0, 0, -2.2] })
  store.updatePerformer(demon, { position: [1.8, 0, -3.2] })
  store.updateFixture(womanFront, { target: [0, 1.35, -2.2], intensity: 0.58 })
  store.updateFixture(demonFront, { target: [1.8, 1.35, -3.2], intensity: 0.36 })
  store.updateFixture(demonRim, { target: [1.8, 1.3, -3.2], intensity: 0.16 })
  store.updateFixture(clothLight, { enabled: true, target: [0.9, 0.2, -2.6] })
  store.updateFixture(seaLight, { intensity: 0.12 })
  store.updateScene(flower, {
    title: '花のしるし', triggerType: 'other', trigger: '赤い布を置く',
    note: 'あの女と赤鬼が中央へ近づく。赤い布を花のしるしに見立て、二人の距離と手元を見せる。',
  })

  const caveChapter = store.addChapterAfter(shoreChapter)!
  store.updateChapter(caveChapter, '第二章・洞窟')
  const caveScene = useStore.getState().productionPlan.activeSceneId!
  store.updatePerformer(woman, { position: [-2.8, 0, -4.6] })
  store.updatePerformer(demon, { position: [-3.8, 0, -5.1] })
  store.updatePerformer(tonbi, { position: [-5.2, 0, -3.8] })
  store.updatePerformer(mizukane, { position: [-0.5, 0, -3.8] })
  store.updateSetPiece(redCloth, { position: [-3.4, 0.04, -4.8] })
  store.updateFixture(womanFront, { target: [-2.8, 1.35, -4.6], intensity: 0.36 })
  store.updateFixture(groupFront, { target: [-0.5, 1.35, -3.8], intensity: 0.32 })
  store.updateFixture(demonFront, { target: [-3.8, 1.35, -5.1], intensity: 0.3 })
  store.updateFixture(demonRim, { enabled: false })
  store.updateFixture(clothLight, { enabled: false })
  store.updateFixture(caveLight, { enabled: true })
  store.updateFixture(seaLight, { intensity: 0.04 })
  store.updateFixture(frontLeftWash, { intensity: 0.13 })
  store.updateFixture(frontRightWash, { intensity: 0.13 })
  store.updateFixture(rearLeftWash, { intensity: 0.1 })
  store.updateFixture(rearRightWash, { intensity: 0.1 })
  store.updateScene(caveScene, {
    title: '洞窟で向き合う', triggerType: 'sound', trigger: '外の波音が遠のく',
    note: '洞窟の口を二つの岩で示す。あの女と赤鬼を内側に、ミズカネととんびを外側に置く。地明かりは4灯とも同じ色で絞る。',
  })

  const voyageChapter = store.addChapterAfter(caveChapter)!
  store.updateChapter(voyageChapter, '第三章・海の向こう')
  const voyage = useStore.getState().productionPlan.activeSceneId!
  const boat = store.addPrimitiveSetPiece('platform', [0, 0.18, -5.8])
  store.updateSetPiece(boat, { name: '舟', size: [4.4, 0.36, 1.2], color: '#59493c' })
  store.updatePerformer(woman, { position: [-1.5, 0.36, -5.7] })
  store.updatePerformer(tonbi, { position: [-0.5, 0.36, -5.7] })
  store.updatePerformer(mizukane, { position: [0.5, 0.36, -5.7] })
  store.updatePerformer(demon, { position: [1.5, 0.36, -5.7] })
  store.updateFixture(caveLight, { enabled: false })
  store.updateFixture(womanFront, { target: [-1.5, 1.7, -5.7], intensity: 0.42 })
  store.updateFixture(groupFront, { target: [0.6, 1.7, -5.7], intensity: 0.38 })
  store.updateFixture(demonFront, { target: [1.5, 1.7, -5.7], intensity: 0.36 })
  store.updateFixture(seaLight, { intensity: 0.28 })
  store.updateFixture(boatRim, { enabled: true, intensity: 0.18 })
  store.updateFixture(frontLeftWash, { intensity: 0.08 })
  store.updateFixture(frontRightWash, { intensity: 0.08 })
  store.updateFixture(rearLeftWash, { intensity: 0.08 })
  store.updateFixture(rearRightWash, { intensity: 0.08 })
  store.updateScene(voyage, {
    title: '海の向こうへ', triggerType: 'sound', trigger: '舟のきしむ音',
    note: '四人が舟に乗る。浜の地明かりを弱め、海の青と舟の輪郭を残す。',
  })

  store.selectScene(arrival)
  store.select(null, null)
}
