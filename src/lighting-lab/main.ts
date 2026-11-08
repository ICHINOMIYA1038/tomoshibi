import * as THREE from 'three'
import { FIXTURE_PROFILES } from '../lighting/fixtureTypes'
import { illuminanceAt, parseIES, prepareFixture, type LabFixture, type MeasuredFixture, type Vector3Tuple } from './photometry'
import './style.css'

type Cue = 'blackout' | 'single' | 'singleVertical' | 'wash' | 'cyc' | 'combined' | 'combined6'
type View = 'audience' | 'aerial' | 'top'
type SetPiece = { name: string; kind: string; size: Vector3Tuple; color: string; position: Vector3Tuple }
type Performer = { name: string; position: Vector3Tuple; color: string; onStage: boolean; scale: number }
type DemoScene = { title: string; fixtures: LabFixture[]; setPieces: SetPiece[]; performers: Performer[] }
type DemoData = { productionPlan: { scenes: DemoScene[] } }

const app = document.querySelector<HTMLDivElement>('#app')!
app.innerHTML = `
  <header class="top">
    <div>
      <div class="eyebrow">TOMOSHIBI 小屋 / LIGHTING LAB</div>
      <h1>同じ舞台で、光の広がりを比べる</h1>
      <p>「花のしるし」の舞台で、複数の光を重ねた地明かりと背景の見え方を比べます。下には実際の舞台写真も用意しました。</p>
      <span class="status" id="status">測光データを読み込み中</span>
    </div>
    <nav class="links"><a href="/mock/?demo=akaoni-study">元の演出を開く</a><a href="/mock/projects/">プロジェクト一覧</a></nav>
  </header>
  <div class="toolbar">
    <div class="toolgroup" id="cue-controls"><span class="label">複数灯で比較</span>
      <button data-cue="wash" aria-pressed="false">地明かり 4 灯</button>
      <button data-cue="combined" aria-pressed="true">地明かり 4 灯 + 背景 3 灯</button>
      <button data-cue="combined6" aria-pressed="false">地明かり 4 灯 + 背景 6 灯</button>
    </div>
    <div class="toolgroup" id="view-controls"><span class="label">視点</span>
      <button data-view="audience" aria-pressed="true">客席</button>
      <button data-view="aerial" aria-pressed="false">俯瞰</button>
      <button data-view="top" aria-pressed="false">真上</button>
    </div>
    <label class="exposure">表示の明るさ <input id="exposure" type="range" min="0.5" max="2.5" step="0.1" value="1.3" /><output id="exposure-value">1.3</output></label>
  </div>
  <details class="diagnostics" id="diagnostics"><summary>1 灯ずつの確認・消灯</summary><div class="toolgroup" id="diagnostic-controls">
    <button data-cue="blackout" aria-pressed="false">消灯</button>
    <button data-cue="single" aria-pressed="false">1 灯・実配置</button>
    <button data-cue="singleVertical" aria-pressed="false">1 灯・垂直テスト</button>
    <button data-cue="cyc" aria-pressed="false">背景 3 灯のみ</button>
  </div><p>垂直テストは灯具を床の真上に仮置きします。「真上」視点では配光の輪郭を確認できます。</p></details>
  <div class="compare">
    <section class="pane"><div class="pane-head"><h2>円錐近似</h2><small>現在の SpotLight 方式を単純化</small></div><div class="viewport" id="cone-view"></div><div class="pane-foot">ビーム角から作った円形の光。計算にはメーカーの配光表を使いません。表示の明るさは校正前です。</div></section>
    <section class="pane"><div class="pane-head"><h2>実機の測光配光</h2><small>ETC Fresnel 10 Mid / 直接光</small></div><div class="viewport" id="measured-view"></div><div class="pane-foot">地明かりにはデモのビーム角 28°に合う Mid 配光を使用。床・背景・人物を同じ配光表から計算しています。</div></section>
  </div>
  <div class="lower">
    <section class="card"><h2>測光モデルの照度</h2><p>同じ計算を画面の光と測定点に使っています。単位は lux。実測値ではありません。</p><div class="meter" id="meter"></div></section>
    <section class="card reference"><div><h2>実際の舞台写真を見る</h2><p>別作品の写真です。真上から照らす 1 灯の光も、斜めの床では楕円に見えます。複数灯を合わせたときの床・俳優の顔・背景も比べてください。</p>
      <div class="photo-choices"><button data-photo="warm" aria-pressed="true">暖色の芝居</button><button data-photo="red" aria-pressed="false">赤い背景</button></div>
      <figure><img id="reference-image" src="/lighting-lab/reference/and-then-there-were-none-1280.jpg" alt="『そして誰もいなくなった』の舞台。複数の俳優とセット全体を暖色の明かりが照らしている" /><figcaption id="reference-caption">『そして誰もいなくなった』（Monomoy Theatre、2013）。写真: Heather Jessup / SarahSierszyn。<a href="https://commons.wikimedia.org/wiki/File:%22AND_THEN_THERE_WERE_NONE%22_-_a_play_during_its_performance_on_the_stage.jpg" target="_blank" rel="noreferrer">原典</a> · <a href="https://creativecommons.org/licenses/by/2.0/" target="_blank" rel="noreferrer">CC BY 2.0</a>。表示用に縮小。</figcaption></figure>
      <label class="upload">別の写真を表示<input id="reference-file" type="file" accept="image/*" /></label><span class="upload-note">選んだ写真はこの端末内だけで表示します。</span>
    </div></section>
  </div>
  <p class="notes">測光データは ETC fos/4 Fresnel 10 Daylight Mid と Source Four LED CYC Daylight HD Series 2。デモの灯具位置と調光率を利用しています。「背景 6 灯の配置案」は 3 灯の合計出力を 6 灯へ分けた仮案です。器具の交換、色、ホリゾント灯の取付角度、材質は現場と照合していません。CYC の最大光度方向をデモの狙いへ合わせた試験表示です。舞台写真は別作品のため、画像の明るさや色を画面と直接照合できません。</p>
  <p class="source">測光データ: <a href="https://www.etcconnect.com/products/entertainment-fixtures/fos/4-fresnel/documentation.aspx" target="_blank" rel="noreferrer">ETC fos/4 Fresnel</a> / <a href="https://www.etcconnect.com/Products/Entertainment-Fixtures/Source-Four-LED-Adapters/Documentation.aspx" target="_blank" rel="noreferrer">ETC Source Four LED CYC</a></p>
`

