#!/bin/bash
# 操作説明（/help）の短い動画を、ヘッドレスのブラウザで録る。
#   npm run build && npx vite preview --port 4461 --strictPort   （別の端末で）
#   bash scripts/help-videos/record.sh            → すべて録る
#   bash scripts/help-videos/record.sh 03         → 03 だけ録り直す
#   node scripts/help-videos/publish.mjs          → public/help-media/ にウェブ用の mp4・表紙・videos.json を作る
# 録った webm は scripts/help-videos/out/（git には入れない）に置く。
# agent-browser は npx で毎回起こすと 1 操作ごとに遅れ、動画が 10 倍近く長くなる。入っている本体を AGENT_BROWSER で渡す:
#   AGENT_BROWSER=$(ls -d ~/.npm/_npx/*/node_modules/.bin/agent-browser | head -1) bash scripts/help-videos/record.sh
set -u
. "$(dirname "$0")/lib.sh"
OUT="$HERE/out"
mkdir -p "$OUT"

# ---- 01 道具を切り替える ----
scene_01() {
  fresh; start "$OUT/01.webm"
  cap '画面の上の「道具」で、物の動かし方を選びます'
  pause 900
  for tool in 選択 移動 回転 拡大; do click_el '.toolbar .tool-buttons button' "$tool"; pause 350; done
  cap 'キーでも切り替えられます：<kbd>Q</kbd> 選択・<kbd>W</kbd> 移動・<kbd>E</kbd> 回転・<kbd>R</kbd> 拡大'
  for k in q w e r; do key "$k"; pause 350; done
  click_el '.toolbar .tool-buttons button' '移動'
  cap '「移動」のときは、平面図で役者をドラッグして動かせます'
  local p; p=$(at '[data-menu-kind="performer"]')
  set -- $p; drag_to "$1" "$2" $(($1 + 90)) $(($2 - 40))
  pause 600
  cap '「選択」のときは、押しても動きません。選ぶだけです'
  click_el '.plan-map-caption .tool-buttons button' '選択'
  p=$(at '[data-menu-kind="performer"]'); set -- $p
  drag_to "$1" "$2" $(($1 - 90)) $(($2 + 40))
  pause 1200
  stop
}

# ---- 02 一覧（ヒエラルキー）で選ぶ・足す・親子にする ----
scene_02() {
  fresh; start "$OUT/02.webm"
  cap '右の一覧（ヒエラルキー）に、舞台にある物がすべて並びます'
  pause 1200
  click_el '.hierarchy-name' '宴の卓'
  cap '行を押すと選べます。設定は一覧の下に出ます'
  pause 1600
  cap '「＋ 追加」の絵を押すと足せます。3D の画面へドラッグすると、落とした所に置けます'
  click_el '.hierarchy-add-button'
  pause 700
  click_el '.add-tile' '役者'
  pause 900
  cap '「親」を選ぶと、その物の子になります'
  local p; p=$(at '.inspector select'); set -- $p; glide "$1" "$2"; pause 300
  ab eval "(() => { const s = [...document.querySelectorAll('.inspector select')][0]; const o = [...s.options].find(o => o.text.startsWith('宴の卓')); const set = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value').set; set.call(s, o.value); s.dispatchEvent(new Event('change', { bubbles: true })); return 1 })()"
  pause 1200
  cap '親の卓を動かすと、子の役者も一緒に動きます'
  p=$(at '[data-menu-kind="setpiece"]' '宴の卓'); [ -n "$p" ] || p=$(at '[data-menu-kind="setpiece"]'); set -- $p
  drag_to "$1" "$2" $(($1 - 60)) $(($2 + 50))
  pause 1500
  stop
}

# ---- 03 右クリックのメニュー ----
scene_03() {
  fresh; start "$OUT/03.webm"
  cap '3D の画面で物を右クリックすると、その物の操作が出ます'
  local c; c=$(abq eval '(() => { const r = document.querySelector(".canvas-wrap canvas").getBoundingClientRect(); return Math.round(r.x + r.width / 2) + " " + Math.round(r.y + r.height * .68) })()' | tr -d '"')
  set -- $c; right_at "$1" "$2"
  pause 2200
  key Escape
  cap '床を右クリックすると、押した場所に役者や照明を足せます'
  right_at $(($1 + 170)) $(($2 + 70))
  pause 1200
  click_el '.object-menu button' 'ここに役者を足す'
  pause 1300
  cap '一覧（ヒエラルキー）や平面図でも、同じメニューが出ます'
  c=$(at '.hierarchy-name' 'ピン・特別'); set -- $c; right_at "$1" "$2"
  pause 1000
  click_el '.object-menu-sub > button' '親を変える'
  pause 1800
  key Escape
  stop
}

