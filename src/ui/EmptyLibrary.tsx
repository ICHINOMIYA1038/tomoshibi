// プロジェクト一覧の右側。主な使い方 3 つを、実際の画面の写真と一緒に縦に並べる。

const GUIDES = [
  {
    title: '照明を吊って、3D で光を見る',
    text: '右の一覧の「＋ 追加」から照明を選び、3D の画面へドラッグしてバトンに吊ります。明るさ・色・狙いを変えると、客席からの見え方がすぐ変わります。ゲルの色やスモークも試せます。',
    image: '/library-guide/guide-v2-1.jpg',
    alt: '3D の画面。本棚と窓のある舞台に、吊った照明から暖かい明かりが当たり、右に照明や役者の一覧が並んでいる',
  },
  {
    title: '平面図で、役者とセットを置く',
    text: '上から見た図で、役者（色の丸）や舞台セットをドラッグして動かします。番号の丸は照明の当たる所です。「会場」に切り替えると、舞台の形や客席も変えられます。',
    image: '/library-guide/guide-v2-2.jpg',
    alt: '平面図。舞台の上に役者の丸と、照明の当たる所を示す番号の丸が並んでいる',
  },
  {
    title: 'シーンを重ねて、通しで見る',
    text: '場面ごとにシーンを足して、明かりと立ち位置を変えます。「▶ 通しで見る」を押すと、シーンが順につながり、下のタイムラインでいまの場面がわかります。',
    image: '/library-guide/guide-v2-3.jpg',
    alt: '通しで見るの画面。舞台の下に、シーンの番号を線でつないだタイムラインが出ている',
  },
]

export function EmptyLibrary() {
  return <div className="library-guide">
    <h2>舞台の明かりを、ブラウザで仕込む</h2>
    <p className="library-guide-lead">主な使い方は 3 つです。</p>
    <ol className="library-guide-list">
      {GUIDES.map((item, index) => <li key={item.title}>
        <div className="library-guide-text">
          <span className="library-guide-number">{index + 1}</span>
          <h3>{item.title}</h3>
          <p>{item.text}</p>
        </div>
        <img src={item.image} alt={item.alt} loading={index ? 'lazy' : 'eager'} />
      </li>)}
    </ol>
    <div className="library-guide-actions">
      <a className="library-guide-demo" href="/studio/?demo=2">見本の公演を開いて触ってみる</a>
      <a href="/help">操作の説明を読む</a>
    </div>
  </div>
}