const cueButtons = Array.from(document.querySelectorAll<HTMLButtonElement>('[data-cue]'))
const viewButtons = Array.from(document.querySelectorAll<HTMLButtonElement>('[data-view]'))
const exposureInput = document.querySelector<HTMLInputElement>('#exposure')!
const exposureValue = document.querySelector<HTMLOutputElement>('#exposure-value')!
const meter = document.querySelector<HTMLDivElement>('#meter')!
const status = document.querySelector<HTMLSpanElement>('#status')!

let cue: Cue = 'combined'
let view: View = 'audience'
let exposure = 1.3
const initialQuery = new URLSearchParams(location.search)
if (cueButtons.some(button => button.dataset.cue === initialQuery.get('cue'))) cue = initialQuery.get('cue') as Cue
if (cue === 'blackout' || cue === 'single' || cue === 'singleVertical' || cue === 'cyc') document.querySelector<HTMLDetailsElement>('#diagnostics')!.open = true
if (initialQuery.get('view') === 'aerial' || initialQuery.get('view') === 'top') view = initialQuery.get('view') as View
const initialExposure = Number(initialQuery.get('exposure'))
if (initialQuery.has('exposure') && Number.isFinite(initialExposure)) exposure = THREE.MathUtils.clamp(initialExposure, 0.5, 2.5)
cueButtons.forEach(button => button.setAttribute('aria-pressed', String(button.dataset.cue === cue)))
viewButtons.forEach(button => button.setAttribute('aria-pressed', String(button.dataset.view === view)))
exposureInput.value = exposure.toFixed(1)
exposureValue.value = exposure.toFixed(1)

