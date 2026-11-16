import { useState } from 'react'

// プロジェクト一覧の右側。主な使い方 3 つを、実際の画面の写真で見せる。
// 左の番号を押すと、右の写真が切り替わる（同じ大きさの箱を 3 つ並べない）。

const GUIDES = [
  {
    title: '照明を吊って、3D で光を見る',
    text: '照明をバトンに吊り、明るさ・色・狙いを決めると、客席からの見え方がすぐ 3D に出ます。ゲルの色やスモークも試せます。',
    image: '/library-guide/guide-1.jpg',
    alt: '3D の画面。本棚と窓のある舞台に、暖かい色の明かりが当たっている',
  },
  {
    title: '平面図で、役者とセットを置く',
    text: '上から見た図で、役者や舞台セットをドラッグして動かします。「会場」に切り替えると、舞台の形や客席も変えられます。',
    image: '/library-guide/guide-2.jpg',
    alt: '平面図。舞台の上に役者の丸と照明の番号が並んでいる',
  },
  {
    title: 'シーンを重ねて、通しで見る',
    text: '場面ごとにシーンを足して、明かりと立ち位置を変えます。「通しで見る」で、最初から最後までつなげて確かめます。',
    image: '/library-guide/guide-3.jpg',
    alt: '通しで見るの画面。シーンの番号が線でつながったタイムラインが出ている',
  },
]

export function EmptyLibrary() {
  const [active, setActive] = useState(0)
  const guide = GUIDES[active]
  return <div className="library-guide">
    <h2>舞台の明かりを、ブラウザで仕込む</h2>
    <p className="library-guide-lead">主な使い方は 3 つです。番号を押すと、その画面の写真に切り替わります。</p>
    <div className="library-guide-body">
      <ol className="library-guide-steps" role="tablist" aria-label="主な使い方">
        {GUIDES.map((item, index) => <li key={item.title}>
          <button type="button" role="tab" id={`library-guide-tab-${index}`} aria-selected={index === active}
            aria-controls="library-guide-panel" className={index === active ? 'active' : ''} onClick={() => setActive(index)}>
            <span className="library-guide-number">{index + 1}</span>
            <strong>{item.title}</strong>
            <small>{item.text}</small>
          </button>
        </li>)}
      </ol>
      <figure className="library-guide-shot" id="library-guide-panel" role="tabpanel" aria-labelledby={`library-guide-tab-${active}`}>
        <img src={guide.image} alt={guide.alt} key={guide.image} />
      </figure>
    </div>
    <div className="library-guide-actions">
      <a className="library-guide-demo" href="/studio/?demo=2">見本の公演を開いて触ってみる</a>
      <a href="/help">操作の説明を読む</a>
    </div>
  </div>
}
