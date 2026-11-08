let activeSavedName: string | null = null

export function getActiveSavedProjectName() { return activeSavedName }
export function setActiveSavedProjectName(name: string | null) { activeSavedName = name }
