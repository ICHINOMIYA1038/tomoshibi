// 見本の公演「ロミオとジュリエット」（シェイクスピア）。トップページ・使い方の動画・「見本の公演を開く」で使う（2026-11-18）。
// 作品は著作権が切れている。台詞は翻訳の著作権を避けるため引かず、場面の名前と説明は自分の言葉で書く。
// 実際の劇場の仕込みに近い組み方にしている。2026-11-20 に、日本の照明家・照明会社の資料をもとに組み直した
// （調べた決まりは reports/2026-11-20-tomoshibi-lighting-study/research.md。ここでは要点だけ書く）:
// - 地明かりは、客席の上のバトンの前明かり 3 灯と、1 番バトンのサス 3 灯で、間口 3 × 奥行き 2 のエリアを覆う。どの場面も前明かりを残して顔を見せる
// - 逆光は 4 番バトンから 2 灯。濃い色（赤・濃い青）は逆光とホリにだけ入れ、顔には当てない
// - ホリゾントは 4 番バトン（幕から約 2.5m）から 2 灯。離しすぎると幕の上に暗い波ができた
// - ピンは客席の後ろから追う。場面ごとに追う役者と絞りを決める（バルコニーは窓の前なので、上半身だけに絞る）（吊った器具は場面の途中で向きを変えられないので、狙いを変えるのはピンだけ）
// - 月明かり（木漏れ日のゴボ）は木のある庭の場面だけ。窓明かり（窓枠のゴボ）は朝の室内の 2 場面
// - 横明かりは、袖幕のすき間（2 番の袖の手前）から人の高さを狙う。袖幕の奥から当てると、幕のひだの影が床に並んだ
// - 器具は 15 灯（上限 16）。見本を開いた人が 1 灯は足せるようにしておく
// - セットが替わる場面は暗転で転換する（通しで見るでは、明かりを消し切ってからセットと役者を入れ替える）
import { useStore, type AudienceBlock, type Fixture, type SceneTriggerType } from '../store'
import type { SetPiece } from '../types'
import { MEASURED_FRESNEL_KEY } from '../photometric/measuredFresnel'
import { MEASURED_CYC_KEY } from '../photometric/measuredCyc'
import type { GoboPattern } from '../lighting/movingHead'
import { templateParts, type StagePart } from '../stageParts'

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
  // #78 相当（夜の地明かり）と #64 相当（白熱の黄みを抜く、顔に当てる薄い青）
  n78: [0.74, 0.8, 1] as RGB,
  c64: [0.92, 0.95, 1] as RGB,
  skyDay: [0.55, 0.75, 1] as RGB,
  skyGold: [1, 0.66, 0.36] as RGB,
  // 夜の宴の窓の外。舞台の金色と対比させる
  skyBall: [0.12, 0.2, 0.62] as RGB,
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
  // 前明かり（客席の上のバトン）：舞台の前の方を下手・中央・上手の 3 つに分け、隣どうしを重ねてむらなく覆う。仰角は約 45°
  // 外側（袖幕の側）をバンドアで切る。客席から舞台へ向けた器具では、下手の器具の外側がバンドアの「右側」にあたる（逆にしていて袖幕が茶色く光っていた）
  { key: 'fohL', name: '前明かり・下手', number: '1', preset: 'Fresnel10', measured: 'fresnel', position: [-4.2, 8.6, 6.8], target: [-4.0, 1.5, 0.2], beam: 44, barnDoorAngles: { top: 3, right: 3, left: 30 } },
  { key: 'fohC', name: '前明かり・中央', number: '2', preset: 'Fresnel10', measured: 'fresnel', position: [0, 8.6, 6.8], target: [0, 1.5, 0.0], beam: 44, barnDoorAngles: { top: 3, left: 30, right: 30 } },
  { key: 'fohR', name: '前明かり・上手', number: '3', preset: 'Fresnel10', measured: 'fresnel', position: [4.2, 8.6, 6.8], target: [4.0, 1.5, 0.2], beam: 44, barnDoorAngles: { top: 3, left: 3, right: 30 } },
  // サス（1 番バトン）：舞台の奥のエリアを 3 つに分けて真上寄りから。ホリの手前で切り、幕に当てない。両端のサスは外側（袖幕の側）も切る
  { key: 'usL', name: 'サス・下手', number: '4', preset: 'Fresnel10', measured: 'fresnel', position: [-4.2, 8, 0.8], target: [-4.2, 1.5, -3.6], beam: 46, barnDoorAngles: { top: 4, right: 14 } },
  { key: 'usC', name: 'サス・中央', number: '5', preset: 'Fresnel10', measured: 'fresnel', position: [0, 8, 0.8], target: [0, 1.5, -3.8], beam: 46, barnDoorAngles: { top: 4 } },
  { key: 'usR', name: 'サス・上手', number: '6', preset: 'Fresnel10', measured: 'fresnel', position: [4.2, 8, 0.8], target: [4.2, 1.5, -3.6], beam: 46, barnDoorAngles: { top: 4, left: 14 } },
  // 逆光は奥側（前へ下向きに当てるので、バンドアの「下側」）を切る。切らないと、外側の弱い光がホリに当たって波形が出た（2026-11-20）
  { key: 'backL', name: '逆光・下手', number: '7', preset: 'Fresnel10', measured: 'fresnel', position: [-3, 8, -4.15], target: [-2.4, 0, -0.8], beam: 44, barnDoorAngles: { bottom: 12 } },
  { key: 'backR', name: '逆光・上手', number: '8', preset: 'Fresnel10', measured: 'fresnel', position: [3, 8, -4.15], target: [2.4, 0, -0.8], beam: 44, barnDoorAngles: { bottom: 12 } },
  { key: 'cycL', name: 'ホリゾント・下手', number: '9', preset: 'CycWashStudy', measured: 'cyc', position: [-3.4, 8, -4.15], target: [-3.4, 2.6, -7.0], beam: 60 },
  { key: 'cycR', name: 'ホリゾント・上手', number: '10', preset: 'CycWashStudy', measured: 'cyc', position: [3.4, 8, -4.15], target: [3.4, 2.6, -7.0], beam: 60 },
  // ピン：客席の後ろの高い投光室から（低いと光が役者を越えてホリに丸く当たる）。場面ごとに追う役者を変える。
  // 2kW のクセノンを 4° に絞るので、ほかの器具よりずっと小さい値で同じくらいの明るさになる
  { key: 'pin', name: 'ピン', number: '11', preset: 'FollowSpotXenon2k', position: [0, 9.5, 15.5], target: [0, 1.2, -1.4], beam: 4 },
  { key: 'moon', name: '月明かり', number: '12', preset: 'Source4_26', position: [5.6, 7.6, -5.6], target: [0.6, 0, -2.4], beam: 26, gobo: 'leaves' },
  // 窓明かりは上手の袖の奥のタワーから。ホリの前に吊ると、器具が客席から見えた
  { key: 'window', name: '窓明かり', number: '13', preset: 'Source4_26', position: [6.6, 5.0, -5.2], target: [-0.2, 0, -2.4], beam: 26, gobo: 'window' },
  // 横明かり：2 番の袖幕の手前のすき間に立てたタワーから、向かいの役者の胸の高さを狙う。
  // 光軸より上はシャッターで切る（切らないと、役者を越えた光が向かいの壁を茶色く照らした）
  { key: 'sideL', name: '横明かり・下手', number: '14', preset: 'Source4_36', position: [-7.6, 3.2, -0.7], target: [2.0, 1.2, -1.8], beam: 26, barnDoorAngles: { top: 3 } },
  { key: 'sideR', name: '横明かり・上手', number: '15', preset: 'Source4_36', position: [7.6, 3.2, -0.7], target: [-2.0, 1.2, -1.8], beam: 26, barnDoorAngles: { top: 3 } },
]

