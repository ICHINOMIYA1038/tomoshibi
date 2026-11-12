export function hasDeviceStorage(): boolean {
  const webkit = (window as unknown as { webkit?: { messageHandlers?: Record<string, unknown> } }).webkit
  return Boolean(webkit?.messageHandlers?.TomoshibiSession)
}

export function workspaceStorage(): Storage {
  return hasDeviceStorage() ? localStorage : sessionStorage
}