const views: Record<View, { position: Vector3Tuple; target: Vector3Tuple }> = {
  audience: { position: [0, 2.5, 10], target: [0, 2.5, -2] },
  aerial: { position: [0, 13, 4], target: [0, 0.6, -3] },
  top: { position: [0, 18, -3], target: [0, 0, -3] },
}

function selected(fixture: LabFixture, activeCue: Cue): boolean {
  if (activeCue === 'blackout') return false
  const wash = fixture.name.startsWith('地明かり')
  const cyc = fixture.name.startsWith('海の面明かり')
  if (activeCue === 'single' || activeCue === 'singleVertical') return fixture.name === '地明かり・手前下手'
  if (activeCue === 'wash') return wash
  if (activeCue === 'cyc') return cyc
  return wash || cyc
}

function sixCycLayout(fixtures: LabFixture[]): LabFixture[] {
  const originalCyc = fixtures.filter(fixture => fixture.name.startsWith('海の面明かり'))
  const originalTotal = originalCyc.reduce((sum, fixture) => sum + fixture.intensity, 0)
  const template = originalCyc[0]
  return Array.from({ length: 6 }, (_, index) => {
    const x = -5.5 + index * 2.2
    return {
      ...template,
      id: `cyc-six-${index}`,
      name: `背景配置案 ${index + 1}`,
      position: [x, template.position[1], template.position[2]],
      target: [x, template.target[1], template.target[2]],
      intensity: originalTotal / 6,
    }
  })
}

function aces(value: number): number {
  return THREE.MathUtils.clamp(value * (2.51 * value + 0.03) / (value * (2.43 * value + 0.59) + 0.14), 0, 1)
}

function srgb(value: number): number {
  return value <= 0.0031308 ? 12.92 * value : 1.055 * Math.pow(value, 1 / 2.4) - 0.055
}

function displayColor(base: THREE.Color, light: THREE.Color, gain: number): THREE.Color {
  const scale = gain * 0.048 / Math.PI
  return new THREE.Color().setRGB(
    srgb(aces((base.r * light.r * scale) + 0.001)),
    srgb(aces((base.g * light.g * scale) + 0.001)),
    srgb(aces((base.b * light.b * scale) + 0.001)),
    THREE.SRGBColorSpace,
  )
}

function lightMap(
  width: number,
  height: number,
  baseHex: string,
  pointAt: (x: number, y: number) => THREE.Vector3,
  normal: THREE.Vector3,
  fixtures: MeasuredFixture[],
): THREE.CanvasTexture {
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const context = canvas.getContext('2d')!
  const image = context.createImageData(width, height)
  const base = new THREE.Color(baseHex)
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const sample = illuminanceAt(pointAt(x / (width - 1), y / (height - 1)), normal, fixtures)
      const color = displayColor(base, sample.rgb, exposure)
      const output = color.clone().convertLinearToSRGB()
      const offset = (y * width + x) * 4
      image.data[offset] = Math.round(output.r * 255)
      image.data[offset + 1] = Math.round(output.g * 255)
      image.data[offset + 2] = Math.round(output.b * 255)
      image.data[offset + 3] = 255
    }
  }
  context.putImageData(image, 0, 0)
  const texture = new THREE.CanvasTexture(canvas)
  texture.colorSpace = THREE.SRGBColorSpace
  texture.anisotropy = 4
  return texture
}

function addMesh(scene: THREE.Scene, geometry: THREE.BufferGeometry, material: THREE.Material, position: Vector3Tuple, rotation?: Vector3Tuple): THREE.Mesh {
  const mesh = new THREE.Mesh(geometry, material)
  mesh.position.set(...position)
  if (rotation) mesh.rotation.set(...rotation)
  mesh.castShadow = true
  mesh.receiveShadow = true
  scene.add(mesh)
  return mesh
}

