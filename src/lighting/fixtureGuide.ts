import type { Fixture } from '../store'
import { FIXTURE_PROFILES } from './fixtureTypes'

// 器具を選んだときに出す「この明かりの役目」。器具の名前・機種・吊る位置から役目を見分け、2〜3 文で書く。
// 文の根拠は docs/stage-lighting-design-research.md と reports/2026-11-20-tomoshibi-lighting-study/research.md
// （日本の照明家・照明会社・高校演劇の資料）。資料に無いことは書かない。誇大な言い方（「劇場で同じ明かりになる」など）はしない

export type FixtureRoleKey = 'sus' | 'upperCyc' | 'lowerCyc' | 'back' | 'side' | 'front' | 'pin' | 'roll'
export type GuideEntry = { key: string; label: string; text: string }

const ROLES: Record<FixtureRoleKey, Omit<GuideEntry, 'key'>> = {
  sus: {
    label: 'サス（地明かり）',
    text: '舞台の上のバトンに吊り、上から演技エリアを照らす明かりです。舞台をいくつかのエリアに分け、隣どうしを少し重ねて、役者がどこへ動いても暗い切れ目ができないようにします。真上寄りだけだと顔に影ができるので、前明かりと組み合わせます。',
  },
  upperCyc: {
    label: 'ホリゾント（アッパー）',
    text: '舞台の奥のホリゾント幕を、上のバトンから染める明かりです。空や海の色、昼と夜を背景で伝えます。幕の上から中ほどまでを、むらなく染めるのが役目です。',
  },
  lowerCyc: {
    label: 'ホリゾント（ロアー）',
    text: 'ホリゾント幕を、床から照らす明かりです。地平線のあたりを明るくして、夜明けや夕暮れの色の変わり目を出します。上のアッパーと色を変えて、空に濃淡を作ることもあります。',
  },
  back: {
    label: '逆光（バック）',
    text: '役者の後ろの上から、客席の方へ向けて当てる明かりです。頭と肩の輪郭を光らせて、人を背景から浮かせ、舞台に奥行きを出します。顔には当たらないので、濃い色を入れることもできます。',
  },
  side: {
    label: '横明かり（SS）',
    text: '袖から、役者に横から当てる明かりです（SS はステージサイドスポットの略）。床をあまり照らさずに体の厚みと動きを浮かせるので、踊りの場面でよく使われます。手前の役者の影が、向こうの役者に掛かりやすい明かりでもあります。',
  },
  front: {
    label: '前明かり（フロント）',
    text: '客席の側から、役者の顔に当てる明かりです。上からの明かりだけでは、うつむいたときに顔が影になるので、表情を見せるために欠かせません。客席の左右の壁から斜めに当てる FR（フロントサイド）も、顔を見せる明かりです。',
  },
  pin: {
    label: 'ピン（フォロースポット）',
    text: '客席の後ろの高い所から、人が手で動かして役者を追う明かりです。いちばん見てほしい人に、観客の目を集めます。1 台に 1 人、操作する人が付きます。',
  },
  roll: {
    label: '転がし',
    text: 'バトンに吊らず、床に直接置いて使う器具です。低い所から当てるので、役者の影を壁や幕に大きく映したり、足もとだけを照らしたりできます。',
  },
}

const PROFILE_NOTE: Omit<GuideEntry, 'key'> = {
  label: 'エリスポ（エリプソイダル・スポット）',
  text: '光の輪郭をくっきり出せるスポットです。シャッターで光の形を切ったり、ゴボで模様を映したりできます。',
}

const GOBO_NOTE: Omit<GuideEntry, 'key'> = {
  label: 'ゴボ',
  text: '金属やガラスに模様を抜いた板です。この器具に入れて、木漏れ日などの模様を床や背景に映しています。',
}

const has = (name: string, words: RegExp) => words.test(name)

