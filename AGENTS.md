# AGENTS.md — AI 作業者向けガイド

このファイルは、本リポジトリで作業する AI エージェント (Claude / Codex / Cursor 等) のための指南書です。
人間の開発者にも有用。

---

## このプロジェクトは何か

**TOMOSHIBI小屋** は、戯曲図書館 ([https://gikyokutosyokan.com](https://gikyokutosyokan.com)) のサブサービス。
**演劇関係者** が舞台照明を 3D で組み・プレビュー・共有するブラウザツール。
ホスト先: `https://tomoshibi.gikyokutosyokan.com/`

### 想定ユーザ
- 演出家・舞台監督・照明デザイナ
- 劇団員 (アマチュア含む)
- 戯曲図書館で台本を読むユーザの一部
- **教育用途ではない** — 「学習向け」「初学者向け」みたいな機能追加はしない

### 設計の方針
- **TOP は徹底的にシンプル** — 右パネルは「器具」「役者」の2タブのみ
- **詳細設定は ⚙ 設定モーダルに格納** — シーン管理 / 表現 / 高度ツール
- **物理ベース**: 単位は lm (lumens) / cd (candela) / lux ベース
- **モダンUI**: 装飾は引き算。Linear/Figma 系の落ち着いた質感
- **温かみのある色** — 戯曲図書館の文学的なトーンに合わせて焦茶/朱/金茶の差し色
- **モバイル対応** — Bottom Sheet UI、自動 Low 品質

---

## 技術スタック

| カテゴリ | 採用 |
|---|---|
| ビルド | Vite 5 |
| 言語 | TypeScript 5 |
| UI フレームワーク | React 18 |
| 3D | three.js 0.169 + @react-three/fiber 8 + @react-three/drei |
| 状態管理 | zustand 4 |
| ZIP | jszip (GDTF 取込) |
| WebXR | navigator.xr (drei に依存しない自前実装) |
| ホスティング想定 | Cloudflare Pages / Netlify / Vercel |

---

## ディレクトリ構造

```
/
├── index.html              # OGP / PWA / favicon (SVG inline) / Google Fonts
├── vite.config.ts          # base='/', three / r3f を別チャンク
├── package.json
├── tsconfig.json
├── public/
│   ├── manifest.webmanifest   # PWA
│   ├── _headers               # Cloudflare/Netlify ヘッダ (iframe 許可など)
│   └── robots.txt
└── src/
    ├── main.tsx                  # React エントリ
    ├── App.tsx                   # ルート: Canvas + パネル + キーボード + 視点切替
    ├── styles.css                # 全UIのスタイル (CSS変数で和モダンパレット)
    ├── store.ts                  # Zustand: fixtures / performers / settings / selection
    ├── types.ts                  # 共通型 (SetPiece 等)
    │
    ├── lighting/                 # 照明物理・シェーダー
    │   ├── fixtureTypes.ts       # フィクスチャ種別と全プロファイル定義 (機材ライブラリ本体)
    │   ├── shaders.ts            # 共通 GLSL (PBR / 配光 / SDFソフト影 / トーンマップ)
    │   ├── StageMaterial.ts      # ステージ材質: ShaderMaterial 構築
    │   ├── VolumetricMaterial.ts # ボリュメトリック ヘイズ ShaderMaterial
    │   └── BloomMaterial.ts      # マルチパスブルーム
    │
    ├── photometric/              # 測光・色科学
    │   ├── colorScience.ts       # sRGB↔XYZ↔xy / CCT / Duv / CRI 推定
    │   ├── illuminance.ts        # 任意点の lux 計算 (shader と同じ super-Gaussian)
    │   └── iesParser.ts          # IES LM-63 形式パーサ + 配光曲線
    │
    ├── io/                       # 外部入出力
    │   ├── sceneIO.ts            # シーン JSON 保存/読込/URL共有
    │   ├── gdtfParser.ts         # GDTF (.gdtf zip) パーサ
    │   └── dmxBridge.ts          # DMX over WebSerial (Enttec OpenDMX 互換)
    │
    ├── scene/                    # 3Dシーン
    │   ├── Stage.tsx             # 床・壁・プロセニアム・バトン・平台
    │   ├── PerformerMesh.tsx     # 役者の人体メッシュ (8頭身プロポーション)
    │   ├── FixtureMesh.tsx       # フィクスチャ本体の3Dモデル
    │   ├── SelectionGizmo.tsx    # 選択中の TransformControls + ビーム円錐ガイド
    │   ├── PhotometricProbe.tsx  # 測光プローブ (クリックで lux 表示)
    │   ├── SetPieces.tsx         # GLTF 取込セットピース
    │   ├── XRSupport.tsx         # WebXR セッション制御
    │   └── RenderPipeline.tsx    # シーン→Vol→Bloom→Composite 4パス
    │
    └── ui/                       # UIコンポーネント
        ├── ControlPanel.tsx      # 右パネル (器具/役者 のみ)
        ├── SettingsModal.tsx     # ⚙ 設定モーダル (シーン管理 / 表現 / 高度ツール)
        ├── HelpOverlay.tsx       # ヘルプモーダル
        ├── ProPanel.tsx          # 旧 Pro タブ (現在は SettingsModal の Advanced に内包)
        ├── IOPanel.tsx           # 旧 IO タブ (同上)
        └── IESViewer.tsx         # IES 配光曲線 SVG プロット
```

---

## レンダリングパイプライン (重要)

`scene/RenderPipeline.tsx` が中核。**4パス HDR + 品質プリセット連動**:

```
Pass 1: scene → sceneRT (PBR / 影 / バウンス, フル解像度)
Pass 2: volumetric → volRT (ヘイズ散乱, 品質依存解像度 50-100%)
Pass 3: bloom (bright pass → downsample×N → upsample additive)
Pass 4: composite (volRT + bloom, ACES + sRGB)
```

### シェーダーの uniform 同期
- `useFrame` (priority=1) で **三角ループ無し** に r3f のデフォルト描画を置き換える
- すべてのカスタム ShaderMaterial を毎フレーム同期 (fixtures / occluders / settings)
- フィクスチャは `packFixture()` で uniform 用に整形 (`store.ts`)

### 物理モデル
- 配光: **super-Gaussian**: `I(θ) = exp(-(θ/σ)^(2n)) + peak * exp(-(θ/0.3*beam)^2)`
  - `n` が大きいほどフラットトップ (Profile)、小さいほど Gaussian (Fresnel)
  - PAR は楕円配光 (ellipticity > 1)
- 距離減衰: 物理的 `1/d²` + 30m ウィンドウイング
- 影: SDF カプセル + IQ式ソフトシャドウ (品質設定で hard/soft 切替)
- バウンス: ビーム床ヒット点を二次半球光源として近似
- BRDF: Cook-Torrance GGX + Smith マスキング + Schlick Fresnel

### 品質プリセット (`store.ts`)

| | サンプル | 解像度 | 影 | バウンス | DPR上限 |
|---|---|---|---|---|---|
| low | 16 | 50% | hard | × | 1.0 |
| medium | 28 | 75% | soft | ✓ | 1.0 |
| high | 56 | 100% | soft | ✓ | 1.5 |
| ultra | 96 | 100% | soft | ✓ | 2.0 |

UA から自動判定 (`detectInitialQuality`): iPhone/Android Mobile → low、iPad → medium、PC → high。

---

## 状態管理 (`store.ts`)

Zustand store に集約:

- `fixtures: Fixture[]` — フィクスチャ (灯具) 配列
- `performers: Performer[]` — 役者
- `selection: { kind, id, fixtureHandle }` — 選択中
- `hovered` — ホバー (UI ハイライト用)
- `settings: SceneSettings` — 表示設定 / 品質 / モーダル開閉
- `probeMeasurement` — 照度プローブの最新計測結果
- `setPieces` — GLTF 取込済みセットピース

### フィクスチャモデル

```ts
interface Fixture {
  id: string
  name: string
  presetKey: string         // FIXTURE_PROFILES のキー
  position: [number, number, number]
  target: [number, number, number]
  beamAngleDeg: number      // ズーム可変なら可変
  intensity: number         // 0..1.5 (1.5 = DMX 100%相当)
  color: [number, number, number]  // 0..1 RGB
  gelEnabled: boolean       // 在来器具のみ意味あり
  whiteMix: number          // LED 用 W (0..1)
  colorTempK: number        // LED Tunable 用 (現在未使用)
  rotationZDeg: number      // PAR 楕円の向き
  enabled: boolean
}
```

`packFixture(f)` でシェーダー uniform 用に変換 (光源タイプ別の色決定、軸ベクトル、楕円基準軸など)。

---

## ブランド・トーン

### コピーライティング
- **やる**: 「舞台に灯をともす」「光を組む」「劇場の小屋」など演劇人に馴染む言葉
- **やらない**: 「学習」「教育」「初心者向け」「便利」 (このサービスは演劇プロ向け)

### 色
- 背景: `#07060a` (暗幕)
- パネル: `rgba(22, 19, 22, 0.92)`
- 文字: `#f0e8da` (卯の花色)
- アクセント: 朱 `#c8482d` (主要アクション) / 金茶 `#d4af6f` (装飾的)

### フォント
- 見出し (ブランド名のみ): Shippori Mincho / Noto Serif JP
- UI 全般: Noto Sans JP
- 数値: SF Mono / JetBrains Mono (`font-variant-numeric: tabular-nums`)
- セクション見出しは **uppercase + letter-spacing で小文字キャップス風**

### 避けるべきデザイン
- ◆ や ✦ などの和記号を過剰に散らさない (1ヶ所までに留める)
- 機能ごとにタブを増やさない (シンプルさを保つ)
- 単一カラーで原色を多用しない (彩度を落とした和色を)

---

## 開発フロー

### よく使うコマンド
```bash
npm run dev          # localhost:5173
npm run build        # dist/ を生成
npx tsc --noEmit     # 型チェック
```

### 動作確認の注意
- **タブが非アクティブだと requestAnimationFrame が止まる** — Chrome 等でタブが背景の時、3D 描画は停止する (HMR スクリーンショット時は注意)
- HMR が時々シェーダー二重定義エラーを起こすので、シェーダー修正後は dev サーバ再起動推奨

### 型チェック必須
- すべての PR 前に `npx tsc --noEmit` が通る状態にする
- TypeScript strict mode 有効

---

## してほしいこと / してほしくないこと

### ✅ OK
- 既存のコンポーネント構造を踏襲して機能追加
- 物理モデルの精度向上 (例: アネクトロピック specular、IES の完全プロット、Spectral Sensitivity)
- フィクスチャライブラリの拡充 (Soundhouse 取扱機材を追加)
- ムービングライト (pan/tilt) の動的シミュレーション (現状静的)
- パフォーマンス改善 (シェーダーレベル / r3f レベル)
- アクセシビリティ (aria-label / キーボード操作 / コントラスト)

### ❌ NG
- **教育用途を意識した機能追加** (JIS 照度参考表は既に外している。同種の追加はしない)
- 装飾的な和記号 (◆ ✦ ◇ etc) を増やす
- TOP パネルにタブを増やす (詳細は ⚙ 設定モーダルへ)
- 「初心者向け」「やさしい」「学べる」系のコピー
- WebGPU パストレース (将来検討、現状は WebGL2 + ラスタライズ)
- アカウント機能・サインアップ (シーン共有は URL ハッシュで)
- Adsense や追跡広告
- 競合の WYSIWYG / Capture / Realizzer のスクリーンショット転用

### 注意
- **シェーダーを書き換える時は、必ず VolumetricMaterial と StageMaterial 両方の uniform の一貫性を確認** (uExposure / uAmbient / uShadowSteps 等は共通)
- フィクスチャの uniform 構造体は `MAX_FIXTURES = 16` で固定。増やすときは `shaders.ts` も書き換え
- TransformControls (drei) は OrbitControls を自動無効化するが、`makeDefault` 必須

---

## 既知の制約

- WebSerial DMX は **iOS Safari 非対応** (Chrome / Edge for Android のみ)
- WebGL2 がない環境は動作不可
- 16 灯までしか同時表示できない (MAX_FIXTURES の制約)
- 影は SDF カプセル (人物・平台) のみ。任意ジオメトリの影は未対応
- 動的ムービングライト (pan/tilt 時系列アニメ) 未実装
- IES の楕円配光 (PARの正確な水平面分布) は未対応 (super-Gaussian の楕円近似)
- 共有 URL は base64 で長くなる (フィクスチャ数によっては 1〜2KB)

---

## ロードマップ (優先順)

1. **og.png / icon-192/512.png** の実物画像作成
2. **ムービングライト動的シミュレーション** (DMX 入力に応じてリアルタイム pan/tilt)
3. **sACN/Art-Net over WebSocket** — 実卓接続
4. **IES 楕円配光対応** (現状軸対称のみ)
5. **シーン履歴 / Undo-Redo**
6. **コメント機能** (役者ごとに「ここで主役顔ピン」とか書き込める)
7. **WebGPU パストレース** (将来)
8. **共同編集 (CRDT)** (将来)

---

## ライセンス・帰属

戯曲図書館の方針に合わせる。フィクスチャプロファイルは各メーカ公称スペック準拠 (商標は各社所有)。
