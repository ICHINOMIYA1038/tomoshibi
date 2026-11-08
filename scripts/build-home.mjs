import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

const dist = join(import.meta.dirname, '..', 'dist')
const legacy = readFileSync(join(dist, 'index.html'), 'utf8')
if (!legacy.includes('src="/assets/') || !legacy.includes('TOMOSHIBI小屋')) {
  throw new Error('従来のシミュレーターのビルドを確認できません')
}
const simulator = legacy
  .replace(/<title>[^<]+<\/title>/, '<title>従来の照明シミュレーター | TOMOSHIBI小屋</title>')
  .replace('href="https://tomoshibi.gikyokutosyokan.com/"', 'href="https://tomoshibi.gikyokutosyokan.com/simulator/"')
  .replace('content="https://tomoshibi.gikyokutosyokan.com/"', 'content="https://tomoshibi.gikyokutosyokan.com/simulator/"')
mkdirSync(join(dist, 'simulator'), { recursive: true })
writeFileSync(join(dist, 'simulator', 'index.html'), simulator)

const home = readFileSync(join(import.meta.dirname, '..', 'templates', 'home.html'), 'utf8')
if (!home.includes('href="/studio/projects/"') || !home.includes('href="/simulator/"')) {
  throw new Error('TOP の主導線を確認できません')
}
writeFileSync(join(dist, 'index.html'), home)
