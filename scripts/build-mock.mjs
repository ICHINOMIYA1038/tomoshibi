import { readFile, writeFile, readdir, mkdir } from 'node:fs/promises'
import { join } from 'node:path'
import { build, transform } from 'esbuild'

const root = new URL('../', import.meta.url)
const dist = new URL('../dist/', import.meta.url)
const files = await readdir(new URL('./assets/', dist))
const jsFile = files.find(file => /^main-.*\.js$/.test(file))
const cssFile = files.find(file => /^main-.*\.css$/.test(file))
if (!jsFile || !cssFile) throw new Error('Build assets are missing')
const bundled = await build({
  entryPoints: [join(dist.pathname, 'assets', jsFile)],
  bundle: true,
  write: false,
  format: 'iife',
  platform: 'browser',
  target: 'es2020',
  minify: true,
})
const script = bundled.outputFiles[0].text
  .replace(/<\/script/gi, '<\\/script')
  .replace(/\bemail:"([^"]+)@([^"]+)"/g, (_match, local, domain) => `email:"${local}\\u0040${domain}"`)
const css = (await readFile(join(dist.pathname, 'assets', cssFile), 'utf8')).replace(/<\/style/gi, '<\\/style')
let html = await readFile(join(dist.pathname, 'index.html'), 'utf8')
html = html.replace(/<script type="module" crossorigin src="\/assets\/[^"]+"><\/script>/, '')
html = html.replace(/<link rel="modulepreload"[^>]+>\s*/g, '')
html = html.replace(/<link rel="stylesheet" crossorigin href="\/assets\/[^"]+">/, '')
html = html.replace(/<link rel="manifest"[^>]+>/, '')
html = html.replace(/<title>[^<]+<\/title>/, '<title>演出プラン試作 | TOMOSHIBI小屋</title>')
html = html.replace(/<link rel="canonical" href="[^"]+" \/>/, '<link rel="canonical" href="https://tomoshibi.gikyokutosyokan.com/mock/" />')
html = html.replace('</head>', '    <meta name="robots" content="noindex, nofollow" />\n  </head>')
html = html.replace('</body>', () => '    <style>' + css + '</style>\n    <script>' + script + '</script>\n  </body>')
const inlineScript = html.match(/<script>([\s\S]*?)<\/script>/)?.[1]
if (!inlineScript || html.split('</body>').length !== 2) throw new Error('Mock HTML is malformed')
await transform(inlineScript, { loader: 'js' })
await writeFile(new URL('../public/mock/index.html', import.meta.url), html)
await mkdir(new URL('./mock/', dist), { recursive: true })
await writeFile(new URL('./mock/index.html', dist), html)
const projectsHtml = html
  .replace('<title>演出プラン試作 | TOMOSHIBI小屋</title>', '<title>プロジェクト | TOMOSHIBI小屋</title>')
  .replace('href="https://tomoshibi.gikyokutosyokan.com/mock/"', 'href="https://tomoshibi.gikyokutosyokan.com/mock/projects/"')
const projectsDir = new URL('../public/mock/projects/', import.meta.url)
await mkdir(projectsDir, { recursive: true })
await writeFile(new URL('index.html', projectsDir), projectsHtml)
await mkdir(new URL('./mock/projects/', dist), { recursive: true })
await writeFile(new URL('./mock/projects/index.html', dist), projectsHtml)
