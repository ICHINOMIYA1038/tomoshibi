import { Component, type ReactNode } from 'react'

type Props = { children: ReactNode }
type State = { hasError: boolean; message?: string }

export class WebGLErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false }

  static getDerivedStateFromError(err: unknown): State {
    const message = err instanceof Error ? err.message : String(err)
    return { hasError: true, message }
  }

  componentDidCatch(err: unknown) {
    console.error('[WebGLErrorBoundary]', err)
  }

  render() {
    if (!this.state.hasError) return this.props.children
    return (
      <div className="webgl-fallback">
        <div className="webgl-fallback-inner">
          <h1>3D シーンを表示できません</h1>
          <p>
            お使いのブラウザで <strong>WebGL</strong> が無効になっているようです。
            TOMOSHIBI小屋は WebGL を必須とする舞台照明シミュレーターです。
          </p>
          <ol>
            <li>Chrome の場合: 設定 &gt; システム &gt; 「ハードウェア アクセラレーションを使用する」を <strong>ON</strong> にして再起動</li>
            <li>それでも直らない場合は <code>chrome://gpu</code> を開き、<em>WebGL: Hardware accelerated</em> になっているか確認</li>
            <li>別のブラウザ (Safari / Firefox / Edge) で開いても同じか確認</li>
          </ol>
          {this.state.message && (
            <details>
              <summary>エラー詳細</summary>
              <pre>{this.state.message}</pre>
            </details>
          )}
          <p className="webgl-fallback-foot">
            <a href="https://gikyokutosyokan.com">戯曲図書館に戻る</a>
          </p>
        </div>
      </div>
    )
  }
}
