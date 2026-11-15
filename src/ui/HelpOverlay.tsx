import { useStore } from '../store'

export function HelpOverlay() {
  const show = useStore(s => s.settings.showHelp)
  const update = useStore(s => s.updateSettings)
  const close = () => {
    try { localStorage.setItem('tomoshibi.helpSeen', '1') } catch { /* noop */ }
    update({ showHelp: false })
  }
  if (!show) return null
  return (
    <div className="help-overlay" onClick={close}>
      <div className="help-card" onClick={e => e.stopPropagation()}>
        <button className="help-close" onClick={close}>×</button>
        <h1>TOMOSHIBI<span style={{ fontFamily: 'var(--font-serif)', marginLeft: 2 }}>小屋</span></h1>
        <p className="subtitle">舞台に灯をともす、ちいさな小屋 — 3D で組む・見る・残す</p>

        <h2>はじめに</h2>
        <p>操作パネル (PCは画面右 / スマホは右下の「追加・編集」) の <b>＋ 追加</b> で、照明・役者・舞台セット・舞台の部品・客席を足します。上の一覧（ヒエラルキー）で選び、下の欄で設定します。動かすときは、画面上の道具で <b>移動・回転・拡大</b> を選びます。</p>

        <div className="help-pc-only">
          <h2>カメラ操作 (PC)</h2>
          <div className="help-grid">
            <div><kbd>左ドラッグ</kbd></div><div>回転</div>
            <div><kbd>ホイール</kbd></div><div>ズーム</div>
            <div><kbd>右ドラッグ</kbd></div><div>パン</div>
            <div><kbd>右ボタン</kbd>＋<kbd>W</kbd><kbd>A</kbd><kbd>S</kbd><kbd>D</kbd></div><div>カメラを前後左右へ（右ボタンを押している間）</div>
            <div><kbd>右ボタン</kbd>＋<kbd>Q</kbd> <kbd>E</kbd></div><div>カメラを上下へ</div>
            <div><kbd>矢印キー</kbd></div><div>カメラを前後左右へ</div>
            <div><kbd>1</kbd>〜<kbd>4</kbd></div><div>視点切替 (客席 / 俯瞰 / 袖 / 自由)</div>
          </div>
        </div>

        <h2>カメラ操作 (スマホ / タブレット)</h2>
        <div className="help-grid">
          <div><kbd>1本指ドラッグ</kbd></div><div>回転</div>
          <div><kbd>2本指ピンチ</kbd></div><div>ズーム</div>
          <div><kbd>2本指ドラッグ</kbd></div><div>パン</div>
          <div><kbd>タップ</kbd></div><div>選んで、3D の矢印で動かす（道具が「移動」のとき）</div>
        </div>

        <p className="help-note">操作は<a href="/help" target="_blank" rel="noopener">操作説明</a>の短い動画でも見られます。</p>

        <h2>物の操作（Unity と同じ）</h2>
        <div className="help-grid">
          <div><kbd>クリック</kbd></div><div>選ぶ</div>
          <div><kbd>Q</kbd> <kbd>W</kbd> <kbd>E</kbd> <kbd>R</kbd></div><div>道具を 選択・移動・回転・拡大 に切り替え（3D と平面図で共通）</div>
          <div><kbd>⌘D</kbd> / <kbd>Ctrl+D</kbd></div><div>複製</div>
          <div><kbd>Delete</kbd></div><div>削除（⌘Z で戻せる）</div>
          <div><kbd>一覧のドラッグ</kbd></div><div>行を別の行に重ねると、その子になる（親を動かすと子も動く）</div>
          <div><kbd>Esc</kbd></div><div>選択を外す</div>
        </div>

        <h2>シーンの保存と共有</h2>
        <p>右上 <b>⚙ 設定</b> → <b>シーン管理</b> から、明かりプランを名前を付けて保存・読込できます。<b>共有URL</b> を生成すれば URL を渡すだけで同じシーンが開けます。</p>

        <h2>動作が重い時</h2>
        <p><b>⚙ 設定 → 表現 → 描画品質</b> を <b>Low</b> に。古いPC・タブレットでも約 10 倍軽量に動きます。</p>

<div className="help-footer">
          <span className="help-note">いつでも <kbd>H</kbd> または右上「?」で再表示</span>
          <button className="primary" onClick={close}>始める</button>
        </div>
      </div>
    </div>
  )
}