/** 名前・機種・吊る位置から、器具の役目を見分ける。見分けられなければ null */
export function fixtureRole(fixture: Fixture): FixtureRoleKey | null {
  const profile = FIXTURE_PROFILES[fixture.presetKey]
  const name = fixture.name ?? ''
  const [x, y, z] = fixture.position
  const [tx, , tz] = fixture.target
  if (profile?.kind === 'FollowSpot' || has(name, /ピン|フォロー/)) return 'pin'
  if (profile?.kind === 'Cyc' || profile?.beamShape === 'cyc' || has(name, /ホリ/)) {
    if (has(name, /ロアー|LH/)) return 'lowerCyc'
    if (has(name, /アッパー|UH/)) return 'upperCyc'
    return y < 2 ? 'lowerCyc' : 'upperCyc'
  }
  if (has(name, /逆光|バック/)) return 'back'
  if (has(name, /横明かり|横・|SS|サイド/)) return 'side'
  if (has(name, /前明かり|フロント|FR|FOH|シーリング|CL/)) return 'front'
  if (has(name, /転がし/)) return 'roll'
  if (has(name, /サス|地明かり/)) return 'sus'
  // 名前が機種のままのとき（足したばかりの器具）だけ、吊る位置と狙いで見分ける（客席側が z の＋、額縁の前の縁が z 2.3 ほど）。
  // 「月明かり」「窓明かり」のように名前で役目を付けた器具は、位置から決めつけない
  const plainName = name.replace(/\s*[（(](複製|\d+ 台目)[）)]\s*$/, '').trim()
  if (plainName && plainName !== profile?.model && plainName !== fixture.presetKey) return null
  if (profile?.kind === 'Footlight') return null
  if (y < 1) return 'roll'
  if (z > 2.5 && y > 3) return 'front'
  if (Math.abs(x) > 5.5 && y < 5 && Math.abs(tx - x) > 3) return 'side'
  if (y > 4 && tz > z + 1.5) return 'back'
  if (y > 5 && z <= 2.5) return 'sus'
  return null
}

/** 選んだ器具について出す説明。役目・器具の種類・ゴボの順。何も言えないときは空 */
export function fixtureGuide(fixture: Fixture): GuideEntry[] {
  const entries: GuideEntry[] = []
  const role = fixtureRole(fixture)
  if (role) entries.push({ key: role, ...ROLES[role] })
  const kind = FIXTURE_PROFILES[fixture.presetKey]?.kind
  if (kind === 'Profile' || kind === 'LED_Profile') entries.push({ key: 'profile', ...PROFILE_NOTE })
  if (fixture.gobo) entries.push({ key: 'gobo', ...GOBO_NOTE })
  return entries
}

export type ColorNote = { family: string; text: string }

/**
 * 付けている色が、舞台で何を表しやすいか。色フィルターの番号は近い色の目安（十の位で系統が分かる：
 * 10 番台 ピンク、20 番台 赤、30 番台 アンバー、40 番台 黄、50 番台 緑、60 番台 ライトブルー、70 番台 ダークブルー、80 番台 紫）
 */
export function colorNote(fixture: Fixture): ColorNote | null {
  if (!fixture.gelEnabled) return null
  const [r, g, b] = fixture.color
  const max = Math.max(r, g, b)
  const min = Math.min(r, g, b)
  if (max <= 0) return null
  const sat = (max - min) / max
  if (sat < 0.06) return null
  let hue = 0
  const d = max - min
  if (max === r) hue = ((g - b) / d) % 6
  else if (max === g) hue = (b - r) / d + 2
  else hue = (r - g) / d + 4
  hue = (hue * 60 + 360) % 360
  const lightBlue = { family: '水色（60 番台）', text: '昼の空や水を思わせる明るい青です。昼の屋外の場面で、ホリによく入れます。' }
  if (hue >= 185 && hue < 255) {
    if (sat < 0.3) return { family: '淡い青（#64・#78 など）', text: '白熱の黄みを抜いて白く見せたり、夜の地明かりにしたりする色です。' }
    if (hue < 222 && sat < 0.6) return lightBlue
    return { family: '濃い青（#72 など）', text: '夜や月夜の空を表しやすい色です。顔には当てず、ホリや逆光に入れることが多い色です。' }
  }
  if (hue >= 255 && hue < 290) return { family: 'ラベンダー・紫（80 番台）', text: '月明かりや夜明け前など、青より柔らかい夜の色として使われます。' }
  if (hue >= 290 && hue < 345) return { family: 'ピンク（10 番台）', text: '舞台に華やかさを足す色です。' }
  if (hue >= 345 || hue < 18) return sat < 0.45
    ? { family: 'ピンク（10 番台）', text: '舞台に華やかさを足す色です。' }
    : { family: '赤（#22 など）', text: '炎や争い、激しい感情を表しやすい色です。顔を赤く染めないよう、ホリや逆光に入れます。' }
  if (hue < 48) return sat < 0.35
    ? { family: '薄い暖色', text: '電球のような暖かさを、少し足す色です。' }
    : { family: 'アンバー（#33 など）', text: '夕日や、暖かい室内を表しやすい色です。' }
  if (hue < 70) return { family: '黄（40 番台）', text: '日差しの明るさを足す色です。' }
  if (hue < 170) return { family: '緑（50 番台）', text: '森や水辺を思わせる色です。' }
  return lightBlue
}