function materialFor(hex: string, mode: 'cone' | 'measured', fixtures: MeasuredFixture[], point: THREE.Vector3, normal: THREE.Vector3): THREE.Material {
  if (mode === 'cone') return new THREE.MeshStandardMaterial({ color: hex, roughness: 0.92 })
  const light = illuminanceAt(point, normal, fixtures)
  return new THREE.MeshBasicMaterial({ color: displayColor(new THREE.Color(hex), light.rgb, exposure), toneMapped: false })
}

function buildScene(mode: 'cone' | 'measured', demo: DemoScene, fixtures: MeasuredFixture[]): THREE.Scene {
  const scene = new THREE.Scene()
  scene.background = new THREE.Color('#08090d')
  const floorNormal = new THREE.Vector3(0, 1, 0)
  const wallNormal = new THREE.Vector3(0, 0, 1)
  const floorMaterial = mode === 'cone'
    ? new THREE.MeshStandardMaterial({ color: '#242125', roughness: 0.96 })
    : new THREE.MeshBasicMaterial({ map: lightMap(140, 90, '#242125', (u, v) => new THREE.Vector3(-7 + 14 * u, 0.005, -8 + 10 * v), floorNormal, fixtures), toneMapped: false })
  addMesh(scene, new THREE.PlaneGeometry(14, 10), floorMaterial, [0, 0, -3], [-Math.PI / 2, 0, 0])

  const cycMaterial = mode === 'cone'
    ? new THREE.MeshStandardMaterial({ color: '#d5d7d9', roughness: 1 })
    : new THREE.MeshBasicMaterial({ map: lightMap(180, 84, '#d5d7d9', (u, v) => new THREE.Vector3(-7 + 14 * u, 6.75 - 6.5 * v, -7.59), wallNormal, fixtures), toneMapped: false })
  addMesh(scene, new THREE.PlaneGeometry(14, 6.5), cycMaterial, [0, 3.5, -7.6])

  const trim = mode === 'cone' ? new THREE.MeshStandardMaterial({ color: '#181317', roughness: 0.9 }) : new THREE.MeshBasicMaterial({ color: '#181317' })
  addMesh(scene, new THREE.BoxGeometry(0.9, 7.6, 0.5), trim, [-6.65, 3.8, 2.5])
  addMesh(scene, new THREE.BoxGeometry(0.9, 7.6, 0.5), trim, [6.65, 3.8, 2.5])
  addMesh(scene, new THREE.BoxGeometry(14.2, 0.9, 0.5), trim, [0, 7.15, 2.5])

  for (const piece of demo.setPieces) {
    const [x, y, z] = piece.position
    const [width, height, depth] = piece.size
    addMesh(scene, new THREE.BoxGeometry(width, height, depth), materialFor(piece.color, mode, fixtures, new THREE.Vector3(x, y + height / 2, z), floorNormal), piece.position)
    if (mode === 'measured' && piece.kind === 'platform' && width > 3) {
      const top = lightMap(144, 82, piece.color, (u, v) => new THREE.Vector3(x + (u - 0.5) * width, y + height / 2 + 0.01, z + (v - 0.5) * depth), floorNormal, fixtures)
      addMesh(scene, new THREE.PlaneGeometry(width, depth), new THREE.MeshBasicMaterial({ map: top, toneMapped: false }), [x, y + height / 2 + 0.012, z], [-Math.PI / 2, 0, 0])
    }
  }

  for (const performer of demo.performers.filter(p => p.onStage)) {
    const [x, y, z] = performer.position
    const scale = performer.scale || 1
    const body = materialFor(performer.color, mode, fixtures, new THREE.Vector3(x, y + 1.15 * scale, z + 0.15), wallNormal)
    const face = materialFor('#c9a08b', mode, fixtures, new THREE.Vector3(x, y + 1.68 * scale, z + 0.13), wallNormal)
    const dark = materialFor('#403936', mode, fixtures, new THREE.Vector3(x, y + 0.4 * scale, z), wallNormal)
    addMesh(scene, new THREE.CylinderGeometry(0.22 * scale, 0.18 * scale, 0.8 * scale, 12), body, [x, y + 1.1 * scale, z])
    addMesh(scene, new THREE.SphereGeometry(0.16 * scale, 12, 10), face, [x, y + 1.65 * scale, z])
    for (const side of [-1, 1]) {
      addMesh(scene, new THREE.CylinderGeometry(0.065 * scale, 0.07 * scale, 0.7 * scale, 8), dark, [x + side * 0.1 * scale, y + 0.35 * scale, z])
      addMesh(scene, new THREE.CylinderGeometry(0.045 * scale, 0.05 * scale, 0.66 * scale, 8), body, [x + side * 0.25 * scale, y + 1.05 * scale, z])
    }
  }

  if (mode === 'cone') {
    scene.add(new THREE.AmbientLight('#3a2a20', 0.06))
    scene.add(new THREE.HemisphereLight('#3a2a20', '#1a1208', 0.2))
    for (const fixture of fixtures) {
      const profile = FIXTURE_PROFILES[fixture.presetKey]
      const flux = profile?.fluxLumens ?? 5000
      const fieldAngleDeg = profile?.fieldAngleDeg ?? fixture.beamAngleDeg
      const fieldRadians = THREE.MathUtils.degToRad(fieldAngleDeg / 2)
      const candela = flux / (2 * Math.PI * (1 - Math.cos(fieldRadians))) * fixture.intensity
      const light = new THREE.SpotLight(fixture.colorLinear, candela, 0, THREE.MathUtils.degToRad(fixture.beamAngleDeg / 2), 0.6, 1.7)
      light.position.set(...fixture.position)
      light.target.position.set(...fixture.target)
      light.castShadow = true
      light.shadow.mapSize.set(512, 512)
      light.shadow.bias = -0.0005
      scene.add(light, light.target)
    }
  }
  return scene
}

