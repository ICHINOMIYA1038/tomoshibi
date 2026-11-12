import { useStore } from '../store'

type State = ReturnType<typeof useStore.getState>
let editorState: State | null = null

// フェード途中の描画状態を、保存データや編集履歴に混ぜない。
export function getEditableState(): State { return editorState ?? useStore.getState() }
export function isPlaybackPreview(): boolean { return editorState !== null }

export function beginPlaybackPreview() {
  const original = useStore.getState()
  editorState = original
  return () => {
    if (editorState !== original) return
    useStore.setState(state => ({
      fixtures: original.fixtures,
      performers: original.performers,
      setPieces: original.setPieces,
      productionPlan: original.productionPlan,
      settings: { ...original.settings, cameraView: state.settings.cameraView },
      selection: original.selection,
    }))
    editorState = null
  }
}

export function cancelPlaybackPreview() {
  if (!editorState) return
  editorState = null
  window.dispatchEvent(new Event('tomoshibi-end-preview'))
}
