# 舞台形状と客席配置のサンプル（2026-11-09）

額縁、円形、張り出し、自由形状の 4 種類について、客席・役者・舞台セット・照明を備えたプランを試作した。各プランには 3 場面があり、役者の位置と照明の明るさが変わる。プロジェクト一覧の「会場配置のサンプル」から開ける。

実在の劇場は**舞台と客席の関係の参考**にした。サンプルの寸法、席数、装置、照明位置、物語は独自の仮設定であり、各劇場の再現図ではない。

| サンプル | 参考にした舞台 | 試作した配置 |
| --- | --- | --- |
| 手紙の幕｜額縁舞台 | [National Theatre Lyttelton の客席写真](https://images.nationaltheatre.org.uk/uploads/2025/01/The-Importance-of-Being-Earnest-Visual-Story.pdf)と[Theatres Trust の額縁舞台の解説](https://www.theatrestrust.org.uk/discover-theatres/theatre-faqs/170-what-are-the-types-of-theatre-stages-and-auditoria) | 幅 14 m、奥行 10 m。正面に 192 席。机と奥の扉を使う。 |
| 広場の時計｜円形舞台 | [The Old Vic の円形舞台](https://www.oldvictheatre.com/news/the-old-vic-in-the-round/) | 直径 12 m。四方に 270 席。客席からの視線を遮りにくい低い台座を中央に置く。 |
| 渡り橋｜張り出し舞台 | [RSC Swan Theatre](https://www.rsc.org.uk/your-visit/swan-theatre) | 幅 14 m、奥行 12 m。正面と左右に 182 席。張り出した先端と舞台奥を分けて照らす。 |
| 折れた庭｜自由配置 | [RSC The Other Place の小劇場の沿革](https://www.rsc.org.uk/your-visit/the-other-place/the-history-of-the-other-place)と[Theatres Trust のスタジオ劇場の解説](https://www.theatrestrust.org.uk/discover-theatres/theatre-faqs/170-what-are-the-types-of-theatre-stages-and-auditoria) | 七角形の舞台。正面と下手側に 94 席。ベンチ、石、門を置く。 |

## 試して見つけた問題と修正

- 円形舞台の北側客席が会場編集の初期表示で切れていた。後方にも客席がある場合は、四方が収まる表示倍率に切り替えるようにした。
- プロジェクト一覧のプレビューが長方形の舞台を固定で描いていた。保存した舞台の輪郭と客席を表示するようにした。
- サンプルを繰り返し開くと、未変更のプランが別名で増えた。未変更のサンプルは複製せず、編集済みのプランだけ退避するようにした。
- 客席全体の視点では舞台が小さく、場面の確認に向かなかった。サンプルは客席からの舞台視点で開き、客席全体の確認は視点切り替えで行えるようにした。
- 円形舞台の中央の台座が人物を隠しやすかった。高さを 1.5 m から 0.75 m に下げた。

## 確認範囲と残る課題

4 プランの全 12 場面について、ブラウザで場面切り替えと 3D 表示を確認した。「会場の配置」では 4 プランとも目標席数と配置席数が一致し、座席と舞台の重なりや装置のはみ出しの警告は出なかった。座席は平面上の配置であり、段床、通路幅、避難経路、各席からの見切れはまだ判定できない。表示される席数は会場の法定定員を示さない。