function disposeScene(scene: THREE.Scene): void {
  scene.traverse(object => {
    if (object instanceof THREE.Light) {
      object.shadow?.map?.dispose()
    }
    if (!(object instanceof THREE.Mesh)) return
    object.geometry.dispose()
    const materials = Array.isArray(object.material) ? object.material : [object.material]
    for (const material of materials) {
      const map = (material as THREE.MeshBasicMaterial).map
      map?.dispose()
      material.dispose()
    }
  })
}

function createView(containerId: string) {
  const container = document.querySelector<HTMLDivElement>(containerId)!
  const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' })
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.75))
  renderer.outputColorSpace = THREE.SRGBColorSpace
  renderer.toneMapping = THREE.ACESFilmicToneMapping
  renderer.shadowMap.enabled = true
  renderer.shadowMap.type = THREE.PCFSoftShadowMap
  container.append(renderer.domElement)
  const camera = new THREE.PerspectiveCamera(45, 1, 0.1, 100)
  return { container, renderer, camera, scene: null as THREE.Scene | null }
}

const probes = [
  { label: '床・下手', point: [-3, 0.1, -3] as Vector3Tuple, normal: [0, 1, 0] as Vector3Tuple },
  { label: '床・中央', point: [0, 0.1, -3] as Vector3Tuple, normal: [0, 1, 0] as Vector3Tuple },
  { label: '床・上手', point: [3, 0.1, -3] as Vector3Tuple, normal: [0, 1, 0] as Vector3Tuple },
  { label: '背景・下手', point: [-4, 3.5, -7.59] as Vector3Tuple, normal: [0, 0, 1] as Vector3Tuple },
  { label: '背景・中央', point: [0, 3.5, -7.59] as Vector3Tuple, normal: [0, 0, 1] as Vector3Tuple },
  { label: '背景・上手', point: [4, 3.5, -7.59] as Vector3Tuple, normal: [0, 0, 1] as Vector3Tuple },
]

