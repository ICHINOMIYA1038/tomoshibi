// WebXR (VR/AR) サポート
// - VR ヘッドセット接続時にボタン表示
// - immersive-vr セッション開始/終了

import { useEffect, useState } from 'react'
import { useThree } from '@react-three/fiber'

export function XRButton() {
  const [supported, setSupported] = useState(false)
  const [inSession, setInSession] = useState(false)
  useEffect(() => {
    const xr = (navigator as any).xr
    if (!xr?.isSessionSupported) return
    xr.isSessionSupported('immersive-vr').then(setSupported).catch(() => setSupported(false))
  }, [])
  if (!supported) return null
  return (
    <button
      className="xr-button"
      onClick={() => enterVR(setInSession)}
    >
      {inSession ? 'VR 終了' : 'VR モード'}
    </button>
  )
}

let activeSession: XRSession | null = null
let glRef: { current: any } | null = null

async function enterVR(setInSession: (b: boolean) => void) {
  const xr = (navigator as any).xr
  if (!xr) return
  if (activeSession) {
    await activeSession.end()
    activeSession = null
    setInSession(false)
    return
  }
  try {
    const session: XRSession = await xr.requestSession('immersive-vr', {
      optionalFeatures: ['local-floor', 'bounded-floor'],
    })
    if (glRef?.current) {
      await glRef.current.xr.setSession(session)
    }
    activeSession = session
    setInSession(true)
    session.addEventListener('end', () => {
      activeSession = null
      setInSession(false)
    })
  } catch (e) {
    console.warn('XR session start failed', e)
  }
}

// Canvas 内で renderer.xr を有効化し、参照を共有
export function XRGLBinder() {
  const { gl } = useThree()
  useEffect(() => {
    gl.xr.enabled = true
    glRef = { current: gl }
    return () => { glRef = null }
  }, [gl])
  return null
}
