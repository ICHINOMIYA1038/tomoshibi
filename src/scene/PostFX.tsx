// 高度モード用ポストエフェクト (準備中)
//
// @react-three/postprocessing v2 + react-three/fiber v8 + three r169 で
// 描画結果が真っ黒になる互換性問題に当面ぶつかったため、
// 一旦 no-op としている。
// 後で UnrealBloomPass を自前で組むか、互換版に切り替えて対応する。
export function PostFX() {
  return null
}
