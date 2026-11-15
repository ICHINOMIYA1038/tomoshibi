import { useStore, type Fixture } from '../store'
import { DEFAULT_VENUE_LAYOUT, stageFootprint } from '../venueLayout'
import { resolveStageParts } from '../stageParts'
import { STAGE_ID } from '../hierarchy'
import { areaWashFixture } from './areaWash'

// 新しいプロジェクトのひな形に入れる、基本の吊り込みと役者。
// 舞台の大きさと形から決める。バトンがあれば、そこに吊る（照明の親をそのバトンにする）。

type Vec3 = [number, number, number]

/** 舞台を手前・奥の 2 列 × 下手・中央・上手の 6 つに分け、1 つに 1 灯ずつ地明かりを当てる */
const AREA_COLUMNS = [['下手', -1], ['中央', 0], ['上手', 1]] as const

export function addBasicRig() {
  const store = useStore.getState()
  const layout = store.productionPlan.venueLayout ?? DEFAULT_VENUE_LAYOUT
  const [ox, oz] = layout.stageOffset ?? [0, 0]
  const outline = stageFootprint(layout)
  const left = Math.min(...outline.map(point => point[0]))
  const right = Math.max(...outline.map(point => point[0]))
  const rear = Math.min(...outline.map(point => point[1]))
  const front = Math.max(...outline.map(point => point[1]))
  const cx = (left + right) / 2
  const width = right - left
  const depth = front - rear
  const parts = resolveStageParts(layout)
  const battens = parts.filter(part => part.kind === 'batten').map(part => ({ id: part.id, z: part.z + oz, y: part.elevation, width: part.width, x: part.x + ox }))
  const nearestBatten = (z: number) => battens.reduce<typeof battens[number] | null>((best, batten) =>
    !best || Math.abs(batten.z - z) < Math.abs(best.z - z) ? batten : best, null)

  const add = (name: string, position: Vec3, target: Vec3, options: { beam: number; intensity: number; parentId: string | null; preset?: string; color?: Fixture['color'] }) => {
    const id = store.addFixture(options.preset ?? 'Fresnel10', position)
    const fixture = useStore.getState().fixtures.find(item => item.id === id)
    if (!fixture) return
    const patch = options.preset
      ? { name, target, intensity: options.intensity, enabled: options.intensity > 0, color: options.color ?? fixture.color }
      : areaWashFixture(fixture, { name, target, beamAngleDeg: options.beam, intensity: options.intensity, color: options.color ?? [1, .9, .8] })
    store.updateFixture(id, { ...patch, parentId: options.parentId })
  }

  // 地明かり: 手前の列と奥の列。それぞれ、狙う所に近いバトンに吊る（バトンが無ければ舞台の上 7m）
  const rows = [['手前', front - depth * .28], ['奥', rear + depth * .4]] as const
  for (const [rowName, zoneZ] of rows) {
    const batten = nearestBatten(zoneZ + .8)
    const hangZ = batten?.z ?? zoneZ + .8
    const hangY = batten?.y ?? 7
    const span = Math.min(width / 3, (batten?.width ?? width) / 2 - .5)
    for (const [columnName, column] of AREA_COLUMNS) {
      const x = cx + column * span
      add(`地明かり・${rowName}${columnName}`, [x, hangY, hangZ], [x, 1.2, zoneZ],
        { beam: 40, intensity: .32, parentId: batten?.id ?? STAGE_ID })
    }
  }

  // 前明かり: 客席の上から顔に当てる。客席が三方・四方にある舞台は、その向きからも当てる
  const center: Vec3 = [cx, 1.5, (front + rear) / 2]
  const reach = Math.max(width, depth) / 2 + 7
  add('前明かり・下手', [cx - width / 4, 10, front + 7], [cx - width / 6, 1.5, front - depth * .35], { beam: 26, intensity: .35, parentId: null })
  add('前明かり・上手', [cx + width / 4, 10, front + 7], [cx + width / 6, 1.5, front - depth * .35], { beam: 26, intensity: .35, parentId: null })
  if (layout.stageShape === 'thrust' || layout.stageShape === 'round') {
    add('横からの明かり・下手側', [cx - reach, 9, center[2]], center, { beam: 30, intensity: .25, parentId: null })
    add('横からの明かり・上手側', [cx + reach, 9, center[2]], center, { beam: 30, intensity: .25, parentId: null })
  }
  if (layout.stageShape === 'round') add('奥からの明かり', [cx, 9, rear - 7], center, { beam: 30, intensity: .25, parentId: null })

  // サス: 舞台の中央の真上。最初は消しておき、一人を浮かび上がらせたいときに使う
  const middle = nearestBatten((front + rear) / 2)
  add('サス・中央', [cx, middle?.y ?? 7, middle?.z ?? (front + rear) / 2], [cx, 0, middle?.z ?? (front + rear) / 2],
    { beam: 24, intensity: 0, parentId: middle?.id ?? STAGE_ID })

  // ホリゾント幕があれば、いちばん奥のバトンからホリゾントを染める
  const cyc = parts.find(part => part.kind === 'cyc')
  const back = battens.length ? battens.reduce((a, b) => a.z < b.z ? a : b) : null
  if (cyc && back) add('ホリゾント', [cx, back.y, back.z], [cx, (cyc.height ?? 6) * .6, cyc.z + oz],
    { beam: 90, intensity: .1, parentId: back.id, preset: 'CycWashStudy', color: [.35, .5, 1] })
}

/** 役者を 2 人、舞台の中ほどに立たせる */
export function addBasicPerformers() {
  const store = useStore.getState()
  const layout = store.productionPlan.venueLayout ?? DEFAULT_VENUE_LAYOUT
  const outline = stageFootprint(layout)
  const left = Math.min(...outline.map(point => point[0]))
  const right = Math.max(...outline.map(point => point[0]))
  const rear = Math.min(...outline.map(point => point[1]))
  const front = Math.max(...outline.map(point => point[1]))
  const cx = (left + right) / 2
  const z = front - (front - rear) * .4
  const step = Math.min(1.6, (right - left) / 6)
  const people = [['役者 1', '#9f745c', cx - step], ['役者 2', '#59748a', cx + step]] as const
  for (const [name, color, x] of people) {
    const id = store.addPerformer([Math.round(x * 10) / 10, 0, Math.round(z * 10) / 10])
    if (id) store.updatePerformer(id, { name, color, pose: 'standing' })
  }
}
