// 操作説明の動画を録るときだけ、ページに読み込ませる（agent-browser の --init-script）。
// ヘッドレスのブラウザはマウスの矢印を描かないので、偽の矢印と、押したときの波紋と、画面下の説明の帯を出す。
// 説明の帯は window.__cap('文') で変える。空文字で消す
(() => {
  // 本番の API には繋がない。ログインしていない状態として答える（録画の中身を毎回同じにするため）
  const realFetch = window.fetch.bind(window)
  window.fetch = async (input, init) => {
    const url = typeof input === 'string' ? input : input.url
    if (url.startsWith('https://id.gikyokutosyokan.com')) return new Response(null, { status: 204 })
    if (!url.includes('/api/tomoshibi')) return realFetch(input, init)
    const body = url.includes('/session') ? { user: null, proAvailable: true } : { items: [] }
    return new Response(JSON.stringify(body), { status: 200, headers: { 'content-type': 'application/json' } })
  }
  const ready = () => {
    if (document.getElementById('__help-cursor')) return
    const style = document.createElement('style')
    style.textContent = `
      #__help-cursor { position: fixed; left: 0; top: 0; z-index: 2147483647; width: 22px; height: 22px; pointer-events: none;
        transform: translate(-100px, -100px); transition: transform .06s linear; }
      #__help-cursor svg { filter: drop-shadow(0 2px 3px rgba(0,0,0,.6)); }
      .__help-ripple { position: fixed; z-index: 2147483646; width: 34px; height: 34px; margin: -17px 0 0 -17px; border-radius: 50%;
        border: 3px solid #f2c27b; pointer-events: none; animation: __help-ripple .55s ease-out forwards; }
      .__help-ripple.right { border-color: #6cf; }
      @keyframes __help-ripple { from { transform: scale(.3); opacity: 1 } to { transform: scale(1.6); opacity: 0 } }
      #__help-cap { position: fixed; left: 50%; bottom: 96px; z-index: 2147483645; max-width: 86vw; padding: 12px 22px; border-radius: 12px;
        background: rgba(20, 15, 12, .92); border: 1px solid rgba(242, 194, 123, .7); color: #fff4e5; pointer-events: none;
        font: 600 20px/1.5 "Hiragino Sans", "Noto Sans JP", sans-serif; transform: translateX(-50%); box-shadow: 0 10px 30px rgba(0,0,0,.5); }
      #__help-cap:empty { display: none; }
      #__help-cap kbd { display: inline-block; min-width: 1.6em; margin: 0 2px; padding: 0 6px; border-radius: 5px; background: #3a302a;
        border: 1px solid #8a7560; font-size: 17px; font-weight: 600; line-height: 1.5; text-align: center; }`
    document.head.appendChild(style)
    const cursor = document.createElement('div')
    cursor.id = '__help-cursor'
    cursor.innerHTML = '<svg viewBox="0 0 22 22" width="22" height="22"><path d="M3 2l15 9-6.5 1.4L8.4 19z" fill="#fff" stroke="#111" stroke-width="1.4" stroke-linejoin="round"/></svg>'
    document.body.appendChild(cursor)
    const cap = document.createElement('div')
    cap.id = '__help-cap'
    document.body.appendChild(cap)
    window.__cap = (html) => { cap.innerHTML = html || '' }
    const at = (event) => { cursor.style.transform = `translate(${event.clientX - 3}px, ${event.clientY - 2}px)` }
    window.addEventListener('pointermove', at, true)
    window.addEventListener('pointerdown', event => {
      at(event)
      const ripple = document.createElement('div')
      ripple.className = '__help-ripple' + (event.button === 2 ? ' right' : '')
      ripple.style.left = event.clientX + 'px'
      ripple.style.top = event.clientY + 'px'
      document.body.appendChild(ripple)
      setTimeout(() => ripple.remove(), 600)
    }, true)
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', ready)
  else ready()
})()
