import math
f=lambda v: f"{v:.1f}".rstrip('0').rstrip('.')
INK="#0E0B12"; CREAM="#F3E9D8"; GOLD="#F2B544"; GOLD_D="#C98A12"
ex,ey,R=118,128,92          # 胴の中心は少し左に置き、ずれた段を含めて光学的に中央へ
hw=lambda y: R*math.sqrt(max(0,1-((y-ey)/R)**2))
def strip(y1,y2,dx=0):
    a,b=hw(y1),hw(y2)
    return f"M{f(ex-a+dx)} {f(y1)} H{f(ex+a+dx)} A{R} {R} 0 0 1 {f(ex+b+dx)} {f(y2)} H{f(ex-b+dx)} A{R} {R} 0 0 1 {f(ex-a+dx)} {f(y1)} Z "
top,bot=ey-R,ey+R
def lantern(cuts,gap,lit,shift,cap_w,cap_h):
    bands=[(cuts[i]+(gap/2 if i else 0),cuts[i+1]-(gap/2 if i<len(cuts)-2 else 0)) for i in range(len(cuts)-1)]
    body=f"M{f(ex-cap_w/2)} {f(top-6-cap_h)} H{f(ex+cap_w/2)} V{f(top-6)} H{f(ex-cap_w/2)} Z M{f(ex-cap_w/2)} {f(bot+6)} H{f(ex+cap_w/2)} V{f(bot+6+cap_h)} H{f(ex-cap_w/2)} Z "
    acc=""
    for i,(y1,y2) in enumerate(bands):
        if i==lit: acc=strip(y1,y2,shift)
        else: body+=strip(y1,y2)
    return body,acc
def svg(body,acc,c1,c2,title="TOMOSHIBI"):
    return f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 256 256" width="256" height="256"><title>{title}</title><path fill="{c1}" d="{body}"/><path fill="{c2}" d="{acc}"/></svg>'
# 本番の形：5 段、真ん中の段が右へずれて灯る
B=lantern([top+.01,top+40,top+76,top+108,top+140,bot-.01],12,2,22,56,18)
# 小さい形（16〜32px）：3 段、隙間を太く
S=lantern([top+.01,top+64,top+120,bot-.01],22,1,20,64,18)
open("tomoshibi-symbol-dark.svg","w").write(svg(*B,CREAM,GOLD))     # 暗い地の上
open("tomoshibi-symbol-light.svg","w").write(svg(*B,INK,GOLD_D))    # 明るい地の上
open("tomoshibi-symbol-small.svg","w").write(svg(*S,CREAM,GOLD))
open("tomoshibi-symbol-small-light.svg","w").write(svg(*S,INK,GOLD_D))

# ---- 書き出し：アプリのアイコン、favicon、ファイルのアイコン
def inner(body,acc,c1,c2): return f'<path fill="{c1}" d="{body}"/><path fill="{c2}" d="{acc}"/>'
def tile(body,acc,size,scale,rx=0,dy=0):
    off=(256-256*scale)/2
    return (f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 256 256" width="{size}" height="{size}">'
            f'<rect width="256" height="256" rx="{rx}" fill="{INK}"/>'
            f'<g transform="translate({f(off)} {f(off+dy)}) scale({scale})">{inner(body,acc,CREAM,GOLD)}</g></svg>')
open("app-icon.svg","w").write(tile(*B,1024,0.70,0,-2))           # iOS / App Store（角は iOS が丸める）
open("favicon.svg","w").write(tile(*S,64,0.80,56))                # ブラウザのタブ（小さい形・角丸の地）
# .tomoshibi のファイル：紙（生成り）に、折り返した角。中に墨の提灯
paper=f'M40 8 H172 L224 60 V240 Q224 248 216 248 H40 Q32 248 32 240 V16 Q32 8 40 8 Z'
fold='M172 8 V52 Q172 60 180 60 H224 Z'
open("file-icon.svg","w").write(
    f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 256 256" width="1024" height="1024">'
    f'<path fill="{CREAM}" stroke="#CDBFA5" stroke-width="3" d="{paper}"/><path fill="#D8CBB3" d="{fold}"/>'
    f'<g transform="translate(58 70) scale(0.56)">{inner(*B,INK,GOLD_D)}</g></svg>')
