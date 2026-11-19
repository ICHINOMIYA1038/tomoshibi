import { useEffect, useRef } from 'react'
// プロジェクト一覧の右側。トップページと同じ「照明・場割り・通し」の 3 段で、見本の公演を動かした映像を並べる。
// 映像はトップと同じ public/top/ のもの（見本の公演「ロミオとジュリエット」）。2026-11-18 に写真から作り直した

const GUIDES = [
  {
    role: '照明',
    title: '暗転から、一灯ずつ。',
    text: '右の一覧の「＋ 追加」から照明を足して、3D の舞台に吊ります。明るさ・色・狙いを変えると、客席からの見え方がその場で変わります。',
    clip: 'light',
    label: '暗転から照明を一灯ずつ点けていく映像',
  },
  {
    role: '場割り',
    title: '場面ごとに、立ち位置と明かりを。',
    text: '左の「公演の流れ」に章と場面を並べ、場面ごとに役者・セット・明かりを変えます。平面図と 3D は同じ舞台を見ています。',
    clip: 'scenes',
    label: '場面を順に選び、3D と平面図の立ち位置と明かりが変わる映像',
  },
  {
    role: '通し',
    title: '頭から、通してみる。',
    text: '上の「▶ 通しで見る」で場面を順に送り、舞台全体の流れを確かめます。',
    clip: 'play',
    label: '通しで見るで場面が順に変わる映像',
  },
]

export function EmptyLibrary({ onOpenSample }: { onOpenSample?: () => void }) {
  return <div className="library-guide">
    <h2>舞台を組む流れ</h2>
    <p className="library-guide-lead">見本の公演「ロミオとジュリエット」から始めると、組み上がった舞台をそのまま触って、直して残せます。</p>
    <div className="library-guide-actions">
      {onOpenSample
        ? <button type="button" className="library-guide-demo" onClick={onOpenSample}>見本から始める</button>
        : <a className="library-guide-demo" href="/studio/?demo=2">見本の公演を開く</a>}
      <a href="/help">操作の説明を読む（動画つき）</a>
    </div>
    <ol className="library-guide-list">
      {GUIDES.map(item => <li key={item.clip}>
        <div className="library-guide-text">
          <span className="library-guide-role">{item.role}</span>
          <h3>{item.title}</h3>
          <p>{item.text}</p>
        </div>
        <LoopClip clip={item.clip} label={item.label} />
      </li>)}
    </ol>
  </div>
}

/**
 * 音の無い、くり返しの映像。見える位置に来たら再生し、外れたら止める。
 * autoPlay だけだと、内側でスクロールする欄では画面外で始まった映像が止まったままになっていた（2026-11-19）。
 * React は muted を属性として書かないので、自動再生の条件を満たすよう属性も付ける
 */
function LoopClip({ clip, label }: { clip: string; label: string }) {
  const ref = useRef<HTMLVideoElement>(null)
  useEffect(() => {
    const video = ref.current
    if (!video) return
    video.muted = true
    video.setAttribute('muted', '')
    const observer = new IntersectionObserver(entries => {
      for (const entry of entries) {
        if (entry.isIntersecting) video.play().catch(() => { /* 再生できなくても表紙の絵は出ている */ })
        else video.pause()
      }
    }, { threshold: 0.2 })
    observer.observe(video)
    return () => observer.disconnect()
  }, [])
  return <video ref={ref} poster={`/top/${clip}.jpg`} muted loop playsInline preload="auto" aria-label={label}>
    <source src={`/top/${clip}.webm`} type="video/webm" />
    <source src={`/top/${clip}.mp4`} type="video/mp4" />
  </video>
}
