import { useStore } from '../store'

export function HelpOverlay() {
  const show = useStore(s => s.settings.showHelp)
  const update = useStore(s => s.updateSettings)
  if (!show) return null
  return (
    <div className="help-overlay" onClick={() => update({ showHelp: false })}>
      <div className="help-card" onClick={e => e.stopPropagation()}>
        <button className="help-close" onClick={() => update({ showHelp: false })}>×</button>
        <h1>TOMOSHIBI<span style={{ fontFamily: 'var(--font-serif)', marginLeft: 2 }}>小屋</span></h1>
        <p className="subtitle">舞台に灯をともす、ちいさな小屋 — 3D で組む・見る・残す</p>

        <h2>はじめに</h2>
        <p>右パネルの <b>器具</b> タブで吊り込みを足し、<b>役者</b> タブで人を配置します。各要素は 3D 内で直接ドラッグして動かせます。</p>

        <div className="help-pc-only">
          <h2>カメラ操作 (PC)</h2>
          <div className="help-grid">
            <div><kbd>左ドラッグ</kbd></div><div>回転</div>
            <div><kbd>ホイール</kbd></div><div>ズーム</div>
            <div><kbd>右ドラッグ</kbd></div><div>パン</div>
            <div><kbd>W</kbd><kbd>A</kbd><kbd>S</kbd><kbd>D</kbd></div><div>カメラを前後左右へ</div>
            <div><kbd>Q</kbd> <kbd>E</kbd></div><div>カメラを上下へ</div>
            <div><kbd>1</kbd>〜<kbd>4</kbd></div><div>視点切替 (客席 / 俯瞰 / 袖 / 自由)</div>
          </div>
        </div>

        <h2>カメラ操作 (スマホ / タブレット)</h2>
        <div className="help-grid">
          <div><kbd>1本指ドラッグ</kbd></div><div>回転</div>
          <div><kbd>2本指ピンチ</kbd></div><div>ズーム</div>
          <div><kbd>2本指ドラッグ</kbd></div><div>パン</div>
          <div><kbd>器具タップ</kbd></div><div>選択 → 3D矢印で移動</div>
        </div>

        <h2>器具と役者の操作</h2>
        <div className="help-grid">
          <div><kbd>クリック</kbd></div><div>器具・役者を選択</div>
          <div><kbd>3D 矢印</kbd></div><div>選択後、ドラッグで位置/狙いを移動</div>
          <div><kbd>Esc</kbd></div><div>選択を外す</div>
          <div><kbd>Del</kbd> / <kbd>⌫</kbd></div><div>選択中の器具/役者を削除</div>
          <div><kbd>⌘ + D</kbd></div><div>フィクスチャ複製</div>
        </div>

        <h2>シーンの保存と共有</h2>
        <p>右上 <b>⚙ 設定</b> → <b>シーン管理</b> から、明かりプランを名前を付けて保存・読込できます。<b>共有URL</b> を生成すれば URL を渡すだけで同じシーンが開けます。</p>

        <h2>動作が重い時</h2>
        <p><b>⚙ 設定 → 表現 → 描画品質</b> を <b>Low</b> に。古いPC・タブレットでも約 10 倍軽量に動きます。</p>

<div className="help-footer">
          <span className="help-note">いつでも <kbd>H</kbd> または右上「?」で再表示</span>
          <button className="primary" onClick={() => update({ showHelp: false })}>始める</button>
        </div>
      </div>
    </div>
  )
}
