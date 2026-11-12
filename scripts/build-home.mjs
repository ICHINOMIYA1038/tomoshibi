import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

const dist = join(import.meta.dirname, '..', 'dist')
mkdirSync(join(dist, 'simulator'), { recursive: true })
writeFileSync(join(dist, 'simulator', 'index.html'), `<!doctype html><html lang="ja"><head><meta charset="utf-8"/><meta name="robots" content="noindex"/><title>TOMOSHIBI小屋へ移動します</title><script>location.replace((location.hash.startsWith('#scene=') || new URLSearchParams(location.search).has('embed') || window.webkit?.messageHandlers?.TomoshibiSession ? '/studio/' : '/studio/projects/') + location.search + location.hash)</script></head><body><p>新しい演出プラン画面へ移動します。<a href="/studio/projects/">プロジェクトを開く</a></p></body></html>`)

const home = readFileSync(join(import.meta.dirname, '..', 'templates', 'home.html'), 'utf8')
if (!home.includes('href="/studio/projects/"') || home.includes('href="/simulator/"')) {
  throw new Error('TOP の主導線を確認できません')
}
writeFileSync(join(dist, 'index.html'), home)

// public/lighting-lab はビルドで dist に複製されるので、本番向けのビルドでは消す（vite.config.ts の lightingLab と同じ条件）
if (!process.env.TOMOSHIBI_LIGHTING_LAB) rmSync(join(dist, 'lighting-lab'), { recursive: true, force: true })