type Cue = { level: number; color?: RGB; target?: Vec3; follow?: Name; /** ピンの絞り（度）。書かなければ吊ったときの値 */ beam?: number }
type Look = Partial<Record<string, number | Cue>>
type Place = Vec3 | { position: Vec3; facingDeg?: number; pose?: 'standing' | 'sitting' | 'kneeling' | 'lying' }

/** 実測の配光（ETC のフレネル）は、距離の 2 乗で落ちる本物の明るさになる。場面の値（0〜1 の感覚）にこれを掛けて出す */
const FRESNEL_GAIN = 4.2

type Prop = Pick<SetPiece, 'name' | 'size' | 'color'> & { kind?: 'box' | 'platform'; appearance?: SetPiece['appearance']; rotationY?: number }
const PROPS: Record<string, Prop> = {
  fountain: { name: '広場の噴水', size: [1.8, 0.8, 1.8], color: '#6f6a62' },
  benchL: { name: '広場のベンチ', appearance: 'bench', size: [1.8, 0.45, 0.5], color: '#6a5040' },
  table: { name: '宴の卓', appearance: 'table', size: [2.4, 0.78, 0.9], color: '#6b4a36' },
  // 舞踏会の広間：奥に高さ 0.6m の段と前の階段、夜空（ホリ）を背にした柱廊。柱のシルエットで奥行きを出す（上に梁を渡すと鳥居に見えたので、柱だけ。上の端は一文字幕の裏に隠して、天井まで伸びて見せる）
  dais: { kind: 'platform', name: '広間の段', size: [9.0, 0.6, 2.4], color: '#2e221c' },
  steps: { kind: 'platform', name: '段の階段', size: [3.2, 0.3, 0.7], color: '#3a2c24' },
  col1: { name: '柱 1', size: [0.42, 7.2, 0.42], color: '#8c8273' },
  col2: { name: '柱 2', size: [0.42, 7.2, 0.42], color: '#8c8273' },
  col3: { name: '柱 3', size: [0.42, 7.2, 0.42], color: '#8c8273' },
  col4: { name: '柱 4', size: [0.42, 7.2, 0.42], color: '#8c8273' },
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

const CAST = ['ロミオ', 'ジュリエット', 'マキューシオ', 'ティボルト', '乳母', 'ロレンス神父',
  '踊り手 1', '踊り手 2', '踊り手 3', '踊り手 4', '踊り手 5', '踊り手 6', '踊り手 7', '踊り手 8'] as const
type Name = typeof CAST[number]
const CAST_COLOR: Record<Name, string> = {
  'ロミオ': '#5d6f8a', 'ジュリエット': '#b08a8a', 'マキューシオ': '#7c8a5d', 'ティボルト': '#8a3f3a', '乳母': '#8a7a62', 'ロレンス神父': '#6b5a48',
  // 舞踏会の仮面の踊り手。ワイン・金・青緑・象牙を組ごとに
  '踊り手 1': '#6e2b3a', '踊り手 2': '#a8873e', '踊り手 3': '#2f5d62', '踊り手 4': '#cbbfa6',
  '踊り手 5': '#a8873e', '踊り手 6': '#6e2b3a', '踊り手 7': '#cbbfa6', '踊り手 8': '#2f5d62',
}

type Scene = {
  chapter: number
  title: string
  triggerType?: SceneTriggerType
  trigger?: string
  note: string
  cast: Partial<Record<Name, Place>>
  props: Partial<Record<keyof typeof PROPS, PropPlace>>
  /** スモークの濃さ（書かなければ 0.07）。光の筋を見せたい場面だけ濃くする */
  haze?: number
  /** この場面に入るときのフェード（秒）。書かなければ、セットが替わる場面は 4 秒の暗転、ほかはアプリの既定 */
  fadeSec?: number
  look: Look
}

const CHAPTERS = ['第一幕・出会い', '第二幕・誓い', '第三幕・決闘と別れ', '第五幕・霊廟']

const SCENES: Scene[] = [
  {
    chapter: 0, title: 'ヴェローナの広場', triggerType: 'other', trigger: '幕開き', note: '真昼の広場。両家の若者がにらみ合う。空は高い青、地明かりは白く強く。',
    cast: { 'マキューシオ': { position: [-2.6, 0, -1.2], facingDeg: 60 }, 'ティボルト': { position: [2.2, 0, -1.6], facingDeg: -60 }, 'ロミオ': { position: [-4.6, 0, -3.6], facingDeg: 30 } },
    props: { fountain: { at: [0, 0.4, -4.2] }, benchL: { at: [-4.2, 0.225, -4.6] } },
    look: {
      fohL: { level: 0.32, color: C.pale }, fohC: { level: 0.32, color: C.pale }, fohR: { level: 0.32, color: C.pale },
      usL: { level: 0.26, color: C.day }, usC: { level: 0.26, color: C.day }, usR: { level: 0.26, color: C.day },
      backL: { level: 0.2, color: C.amber }, backR: { level: 0.2, color: C.amber },
      cycL: { level: 0.5, color: C.skyDay }, cycR: { level: 0.5, color: C.skyDay },
      sideL: { level: 0.22, color: C.day }, sideR: { level: 0.22, color: C.day },
    },
  },
  {
    chapter: 0, title: 'キャピュレット家の舞踏会', triggerType: 'sound', trigger: '舞曲が始まる',
    note: '夜の宴。奥の段と柱廊に仮面の踊り手たち、柱の向こうは夜空の青。人の輪から離れた手前で、ロミオとジュリエットが出会う。ピンでジュリエットを追う。',
    cast: {
      'ロミオ': { position: [-0.7, 0, -0.6], facingDeg: 65 }, 'ジュリエット': { position: [0.6, 0, -0.7], facingDeg: -70 },
      'ティボルト': { position: [4.6, 0, -1.6], facingDeg: -115 }, '乳母': { position: [-4.7, 0, -1.2], facingDeg: 50 },
      // 段の上で踊る 2 組と、中ほどで踊る 2 組。組は向かい合わせ
      '踊り手 1': { position: [-3.3, 0.6, -5.0], facingDeg: 90 }, '踊り手 2': { position: [-2.6, 0.6, -5.0], facingDeg: -90 },
      '踊り手 3': { position: [2.6, 0.6, -5.2], facingDeg: 90 }, '踊り手 4': { position: [3.3, 0.6, -5.2], facingDeg: -90 },
      '踊り手 5': { position: [-3.7, 0, -2.9], facingDeg: 70 }, '踊り手 6': { position: [-3.0, 0, -2.6], facingDeg: -110 },
      '踊り手 7': { position: [3.0, 0, -2.7], facingDeg: 110 }, '踊り手 8': { position: [3.7, 0, -3.0], facingDeg: -70 },
    },
    props: {
      dais: { at: [0, 0.3, -5.3] }, steps: { at: [0, 0.15, -3.75] },
      col1: { at: [-3.9, 4.2, -6.1] }, col2: { at: [-1.3, 4.2, -6.1] }, col3: { at: [1.3, 4.2, -6.1] }, col4: { at: [3.9, 4.2, -6.1] },
      table: { at: [0, 0.99, -5.3] },
    },
    haze: 0.11,
    look: {
      fohL: { level: 0.1, color: C.warm }, fohC: { level: 0.08, color: C.warm }, fohR: { level: 0.1, color: C.warm },
      usL: { level: 0.16, color: C.gold }, usC: { level: 0.14, color: C.gold }, usR: { level: 0.16, color: C.gold },
      backL: { level: 0.3, color: C.rose }, backR: { level: 0.3, color: C.rose },
      cycL: { level: 0.24, color: C.skyBall }, cycR: { level: 0.24, color: C.skyBall },
      pin: { level: 0.008, color: C.warm, follow: 'ジュリエット' }, sideL: { level: 0.3, color: C.amber }, sideR: { level: 0.26, color: C.rose },
    },
  },
  {
    chapter: 1, title: 'バルコニー', triggerType: 'other', trigger: '夜の庭', note: '月夜の庭。上手のバルコニーにジュリエット、下の木陰にロミオ。月明かりが木漏れ日の形で落ちる。顔は薄い前明かりで残す。',
    cast: { 'ジュリエット': { position: [3.2, 2.0, -5.0], facingDeg: -30 }, 'ロミオ': { position: [0.6, 0, -2.6], facingDeg: 150 } },
    props: { balcony: { at: [3.2, 1.0, -5.0] }, balconyWindow: { at: [3.2, 3.1, -5.75] }, benchL: { at: [-2.6, 0.225, -3.2] } },
    look: {
      fohL: { level: 0.06, color: C.c64 }, fohC: { level: 0.08, color: C.c64 }, fohR: { level: 0.08, color: C.c64 },
      usL: { level: 0.06, color: C.n78 }, usC: { level: 0.06, color: C.n78 }, usR: { level: 0.06, color: C.n78 },
      backL: { level: 0.16, color: C.steel }, backR: { level: 0.2, color: C.steel },
      cycL: { level: 0.14, color: C.skyNight }, cycR: { level: 0.14, color: C.skyNight },
      pin: { level: 0.003, color: C.c64, follow: 'ジュリエット', beam: 2 }, moon: { level: 0.6, color: C.moon }, sideR: { level: 0.26, color: C.moon },
    },
  },
  {
    chapter: 1, title: 'ロレンス神父の庵', triggerType: 'light', trigger: '朝の光', note: '朝の庵。ひそかな婚礼。窓枠の形の光が床に入り、二人と神父を結ぶ。',
    cast: { 'ロレンス神父': { position: [0, 0, -3.2], facingDeg: 0 }, 'ロミオ': { position: [-1.0, 0, -2.0], facingDeg: 60 }, 'ジュリエット': { position: [1.0, 0, -2.0], facingDeg: -60 } },
    props: { cellTable: { at: [-2.6, 0.39, -4.2] }, herbs: { at: [3.8, 1.2, -6.2] } },
    look: {
      fohL: { level: 0.12, color: C.c64 }, fohC: { level: 0.16, color: C.c64 }, fohR: { level: 0.12, color: C.c64 },
      usL: { level: 0.08, color: C.warm }, usC: { level: 0.08, color: C.warm }, usR: { level: 0.08, color: C.warm },
      backL: { level: 0.12, color: C.amber }, backR: { level: 0.12, color: C.amber },
      cycL: { level: 0.12, color: C.skyDawn }, cycR: { level: 0.12, color: C.skyDawn },
      window: { level: 0.8, color: C.amber }, sideR: { level: 0.16, color: C.amber },
    },
  },
  {
    chapter: 2, title: '広場の決闘', triggerType: 'other', trigger: '剣が抜かれる', note: '照りつける午後。マキューシオが倒れ、ロミオがティボルトを討つ。赤は空と逆光にだけ入れ、顔は琥珀で見せる。',
    cast: { 'ロミオ': { position: [-1.2, 0, -1.8], facingDeg: 80 }, 'ティボルト': { position: [1.4, 0, -1.9], facingDeg: -80 }, 'マキューシオ': { position: [-3.4, 0, -2.8], facingDeg: 40, pose: 'kneeling' } },
    props: { fountain: { at: [0, 0.4, -4.2] }, benchL: { at: [-4.2, 0.225, -4.6] } },
    look: {
      fohL: { level: 0.14, color: C.amber }, fohC: { level: 0.16, color: C.amber }, fohR: { level: 0.14, color: C.amber },
      usL: { level: 0.1, color: C.amber }, usC: { level: 0.1, color: C.amber }, usR: { level: 0.1, color: C.amber },
      backL: { level: 0.32, color: C.red }, backR: { level: 0.32, color: C.red },
      cycL: { level: 0.42, color: C.skyRed }, cycR: { level: 0.42, color: C.skyRed },
      sideL: { level: 0.36, color: C.amber }, sideR: { level: 0.36, color: C.amber },
    },
  },
  {
    chapter: 2, title: '夜明けの別れ', triggerType: 'sound', trigger: '鳥の声', note: '寝室の夜明け。窓の外がしらむ。追放されるロミオとジュリエットの別れ。',
    cast: { 'ロミオ': { position: [-0.4, 0, -2.4], facingDeg: 70 }, 'ジュリエット': { position: [0.8, 0, -2.4], facingDeg: -70 } },
    props: { bed: { at: [-2.6, 0.25, -3.6] }, roomWindow: { at: [1.6, 1.8, -6.4] } },
    look: {
      fohL: { level: 0.1, color: C.c64 }, fohC: { level: 0.16, color: C.c64 }, fohR: { level: 0.1, color: C.c64 },
      usL: { level: 0.06, color: C.lavender }, usC: { level: 0.06, color: C.lavender }, usR: { level: 0.06, color: C.lavender },
      backL: { level: 0.14, color: C.lavender }, backR: { level: 0.14, color: C.lavender },
      cycL: { level: 0.22, color: C.skyDawn, target: [-3.4, 1.8, -7.0] }, cycR: { level: 0.22, color: C.skyDawn, target: [3.4, 1.8, -7.0] },
      window: { level: 0.55, color: C.lavender },
    },
  },
  {
    chapter: 3, title: '霊廟', triggerType: 'other', trigger: '暗闇', note: '冷たい霊廟。棺台に眠るジュリエット。たいまつの暖色をピンで一つだけ、あとは青い闇。暗くても、顔は薄い前明かりで読めるようにする。',
    cast: { 'ジュリエット': { position: [0, 0.7, -3.4], facingDeg: 90, pose: 'lying' }, 'ロミオ': { position: [-1.5, 0, -2.7], facingDeg: 70, pose: 'kneeling' } },
    props: { bier: { at: [0, 0.35, -3.4] } },
    look: {
      fohL: { level: 0.05, color: C.c64 }, fohC: { level: 0.07, color: C.c64 },
      backL: { level: 0.22, color: C.steel }, backR: { level: 0.22, color: C.steel },
      cycL: { level: 0.06, color: C.skyDeep, target: [-3.4, 3.6, -7.0] }, cycR: { level: 0.06, color: C.skyDeep, target: [3.4, 3.6, -7.0] },
      pin: { level: 0.008, color: C.torch, follow: 'ジュリエット' }, sideL: { level: 0.3, color: C.torch },
    },
  },
  {
    chapter: 3, title: '両家の和解', triggerType: 'light', trigger: '夜が明ける', note: '灰色の夜明け。両家が棺台を囲み、手を取り合う。空がゆっくり白み、舞台全体を静かに見せて終える。',
    cast: { 'ロレンス神父': { position: [0, 0, -1.6], facingDeg: 0 }, '乳母': { position: [-2.4, 0, -2.2], facingDeg: 50 }, 'ジュリエット': { position: [0, 0.7, -3.4], facingDeg: 90, pose: 'lying' }, 'ロミオ': { position: [-1.5, 0, -2.7], facingDeg: 70, pose: 'kneeling' } },
    props: { bier: { at: [0, 0.35, -3.4] } },
    fadeSec: 8,
    look: {
      fohL: { level: 0.16, color: C.pale }, fohC: { level: 0.2, color: C.pale }, fohR: { level: 0.16, color: C.pale },
      usL: { level: 0.12, color: C.pale }, usC: { level: 0.12, color: C.pale }, usR: { level: 0.12, color: C.pale },
      backL: { level: 0.16, color: C.lavender }, backR: { level: 0.16, color: C.lavender },
      cycL: { level: 0.4, color: C.skyGrey, target: [-3.4, 2.4, -7.0] }, cycR: { level: 0.4, color: C.skyGrey, target: [3.4, 2.4, -7.0] },
      pin: { level: 0.004, color: C.pale, follow: 'ジュリエット' },
    },
  },
]

const block = (id: string, name: string, x: number, z: number, rows: number, columns: number, elevation = 0): AudienceBlock => ({
  id: `sample-${id}`, name, position: [x, z], rows, seatsPerRow: columns, rowSpacing: 0.9, seatSpacing: 0.62, rotationDeg: 0,
  ...(elevation ? { elevation } : {}),
})

/**
 * 劇場の作り（2026-11-19 オーナー「壁とかもちゃんと。舞台のイメージで客席とか導線とか」）
 * - 額縁：舞台の前の端（z 2.3）に左右の袖壁と上の垂れ壁。口は幅 12m・高さ 6.5m
 * - 客席：前の平場（6 列）と後ろの段床（2 列ずつ 3 段）。中央通路・左右の通路、あいだに横の通路。264 席
 * - 客席の両脇と後ろの壁。横の通路の両端を出入口として空ける。前明かりを吊る客席の上のバトン
 */
const HOUSE_WALL = '#0f0d0c'
const PROSCENIUM = '#151313'
const RISER = '#2a2321'
const housePart = (id: string, kind: StagePart['kind'], fields: Partial<StagePart>): StagePart =>
  ({ id: `house-${id}`, kind, x: 0, z: 0, width: 1, depth: 0, height: 0, elevation: 0, rotationDeg: 0, edited: true, ...fields })
const HOUSE_PARTS: StagePart[] = [
  housePart('prosc-left', 'wall', { x: -7.8, z: 2.3, width: 3.6, height: 9, color: PROSCENIUM }),
  housePart('prosc-right', 'wall', { x: 7.8, z: 2.3, width: 3.6, height: 9, color: PROSCENIUM }),
  housePart('prosc-header', 'wall', { x: 0, z: 2.3, width: 12, height: 2.5, elevation: 6.5, color: PROSCENIUM }),
  housePart('wall-left-front', 'wall', { x: -9.6, z: 6.65, width: 8.7, height: 9, rotationDeg: 90, color: HOUSE_WALL }),
  housePart('wall-left-rear', 'wall', { x: -9.6, z: 14.8, width: 5.2, height: 9, rotationDeg: 90, color: HOUSE_WALL }),
  housePart('wall-right-front', 'wall', { x: 9.6, z: 6.65, width: 8.7, height: 9, rotationDeg: -90, color: HOUSE_WALL }),
  housePart('wall-right-rear', 'wall', { x: 9.6, z: 14.8, width: 5.2, height: 9, rotationDeg: -90, color: HOUSE_WALL }),
  // 後ろの壁は低くする。高いと「客席全体」の視点（客席の後ろの上）から、後ろの段の客席が隠れた
  housePart('wall-rear', 'wall', { x: 0, z: 17.4, width: 19.2, height: 3.2, color: HOUSE_WALL }),
  ...[0.4, 0.8, 1.2].map((height, index) => housePart(`riser-${index + 1}`, 'platform', { x: 0, z: 12.45 + index * 1.8, width: 15.6, depth: 1.8, height, color: RISER })),
  housePart('foh-batten', 'batten', { x: 0, z: 6.8, width: 12, elevation: 8.8 }),
  // 一文字幕（舞台の上に吊る横長の黒幕）。吊った器具と、ホリゾント幕の上の縁を客席から隠す。
  // 無いと、ホリの上の縁がくっきり見えて映写用のスクリーンのようだった（2026-11-20）
  // 手前（1 番バトンの奥）にも吊ると、サスの光が幕に当たって明るい斑点になったので、奥の 1 枚だけにする
  housePart('border', 'wall', { x: 0, z: -3.9, width: 14, height: 2.4, elevation: 6.3, color: '#0b0a0a' }),
]
const HOUSE_BLOCKS: AudienceBlock[] = [
  block('front-left', '客席・前・下手', -4.3, 7.9, 6, 11),
  block('front-right', '客席・前・上手', 4.3, 7.9, 6, 11),
  ...[0.4, 0.8, 1.2].flatMap((elevation, index) => [
    block(`rear-left-${index + 1}`, `客席・後ろ ${index + 1} 段・下手`, -4.3, 12.45 + index * 1.8, 2, 11, elevation),
    block(`rear-right-${index + 1}`, `客席・後ろ ${index + 1} 段・上手`, 4.3, 12.45 + index * 1.8, 2, 11, elevation),
  ]),
]

export function createSampleProduction() {
  const store = useStore.getState()
  store.loadPreset('empty')
  store.ensureScenes()
  store.updateProductionPlan({ projectTitle: 'ロミオとジュリエット' })
  const venue = { stageShape: 'proscenium' as const, stageWidth: 14, stageDepth: 10, targetCapacity: 264, stageTemplate: 'proscenium' as const, wallColor: '#121010' }
  // 額縁舞台のひな形から、いちばん手前の袖幕だけ外す。客席からの前明かりを受けて、灰色の箱のように見えていた
  store.updateVenueLayout({ ...venue, stageParts: [
    // 舞台の壁は黒く塗る（本物の劇場と同じ）。明るい色だと、横明かりが向こうの壁に当たって明るい面になっていた
    ...templateParts('proscenium', venue).filter(part => !/^wing-(left|right)-1$/.test(part.id)).map(part => part.kind === 'wall' ? { ...part, color: '#121010', edited: true } : part),
    ...HOUSE_PARTS,
  ] })
  store.updateSettings({ showHouseLights: false, cameraView: 'audience', ambient: 0.07, hazeDensity: 0.07, exposure: 1.3, bloom: 0.25 })
  useStore.setState(state => ({
    productionPlan: { ...state.productionPlan, audienceBlocks: HOUSE_BLOCKS },
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
  let previous: Scene | null = null
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
    // 中の地明かりの中央は、下手・上手の平均で点ける（場面の look には書いていない）
    const look: Look = { ...scene.look }
    if (look.usC === undefined && (look.usL !== undefined || look.usR !== undefined)) {
      const cueOf = (raw: number | Cue | undefined): Cue => typeof raw === 'number' ? { level: raw } : raw ?? { level: 0 }
      const l = cueOf(look.usL), r = cueOf(look.usR)
      look.usC = { level: (l.level + r.level) / 2, color: l.color ?? r.color }
    }
    LIGHTS.forEach((light, index) => {
      const raw = look[light.key]
      const cue: Cue = typeof raw === 'number' ? { level: raw } : raw ?? { level: 0 }
      // 中の地明かりは舞台に近い真上寄りから当てるので、同じ値だと前明かりより強く、床の真ん中にたまりができる。距離の差を見込んで弱め、前明かりを少し足す
      const balance = /^us/.test(light.key) ? 0.62 : /^foh/.test(light.key) ? 1.15 : 1
      const level = Math.min(1, cue.level * balance * (light.measured === 'fresnel' ? FRESNEL_GAIN : 1))
      store.updateFixture(lightIds[index], {
        intensity: level, enabled: level > 0,
        ...(cue.color ? { color: cue.color } : {}),
        target: cue.target ?? light.target,
        followPerformerId: cue.follow ? castIds[cue.follow] : undefined,
        beamAngleDeg: cue.beam ?? light.beam,
      })
    })
    const changeover = previous !== null && JSON.stringify(Object.keys(previous.props).sort()) !== JSON.stringify(Object.keys(scene.props).sort())
    const fade = scene.fadeSec ?? (changeover ? 4 : undefined)
    if (fade !== undefined) store.setSceneFade(sceneId, fade)
    previous = scene
    store.updateSettings({ hazeDensity: scene.haze ?? 0.07 })
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
