// 録った動画（scripts/help-videos/out/*.webm）を、操作説明のページ（public/help.html）に載せる形にする。
//   node scripts/help-videos/publish.mjs
// → public/help-media/ に、ウェブ用の mp4（幅 1280・音声なし・先頭に目次）と表紙の jpg、videos.json を作る。
// 名前に中身の印（sha256 の先頭 8 文字）を付けるので、長くキャッシュしても古い動画が出ない（public/_headers）。
// 手本はワザボシの video/scripts/publish-guide.mjs（2026-11-12）。
import { createHash } from 'node:crypto'
import { execFileSync } from 'node:child_process'
import { existsSync, mkdirSync, readFileSync, readdirSync, renameSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

const HERE = import.meta.dirname
const ROOT = join(HERE, '..', '..')
const SRC = join(HERE, 'out')
const OUT = join(ROOT, 'public', 'help-media')

// 並び順と、一覧に出す題・ねらい。id は record.sh の scene_XX と同じ
const CLIPS = [
  { id: '01', title: '道具を切り替える', goal: '選択・移動・回転・拡大の違いと、キーでの切り替え方' },
  { id: '02', title: '一覧で選ぶ・足す・親子にする', goal: 'ヒエラルキーで物を選び、「＋ 追加」で足し、「親」で一緒に動かす' },
  { id: '03', title: '右クリックのメニュー', goal: '物の操作と、押した場所に役者や照明を足す方法' },
  { id: '04', title: '舞台と客席を動かす', goal: '見本の客席の固定を外し、平面図で動かし、丸い取っ手で回す（全シーン共通の物）' },
  { id: '05', title: '照明の狙いを動かす', goal: '右の設定の「3D でつかむ点」と、平面図の色の輪' },
  { id: '06', title: 'シーンを組み立てる', goal: 'シーンを足し、並べ替え、通しで見る' },
  { id: '07', title: 'ほかのシーンにも反映する', goal: '変えた直後の帯で「この章・このあと・全シーン」にも入れる' },
  { id: '08', title: '3D と平面図を切り替える', goal: '平面図を大きく出し、上下・左右に並べ、仕込み図と明かりの見た目を切り替える' },
]

const sha8 = file => createHash('sha256').update(readFileSync(file)).digest('hex').slice(0, 8)
const ff = args => execFileSync('ffmpeg', ['-v', 'error', '-y', ...args])

rmSync(OUT, { recursive: true, force: true })
mkdirSync(OUT, { recursive: true })
const items = []
let total = 0
for (const clip of CLIPS) {
  const mp4Src = join(SRC, `${clip.id}.mp4`)
  const src = existsSync(mp4Src) ? mp4Src : join(SRC, `${clip.id}.webm`)
  if (!existsSync(src)) throw new Error(`動画が無い: ${src}（record.sh ${clip.id} で録る）`)
  const mp4 = join(OUT, `${clip.id}.mp4`)
  const jpg = join(OUT, `${clip.id}.jpg`)
  // 録画は 1440×900 の H.264。縮めずに、文字がくっきり読める画質（crf 20）にする。音声は無い
  ff(['-i', src, '-c:v', 'libx264', '-crf', '20', '-preset', 'slow', '-pix_fmt', 'yuv420p', '-an', '-movflags', '+faststart', mp4])
  const sec = Number(execFileSync('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', mp4]).toString())
  // 表紙: 説明の帯が出たあとの、操作の途中の画面
  ff(['-ss', (sec * 0.45).toFixed(2), '-i', mp4, '-frames:v', '1', '-vf', 'scale=960:-2', '-q:v', '3', jpg])
  const mp4Name = `${clip.id}-${sha8(mp4)}.mp4`
  const jpgName = `${clip.id}-${sha8(jpg)}.jpg`
  renameSync(mp4, join(OUT, mp4Name))
  renameSync(jpg, join(OUT, jpgName))
  const size = statSync(join(OUT, mp4Name)).size
  total += size
  items.push({ ...clip, sec: Math.round(sec), src: `/help-media/${mp4Name}`, poster: `/help-media/${jpgName}` })
  console.log(clip.id, clip.title, `${Math.round(sec)}秒`, `${(size / 1e6).toFixed(2)}MB`)
}
writeFileSync(join(OUT, 'videos.json'), JSON.stringify({ _: '操作説明の動画の一覧（scripts/help-videos/publish.mjs が作る。手で直さない）', items }, null, 1) + '\n')
console.log(`合計 ${(total / 1e6).toFixed(2)}MB、${readdirSync(OUT).length} ファイル`)
