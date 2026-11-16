// プロジェクトを選んでいない（または 1 件も無い）ときの右側。
// 照明の進行表（キューシート）の形で、作り始めから通しで見るまでの流れを見せる。

const CUES: Array<{ q: string; cue: string; action: string; where: string }> = [
  { q: 'Q1', cue: '作り始める', action: '上演する小屋の形を選ぶ。額縁・円形・張り出し・自由な形から選べ、大きさはあとで変えられる', where: '「新しいプロジェクトを作る」' },
  { q: 'Q2', cue: '舞台が開いたら', action: '照明を吊る。照明の札を 3D の画面へドラッグし、バトンに重ねて落とすと吊れる', where: '一覧の「＋ 追加」' },
  { q: 'Q3', cue: '吊り終えたら', action: '役者と舞台セットを置く。平面図でドラッグして動かす', where: '平面図' },
  { q: 'Q4', cue: '場面が変わるところで', action: 'シーンを足し、明るさ・色・狙いと、役者の位置を変える。照明の吊る位置は全シーン共通', where: '「公演の流れ」' },
  { q: 'Q5', cue: '仕上げに', action: '通しで見る。シーンの間がなめらかにつながる', where: '「▶ 通しで見る」' },
]

export function EmptyLibrary({ onStart }: { onStart: () => void }) {
  return <div className="empty-library">
    <h2>はじめての仕込み</h2>
    <p>舞台ができるまでの流れを、照明の進行表（キューシート）にしました。上から順に進めます。</p>
    <table className="cue-sheet">
      <thead><tr><th scope="col">Q</th><th scope="col">きっかけ</th><th scope="col">やること</th><th scope="col">どこで</th></tr></thead>
      <tbody>{CUES.map(item => <tr key={item.q}>
        <th scope="row">{item.q}</th><td>{item.cue}</td><td>{item.action}</td><td>{item.where}</td>
      </tr>)}</tbody>
    </table>
    <div className="empty-library-actions">
      <button type="button" className="empty-library-start" onClick={onStart}>Q1 小屋を選んで始める</button>
      <a href="/studio/?demo=1">見本の公演を開いて触ってみる</a>
      <a href="/help">操作の説明を読む</a>
    </div>
  </div>
}
