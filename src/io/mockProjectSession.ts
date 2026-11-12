let activeSavedName: string | null = null
let activeCloudProject: { id: string; name: string; revision: number } | null = null

export function getActiveSavedProjectName() { return activeSavedName }
export function setActiveSavedProjectName(name: string | null) { activeSavedName = name }
export function getActiveCloudProject() { return activeCloudProject }
export function setActiveCloudProject(project: typeof activeCloudProject) { activeCloudProject = project }
