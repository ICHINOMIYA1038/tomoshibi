export function workspaceBasePath(): '/mock' | '/studio' {
  return typeof location !== 'undefined' &&
    (location.pathname === '/studio' || location.pathname.startsWith('/studio/')) ? '/studio' : '/mock'
}

export function isWorkspacePath(): boolean {
  return typeof location !== 'undefined' &&
    (location.protocol === 'file:' || ['/mock', '/studio'].some(base =>
      location.pathname === base || location.pathname.startsWith(`${base}/`)))
}

export function isWorkspaceLibraryPath(): boolean {
  return typeof location !== 'undefined' && ['/mock', '/studio'].some(base =>
    location.pathname === `${base}/projects` || location.pathname.startsWith(`${base}/projects/`))
}
