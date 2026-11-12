let editor: { projectId: string; editorId: string } | null = null
export function setProjectEditorIdentity(value: typeof editor) { editor = value }
export function getProjectEditorIdentity(projectId: string) { return editor?.projectId === projectId ? editor.editorId : null }