async function start(): Promise<void> {
  const [demoResponse, fresnelResponse, cycResponse] = await Promise.all([
    fetch('/lighting-lab/data/akaoni-study-baseline.json'),
    fetch('/lighting-lab/data/etc-fos4-fresnel10-daylight-mid.ies'),
    fetch('/lighting-lab/data/etc-s4-led-cyc-daylight-hd.ies'),
  ])
  if (![demoResponse, fresnelResponse, cycResponse].every(response => response.ok)) throw new Error('デモまたは測光ファイルを読み込めませんでした')
  const demoData = await demoResponse.json() as DemoData
  const selectedDemo = demoData.productionPlan.scenes.find(scene => scene.title === '花のしるし')
  if (!selectedDemo) throw new Error('「花のしるし」の舞台データが見つかりません')
  const demo: DemoScene = selectedDemo
  const fresnel = parseIES(await fresnelResponse.text())
  const cyc = parseIES(await cycResponse.text())
  if (fresnel.type !== 1 || cyc.type !== 2) throw new Error('測光ファイルの形式が想定と異なります')
  const originals = demo.fixtures.filter(fixture => selected(fixture, 'combined'))
  if (originals.length !== 7) throw new Error('比較対象の灯具配置が変わりました')
  const coneView = createView('#cone-view')
  const measuredView = createView('#measured-view')
  const pair = [coneView, measuredView]

  function draw(): void {
    const url = new URL(location.href)
    url.searchParams.set('cue', cue)
    url.searchParams.set('view', view)
    url.searchParams.set('exposure', exposure.toFixed(1))
    history.replaceState(null, '', url)
    const source = cue === 'combined6'
      ? [...originals.filter(fixture => fixture.name.startsWith('地明かり')), ...sixCycLayout(originals)]
      : originals.filter(fixture => selected(fixture, cue))
    const fixtures = source.map(fixture => prepareFixture(
      cue === 'singleVertical' ? {
        ...fixture,
        position: [0, 4.5, -2.9],
        target: [0, 0.08, -2.9],
      } : fixture,
      fixture.presetKey === 'CycWashStudy' ? cyc : fresnel,
      fixture.presetKey === 'CycWashStudy' ? 'ETC Source Four LED CYC' : 'ETC fos/4 Fresnel 10 Mid',
    ))
    const scenes = [buildScene('cone', demo, fixtures), buildScene('measured', demo, fixtures)]
    pair.forEach((item, index) => {
      if (item.scene) disposeScene(item.scene)
      item.scene = scenes[index]
      const rect = item.container.getBoundingClientRect()
      item.renderer.setSize(Math.max(1, rect.width), Math.max(1, rect.height), false)
      item.renderer.toneMappingExposure = index === 0 ? 0.45 * exposure : exposure
      item.camera.aspect = rect.width / Math.max(1, rect.height)
      item.camera.position.set(...views[view].position)
      item.camera.up.set(0, view === 'top' ? 0 : 1, view === 'top' ? -1 : 0)
      item.camera.lookAt(...views[view].target)
      item.camera.updateProjectionMatrix()
      item.renderer.render(item.scene, item.camera)
    })
    meter.innerHTML = probes.map(probe => {
      const result = illuminanceAt(new THREE.Vector3(...probe.point), new THREE.Vector3(...probe.normal), fixtures)
      return `<div class="meter-cell"><b>${probe.label}</b><span>${result.lux.toFixed(1)}</span><em>lux</em></div>`
    }).join('')
    status.textContent = cue === 'singleVertical'
      ? '検証用: 1 灯を床の真上に仮置き · 実機配光は ETC の測光値'
      : `${fixtures.length} 灯を表示中 · 実機配光は ETC の測光値`
  }

  for (const button of cueButtons) button.addEventListener('click', () => {
    cue = button.dataset.cue as Cue
    cueButtons.forEach(item => item.setAttribute('aria-pressed', String(item === button)))
    if (cue === 'singleVertical') {
      view = 'top'
      viewButtons.forEach(item => item.setAttribute('aria-pressed', String(item.dataset.view === view)))
    }
    draw()
  })
  for (const button of viewButtons) button.addEventListener('click', () => {
    view = button.dataset.view as View
    viewButtons.forEach(item => item.setAttribute('aria-pressed', String(item === button)))
    draw()
  })
  exposureInput.addEventListener('input', () => {
    exposure = Number(exposureInput.value)
    exposureValue.value = exposure.toFixed(1)
    draw()
  })
  new ResizeObserver(() => draw()).observe(coneView.container)
  new ResizeObserver(() => draw()).observe(measuredView.container)
  draw()
}

