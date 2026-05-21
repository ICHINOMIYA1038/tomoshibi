# TOMOSHIBI小屋 (ともしびごや)

> 舞台に灯をともす、ちいさな小屋 — 物理ベースのブラウザ舞台照明シミュレーター

**戯曲図書館 (gikyokutosyokan.com) のサブサービス** として `tomoshibi.gikyokutosyokan.com` での運用を想定。演劇関係者が舞台照明を 3D でデザイン・プレビュー・共有するためのツール。

---

## できること

- **物理ベースの舞台照明描画** — Cook-Torrance GGX PBR、物理的逆二乗減衰、IQ式ソフトシャドウ、一次バウンス光
- **ボリュメトリックヘイズ** — Henyey-Greenstein 散乱、スモーク中のビーム可視化
- **マルチパス ブルーム** — 5階層 dual-filter
- **収録機材**: 在来 (PAR/Fresnel/PC/Source Four) + サウンドハウス取扱の LED (Stairville / Chauvet / ADJ / ETC / Robe)
- **3D ドラッグ操作** — フィクスチャ・役者の位置/狙いを矢印ハンドルで掴んで移動
- **シーン保存/読込/URL共有** — localStorage + URL ハッシュエクスポート
- **モバイル対応** — Bottom Sheet UI、タッチ操作、自動 Low 品質
- **Pro機能**: 照度プローブ (lux/cd/lm/fc)、CIE色科学 (CCT/Duv/CRI推定)、IES/GDTF/GLTF 取込、DMX 出力 (WebSerial / Enttec OpenDMX)
- **WebXR** — VR ヘッドセットで没入プレビュー (Quest 等)

## クイックスタート

```bash
npm install
npm run dev              # http://127.0.0.1:5173/
npm run build            # 本番ビルド → dist/
npm run preview          # ビルド済みをローカル確認
```

## 配信

`tomoshibi.gikyokutosyokan.com` (サブドメイン) で配信する想定。
Cloudflare Pages / Netlify / Vercel のいずれでも動作。

- ビルドコマンド: `npm run build`
- 出力ディレクトリ: `dist`
- `public/_headers` にて親サイト `gikyokutosyokan.com` からの iframe 埋込を許可済み

### 親サイトからの iframe 埋込み

```html
<iframe
  src="https://tomoshibi.gikyokutosyokan.com/?embed=1"
  width="100%"
  height="720"
  style="border:1px solid #2a2520;border-radius:8px;"
  allow="serial; usb; xr-spatial-tracking; fullscreen"
  loading="lazy"
></iframe>
```

`?embed=1` でブランドストリップ・キーヒントが非表示になる。

## 操作

| 操作 | 内容 |
|---|---|
| 左ドラッグ / 1本指 | カメラ回転 |
| ホイール / 2本指ピンチ | ズーム |
| 右ドラッグ / 2本指ドラッグ | パン |
| W/A/S/D | カメラ位置を前後左右 |
| Q/E | カメラ位置を上下 |
| 1〜4 | 視点切替 (客席/俯瞰/袖/自由) |
| クリック | 器具・役者を選択 |
| Esc | 選択解除 |
| Del/⌫ | 選択中を削除 |
| ⌘+D | 複製 |
| H / ? | ヘルプ |
| P | 照度プローブ ON/OFF |

## ライセンス

[未定 — 戯曲図書館の運営方針に合わせる]

## 関連リンク

- 本家: [https://gikyokutosyokan.com/](https://gikyokutosyokan.com/)
- リポジトリ: [https://github.com/ICHINOMIYA1038/tomoshibi](https://github.com/ICHINOMIYA1038/tomoshibi)

---

## AI エージェント向け

このコードベースで作業する AI / LLM は、まず [AGENTS.md](./AGENTS.md) を読んでください。プロジェクトの構造・物理モデル・命名規則・避けるべきパターンが整理されています。
