import { createRequire } from 'module'
const sharp = createRequire('/Users/ichinomiya/private/tomoshibi/package.json')('sharp')
const M='/Users/ichinomiya/private/mobile/apps/', G='/Users/ichinomiya/private/mobile-gekipon-feed/apps/'
const ios=a=>`${a}/ios/Runner/Assets.xcassets/AppIcon.appiconset/Icon-App-1024x1024@1x.png`
const mask=s=>Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${s}" height="${s}"><rect width="${s}" height="${s}" rx="${s*.225}"/></svg>`)
const tile=async(src,s)=>sharp(await sharp(src).resize(s,s).png().toBuffer()).composite([{input:mask(s),blend:'dest-in'}]).png().toBuffer()
const txt=(t,w,h,size,fill='#222',fam='Hiragino Sans',weight=400)=>Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}"><text x="0" y="${h*.75}" font-family="${fam}" font-weight="${weight}" font-size="${size}" fill="${fill}">${t}</text></svg>`)
const P=[]
P.push({input:txt('TOMOSHIBI のアイコン一式（提灯）',900,40,26,'#111','Hiragino Sans',700),left:40,top:24})
P.push({input:await tile('app-icon-1024.png',300),left:40,top:84})
P.push({input:txt('アプリ（App Store・ホーム画面）',320,30,16),left:40,top:392})
// ホーム画面 60px
const row=['app-icon-1024.png',ios(G+'theater_log'),ios(G+'gikyoku_library'),ios(M+'etude_generator'),ios(M+'neta_gacha'),ios(M+'doremi_scan')]
const home=[]; for (const [i,f] of row.entries()) home.push({input:await tile(f,60),left:24+i*84,top:24})
P.push({input:await sharp({create:{width:530,height:110,channels:3,background:'#3a4a5c'}}).composite(home).png().toBuffer(),left:380,top:84})
P.push({input:txt('ホーム画面の実寸 60px（左端）',400,30,16),left:380,top:198})
// タブ（明るい・暗い）
for (const [j,bg,fg] of [[0,'#eceef1','#222'],[1,'#202124','#eee']]) {
  const t=await sharp({create:{width:250,height:40,channels:3,background:bg}}).composite([{input:await sharp('favicon-1024.png').resize(16,16).png().toBuffer(),left:12,top:12},{input:txt('TOMOSHIBI小屋',200,40,14,fg),left:36,top:0}]).png().toBuffer()
  P.push({input:t,left:380+j*270,top:240})
}
P.push({input:await sharp('favicon-1024.png').resize(32,32).png().toBuffer(),left:380,top:296})
P.push({input:txt('ブラウザのタブ 16px／32px',400,30,16),left:430,top:296})
// サイトの帯（ヘッダー）
const hdr=await sharp({create:{width:530,height:64,channels:3,background:'#0E0B12'}}).composite([{input:await sharp('tomoshibi-symbol-dark.svg',{density:300}).resize(34,34).png().toBuffer(),left:20,top:15},{input:txt('TOMOSHIBI<tspan fill="#d4af6f" font-size="15">小屋</tspan>',300,64,22,'#F3E9D8','Shippori Mincho, Hiragino Mincho ProN',700),left:62,top:2}]).png().toBuffer()
P.push({input:hdr,left:380,top:346})
const hdr2=await sharp({create:{width:530,height:64,channels:3,background:'#fbfaf5'}}).composite([{input:await sharp('tomoshibi-symbol-light.svg',{density:300}).resize(34,34).png().toBuffer(),left:20,top:15},{input:txt('TOMOSHIBI<tspan fill="#9a7a3c" font-size="15">小屋</tspan>',300,64,22,'#161616','Shippori Mincho, Hiragino Mincho ProN',700),left:62,top:2}]).png().toBuffer()
P.push({input:hdr2,left:380,top:416})
P.push({input:txt('サイトの帯（暗い地・明るい地）',400,30,16),left:380,top:484})
// ファイル
P.push({input:await sharp('file-icon-1024.png').resize(140,140).png().toBuffer(),left:40,top:440})
P.push({input:await sharp('file-icon-1024.png').resize(48,48).png().toBuffer(),left:200,top:532})
P.push({input:txt('.tomoshibi のファイル',300,30,16),left:40,top:588})
await sharp({create:{width:950,height:640,channels:3,background:'#f2efe9'}}).composite(P).png().toFile('review.png')
