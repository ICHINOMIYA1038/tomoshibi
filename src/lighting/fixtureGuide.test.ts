import { describe, expect, it } from 'vitest'
import type { Fixture } from '../store'
import { colorNote, fixtureGuide, fixtureRole } from './fixtureGuide'

const fixture = (patch: Partial<Fixture>): Fixture => ({
  id: 'f', name: '', presetKey: 'Fresnel10', position: [0, 8, 0], target: [0, 1.5, -2], beamAngleDeg: 40,
  intensity: 1, color: [1, 1, 1], gelEnabled: false, whiteMix: 0, colorTempK: 3200, rotationZDeg: 0, enabled: true,
  ...patch,
} as Fixture)

describe('fixtureRole', () => {
  it('見本の公演の器具を、名前から見分ける', () => {
    expect(fixtureRole(fixture({ name: 'サス・下手' }))).toBe('sus')
    expect(fixtureRole(fixture({ name: '逆光・上手' }))).toBe('back')
    expect(fixtureRole(fixture({ name: '横明かり・下手', presetKey: 'Source4_36' }))).toBe('side')
    expect(fixtureRole(fixture({ name: '前明かり・中央' }))).toBe('front')
    expect(fixtureRole(fixture({ name: '転がし・上手', position: [0.4, 0.25, 1.85] }))).toBe('roll')
    expect(fixtureRole(fixture({ name: 'ピン', presetKey: 'FollowSpotXenon2k' }))).toBe('pin')
    expect(fixtureRole(fixture({ name: 'サス・下手（2 台目）' }))).toBe('sus')
  })
  it('ホリはアッパーとロアーを高さで分ける', () => {
    expect(fixtureRole(fixture({ name: 'ホリゾント・下手', presetKey: 'CycWashStudy', position: [-3.4, 8, -4.15] }))).toBe('upperCyc')
    expect(fixtureRole(fixture({ name: 'ホリゾント', presetKey: 'CycWashStudy', position: [0, 0.3, -6] }))).toBe('lowerCyc')
  })
  it('バックサスは逆光として扱う（サスより先に見る）', () => {
    expect(fixtureRole(fixture({ name: 'バックサス' }))).toBe('back')
  })
  it('役目の名前を付けた器具は、位置から決めつけない', () => {
    expect(fixtureRole(fixture({ name: '月明かり', presetKey: 'Source4_26', position: [5.6, 7.6, -5.6], target: [0.6, 0, -2.4] }))).toBeNull()
  })
  it('名前が機種のままなら、吊る位置で見分ける', () => {
    expect(fixtureRole(fixture({ name: 'Fresnel10', position: [0, 8.6, 6.8], target: [0, 1.5, 0] }))).toBe('front')
    expect(fixtureRole(fixture({ name: 'Fresnel10', position: [0, 8, 0.8], target: [0, 1.5, -3.8] }))).toBe('sus')
  })
})

describe('fixtureGuide', () => {
  it('ゴボを入れたエリスポには、器具の種類とゴボの説明を出す', () => {
    const keys = fixtureGuide(fixture({ name: '月明かり', presetKey: 'Source4_26', gobo: 'leaves' } as Partial<Fixture>)).map(item => item.key)
    expect(keys).toEqual(['profile', 'gobo'])
  })
})

describe('colorNote', () => {
  it('色フィルターを付けていなければ何も出さない', () => {
    expect(colorNote(fixture({ color: [0.2, 0.3, 1] }))).toBeNull()
  })
  it('見本の色を、系統に分ける', () => {
    expect(colorNote(fixture({ gelEnabled: true, color: [0.12, 0.2, 0.62] }))?.family).toMatch('濃い青')
    expect(colorNote(fixture({ gelEnabled: true, color: [0.74, 0.8, 1] }))?.family).toMatch('淡い青')
    expect(colorNote(fixture({ gelEnabled: true, color: [0.55, 0.75, 1] }))?.family).toMatch('水色')
    expect(colorNote(fixture({ gelEnabled: true, color: [1, 0.72, 0.45] }))?.family).toMatch('アンバー')
    expect(colorNote(fixture({ gelEnabled: true, color: [1, 0.42, 0.3] }))?.family).toMatch('赤')
    expect(colorNote(fixture({ gelEnabled: true, color: [1, 0.62, 0.66] }))?.family).toMatch('ピンク')
    expect(colorNote(fixture({ gelEnabled: true, color: [0.8, 0.72, 1] }))?.family).toMatch('ラベンダー')
    expect(colorNote(fixture({ gelEnabled: true, color: [1, 1, 1] }))).toBeNull()
  })
})
