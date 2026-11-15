#!/bin/bash
# 操作説明の動画を録るための関数（record.sh から読む）。
# ヘッドレスのブラウザ（agent-browser）を動かし、偽の矢印（overlay.js）が見えるよう、マウスを少しずつ動かす。
# ユーザーの画面やマウスは使わない。

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
AB="${AGENT_BROWSER:-npx -y agent-browser}"
SESSION="${SESSION:-tomoshibi-help}"
BASE_URL="${BASE_URL:-http://localhost:4461}"
MX=720; MY=450

ab() { $AB --session "$SESSION" --init-script "$HERE/overlay.js" "$@" >/dev/null 2>&1; }
abq() { $AB --session "$SESSION" --init-script "$HERE/overlay.js" "$@" 2>/dev/null; }
pause() { ab wait "$1"; }
cap() { ab eval "window.__cap && window.__cap($(printf '%s' "$1" | python3 -c 'import json,sys;print(json.dumps(sys.stdin.read()))')); 1"; }

# 要素の中心の座標を「x y」で返す。$1 は CSS セレクタ、$2 は中の文字（省略可。前方一致）
at() {
  local js
  js=$(python3 - "$1" "${2:-}" <<'PY'
import json, sys
sel, text = sys.argv[1], sys.argv[2]
print("(() => { const list = [...document.querySelectorAll(%s)].filter(e => { const r = e.getBoundingClientRect(); return r.width && r.height && (!%s || e.innerText.trim().startsWith(%s) || e.getAttribute('aria-label')?.startsWith(%s)) }); const e = list[0]; if (!e) return ''; e.scrollIntoView({ block: 'nearest' }); const r = e.getBoundingClientRect(); return Math.round(r.x + r.width / 2) + ' ' + Math.round(r.y + r.height / 2) })()" % (json.dumps(sel), json.dumps(text), json.dumps(text), json.dumps(text)))
PY
)
  abq eval "$js" | tr -d '"'
}

# 矢印を (x, y) まで滑らかに動かす。$3 はボタンを押したままなら任意の文字
glide() {
  local x=$1 y=$2 steps=${3:-18} i nx ny
  for ((i = 1; i <= steps; i++)); do
    nx=$((MX + (x - MX) * i / steps)); ny=$((MY + (y - MY) * i / steps))
    ab mouse move "$nx" "$ny"
    sleep 0.02
  done
  MX=$x; MY=$y
}
click_at() { glide "$1" "$2"; pause 150; ab mouse down; ab mouse up; pause 250; }
right_at() { glide "$1" "$2"; pause 150; ab mouse down right; ab mouse up right; pause 350; }
drag_to() { glide "$1" "$2"; pause 150; ab mouse down; pause 120; glide "$3" "$4" 26; pause 150; ab mouse up; pause 300; }
# 要素を押す（$1 セレクタ、$2 文字）
click_el() { local p; p=$(at "$1" "${2:-}"); [ -n "$p" ] || { echo "見つからない: $1 $2" >&2; return 1; }; click_at $p; }
key() { ab press "$1"; pause 250; }

# 毎回まっさらな状態から始める（前の動画の操作が残らないように）
fresh() {
  ab set viewport 1440 900
  ab open "$BASE_URL/studio/"
  ab eval 'localStorage.clear(); sessionStorage.clear(); 1'
  ab open "$BASE_URL/studio/"
  pause 3500
  # 初めての人向けの案内を閉じる
  ab eval "localStorage.setItem('tomoshibi.helpSeen', '1'); 1"
  ab eval "document.querySelector('[aria-label=\"ヘルプを閉じる\"], .help-overlay button')?.click(); 1"
  pause 400
}
start() { ab record start "$1"; pause 400; }
stop() { cap ''; pause 300; ab record stop; }
