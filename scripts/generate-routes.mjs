// ビルドのあとに、アプリの URL ごとの HTML を dist に作る。
// 見つからない URL は 404 を返す設定（wrangler.jsonc）なので、index.html を各 URL に複製し、タイトルなどを差し替える
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'

const ORIGIN = 'https://tomoshibi.gikyokutosyokan.com'
const SUFFIX = ' | TOMOSHIBI小屋'

const ROUTES = [
  { path: '/pro', title: 'Pro プラン', description: 'TOMOSHIBI小屋の Pro プランの料金と、Free プランとの違いをご案内します。' },
  { path: '/contact', title: 'お問い合わせ', description: 'TOMOSHIBI小屋へのお問い合わせ窓口です。' },
  { path: '/terms', title: '利用規約', description: 'TOMOSHIBI小屋の利用規約です。' },
  { path: '/privacy', title: 'プライバシーポリシー', description: 'TOMOSHIBI小屋のプライバシーポリシーです。' },
  { path: '/tokushoho', title: '特定商取引法に基づく表記', description: 'TOMOSHIBI小屋の特定商取引法に基づく表記です。' },
  { path: '/pro/success', title: 'お申し込みありがとうございます', noindex: true },
  { path: '/pro/cancel', title: 'お申し込みをキャンセルしました', noindex: true },
]

const dist = join(import.meta.dirname, '..', 'dist')
const base = readFileSync(join(dist, 'index.html'), 'utf8')
for (const path of ['studio/index.html', 'studio/projects/index.html']) {
  if (!existsSync(join(dist, path))) throw new Error(`見つからない: ${path}`)
}

function replaceOnce(html, pattern, replacement) {
  if (!pattern.test(html)) throw new Error(`見つからない: ${pattern}`)
  return html.replace(pattern, replacement)
}

for (const route of ROUTES) {
  const title = route.title + SUFFIX
  const url = ORIGIN + route.path
  // トップだけの部分（構造化データ、見出し）は head と body の 2 か所にある
  let html = base.replace(/<!-- home-only:start -->[\s\S]*?<!-- home-only:end -->\s*/g, '')
  html = replaceOnce(html, /<title>.*<\/title>/, `<title>${title}</title>`)
  html = replaceOnce(html, /<link rel="canonical" href="[^"]*" \/>/, `<link rel="canonical" href="${url}" />`)
  html = replaceOnce(html, /<meta property="og:url" content="[^"]*" \/>/, `<meta property="og:url" content="${url}" />`)
  html = replaceOnce(html, /<meta property="og:title" content="[^"]*" \/>/, `<meta property="og:title" content="${title}" />`)
  html = replaceOnce(html, /<meta name="twitter:title" content="[^"]*" \/>/, `<meta name="twitter:title" content="${title}" />`)
  if (route.description) {
    html = replaceOnce(html, /<meta name="description" content="[^"]*" \/>/, `<meta name="description" content="${route.description}" />`)
    html = replaceOnce(html, /<meta property="og:description" content="[^"]*" \/>/, `<meta property="og:description" content="${route.description}" />`)
    html = replaceOnce(html, /<meta name="twitter:description" content="[^"]*" \/>/, `<meta name="twitter:description" content="${route.description}" />`)
  }
  if (route.noindex) html = replaceOnce(html, /<title>/, '<meta name="robots" content="noindex" />\n    <title>')
  const file = join(dist, `${route.path.slice(1)}.html`)
  mkdirSync(dirname(file), { recursive: true })
  writeFileSync(file, html)
}