const referenceImage = document.querySelector<HTMLImageElement>('#reference-image')!
const referenceCaption = document.querySelector<HTMLElement>('#reference-caption')!
const photoButtons = Array.from(document.querySelectorAll<HTMLButtonElement>('[data-photo]'))
const referencePhotos = {
  warm: {
    src: '/lighting-lab/reference/and-then-there-were-none-1280.jpg',
    alt: '『そして誰もいなくなった』の舞台。複数の俳優とセット全体を暖色の明かりが照らしている',
    caption: '『そして誰もいなくなった』（Monomoy Theatre、2013）。写真: Heather Jessup / SarahSierszyn。<a href="https://commons.wikimedia.org/wiki/File:%22AND_THEN_THERE_WERE_NONE%22_-_a_play_during_its_performance_on_the_stage.jpg" target="_blank" rel="noreferrer">原典</a> · <a href="https://creativecommons.org/licenses/by/2.0/" target="_blank" rel="noreferrer">CC BY 2.0</a>。表示用に縮小。',
  },
  red: {
    src: '/lighting-lab/reference/only-a-girl-1280.jpg',
    alt: '『Only A Girl』の舞台。複数の俳優の背後に赤い背景が続き、床には光の形も見える',
    caption: '『Only A Girl』（2021）。写真: BJCHK。<a href="https://commons.wikimedia.org/wiki/File:Only_A_Girl,_a_theatre_production_by_Lindsey_McAlister_(2021).jpg" target="_blank" rel="noreferrer">原典</a> · <a href="https://creativecommons.org/publicdomain/zero/1.0/" target="_blank" rel="noreferrer">CC0</a>。表示用に縮小。',
  },
} as const

for (const button of photoButtons) button.addEventListener('click', () => {
  const photo = referencePhotos[button.dataset.photo as keyof typeof referencePhotos]
  if (!photo) return
  if (referenceImage.dataset.url) {
    URL.revokeObjectURL(referenceImage.dataset.url)
    delete referenceImage.dataset.url
  }
  referenceImage.src = photo.src
  referenceImage.alt = photo.alt
  referenceCaption.innerHTML = photo.caption
  photoButtons.forEach(item => item.setAttribute('aria-pressed', String(item === button)))
})

document.querySelector<HTMLInputElement>('#reference-file')!.addEventListener('change', event => {
  const file = (event.target as HTMLInputElement).files?.[0]
  if (!file) return
  if (referenceImage.dataset.url) URL.revokeObjectURL(referenceImage.dataset.url)
  referenceImage.dataset.url = URL.createObjectURL(file)
  referenceImage.src = referenceImage.dataset.url
  referenceImage.alt = file.name
  referenceCaption.textContent = `この端末で選んだ写真: ${file.name}`
  photoButtons.forEach(item => item.setAttribute('aria-pressed', 'false'))
})

start().catch(error => {
  status.textContent = '読み込みに失敗しました'
  document.querySelector<HTMLDivElement>('#cone-view')!.innerHTML = `<p class="error">${String(error)}</p>`
})