# ---- 04 舞台と客席を平面図で動かす（全シーン共通の物） ----
scene_04() {
  fresh; start "$OUT/04.webm"
  cap '平面図では、舞台・壁・バトン・客席も、そのままドラッグで動かせます'
  pause 900
  click_el '.hierarchy-add-button'
  pause 600
  click_el '.add-tile' '客席'
  pause 700
  # 足した客席は舞台の前の遠くに置かれ、平面図の外になるので、縮めて見えるようにする
  click_el '.plan-map-zoom button[aria-label="縮小"]'
  pause 300
  click_el '.plan-map-zoom button[aria-label="縮小"]'
  pause 700
  cap '客席は全シーン共通です。動かすと、すべてのシーンで変わります'
  local p; p=$(at '.plan-map-scroll [data-menu-kind="audience"]'); set -- $p
  drag_to "$1" "$2" $(($1 + 40)) $(($2 - 20))
  pause 700
  cap '「回転」の道具にすると、ドラッグで回せます（5° ごと）'
  click_el '.plan-map-caption .tool-buttons button' '回転'
  pause 500
  p=$(at '.plan-map-scroll [data-menu-kind="audience"]'); set -- $p
  drag_to $(($1 + 60)) "$2" $(($1 + 45)) $(($2 + 45))
  pause 1200
  click_el '.plan-map-caption .tool-buttons button' '移動'
  pause 600
  stop
}

# ---- 05 照明の狙いを動かす ----
scene_05() {
  fresh; start "$OUT/05.webm"
  cap '照明を選ぶと、右の設定に「3D でつかむ点」が出ます'
  click_el '.hierarchy-name' 'ピン・特別'
  pause 900
  local p; p=$(at '.inspector-choice[aria-label="3D でつかむ点"] button' '狙い'); set -- $p; glide "$1" "$2"
  cap '「照明」は本体を、「狙い」は光が当たる点を動かします'
  pause 700
  click_at "$1" "$2"
  pause 900
  cap '平面図では、色の輪をドラッグすると狙いが動きます'
  p=$(at '.plan-aim-handle'); set -- $p
  drag_to "$1" "$2" $(($1 - 80)) $(($2 - 30))
  pause 1600
  stop
}

# ---- 06 シーンを組み立てる ----
scene_06() {
  fresh; start "$OUT/06.webm"
  cap '左の「公演の流れ」で、章とシーンを組み立てます'
  pause 1200
  click_el '.plan-outline-node.scene .plan-outline-node-edit'
  pause 600
  click_el '.plan-context-menu button' 'この後にシーンを追加'
  pause 900
  cap 'シーンごとに、役者の位置や照明を変えられます'
  local p; p=$(at '[data-menu-kind="performer"]'); set -- $p
  drag_to "$1" "$2" $(($1 + 100)) $(($2 - 30))
  pause 700
  cap '左の <kbd>⠿</kbd> をドラッグすると、シーンを並べ替えられます'
  local a b; a=$(at '.plan-outline-node.scene .plan-scene-grip' '' ); b=$(abq eval '(() => { const g = [...document.querySelectorAll(".plan-outline-node.scene .plan-scene-grip")]; const e = g[g.length - 1]; const r = e.getBoundingClientRect(); return Math.round(r.x + r.width / 2) + " " + Math.round(r.y + r.height / 2) })()' | tr -d '"')
  set -- $b $a
  drag_to "$1" "$2" "$3" $(($4 - 22))
  pause 900
  cap '「▶ 通しで見る」で、シーンを順に再生します'
  click_el 'button' '▶ 通しで見る'
  pause 3500
  stop
}

# ---- 07 ほかのシーンにも反映する ----
scene_07() {
  fresh
  # 反映する先が要るので、撮る前にシーンを 1 つ足しておく
  click_el '.plan-outline-node.scene .plan-outline-node-edit'
  pause 500
  click_el '.plan-context-menu button' 'この後にシーンを追加'
  pause 900
  start "$OUT/07.webm"
  cap '変えた物は、まずいまのシーンだけに入ります'
  pause 900
  local p; p=$(at '.plan-map-scroll [data-menu-kind="performer"]'); set -- $p
  drag_to "$1" "$2" $(($1 + 80)) $(($2 - 20))
  pause 900
  cap '下に出る帯で「この章」「このあと」「全シーン」にも同じ変更を入れられます'
  pause 1600
  click_el '.change-scope-bar button' '全シーン'
  pause 1800
  cap '押さなければ、このシーンだけの変更のままです'
  pause 1500
  stop
}

# ---- 08 3D と平面図を切り替える ----
scene_08() {
  fresh; start "$OUT/08.webm"
  cap '左上で「3D・平面図・上下・左右」を切り替えます'
  pause 900
  click_el '.desk-view-switch button' '平面図'
  pause 1300
  cap '平面図だけを大きく出せます。見た目は「仕込み図」と「明かり」から選べます'
  click_el '.plan-style-switch button' '明かり'
  pause 1800
  click_el '.plan-style-switch button' '仕込み図'
  pause 1200
  cap '「画像で保存」で、そのまま配れる図になります'
  local p; p=$(at '.plan-save-image'); set -- $p; glide "$1" "$2"
  pause 1500
  cap '「上下」「左右」で、3D と平面図を並べて見られます'
  click_el '.desk-view-switch button' '上下'
  pause 1500
  click_el '.desk-view-switch button' '左右'
  pause 1800
  stop
}

ALL="01 02 03 04 05 06 07 08"
for id in ${@:-$ALL}; do
  echo "録画: $id"
  "scene_$id"
done
