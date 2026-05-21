// DMX512 over WebSerial (Enttec OpenDMX 互換)
// - 250kbaud, 8N2 + BREAK + MARK after break
// - DMX universe = 1 start code (0x00) + 512 channels (0..255)
//
// 注意: 多くの USB-RS485 アダプタは BREAK を厳密に出せないため、Enttec OpenDMX
// 公式ファームウェア (FT232R を bit-banging) が前提。ENTTEC DMX USB PRO は別プロトコル。
// 本実装は最小 OpenDMX 互換。

import { useStore } from '../store'
import { FIXTURE_PROFILES } from '../lighting/fixtureTypes'

interface DMXBridgeState {
  port: any | null  // SerialPort (WebSerial)
  writer: any | null
  intervalId: number | null
  lastFrame: Uint8Array
}
const state: DMXBridgeState = {
  port: null,
  writer: null,
  intervalId: null,
  lastFrame: new Uint8Array(513),
}

export function isWebSerialSupported(): boolean {
  return typeof navigator !== 'undefined' && 'serial' in navigator
}

export async function connectDMX(baudRate = 250000): Promise<{ ok: boolean; error?: string }> {
  if (!isWebSerialSupported()) {
    return { ok: false, error: 'このブラウザは WebSerial 非対応 (Chrome/Edge を使用)' }
  }
  try {
    // @ts-ignore navigator.serial 型
    const port = await navigator.serial.requestPort()
    await port.open({ baudRate, dataBits: 8, stopBits: 2, parity: 'none', flowControl: 'none' })
    state.port = port
    // @ts-ignore
    state.writer = port.writable.getWriter()
    // 30Hz で送信
    state.intervalId = window.setInterval(sendCurrentFrame, 33)
    return { ok: true }
  } catch (e: any) {
    return { ok: false, error: String(e.message ?? e) }
  }
}

export async function disconnectDMX() {
  if (state.intervalId) { clearInterval(state.intervalId); state.intervalId = null }
  if (state.writer) { try { await state.writer.releaseLock() } catch {} state.writer = null }
  if (state.port) { try { await state.port.close() } catch {} state.port = null }
}

// 現在の fixture 状態 → DMX フレーム
// 簡易マッピング: 各 fixture を 4ch (INTENSITY/R/G/B) でアサイン
// アドレス: i 番目 fixture は (i*4 + 1) から
export function buildFrame(): Uint8Array {
  const frame = new Uint8Array(513)
  frame[0] = 0  // start code
  const fixtures = useStore.getState().fixtures
  fixtures.slice(0, 128).forEach((f, idx) => {
    const base = 1 + idx * 4
    if (base + 3 > 512) return
    if (!f.enabled) {
      frame[base] = 0
      return
    }
    frame[base] = Math.round(Math.min(1, f.intensity / 1.5) * 255)
    frame[base + 1] = Math.round(Math.max(0, Math.min(1, f.color[0])) * 255)
    frame[base + 2] = Math.round(Math.max(0, Math.min(1, f.color[1])) * 255)
    frame[base + 3] = Math.round(Math.max(0, Math.min(1, f.color[2])) * 255)
  })
  return frame
}

async function sendCurrentFrame() {
  if (!state.writer) return
  const frame = buildFrame()
  state.lastFrame = frame
  try {
    // 注: 実機 OpenDMX では BREAK を出すために port.setSignals でラインを LOW→HIGH 制御する
    // FTDI bit-bang ファームでは可能だが、汎用 WebSerial では未対応のため一部機種で動かないことあり。
    // @ts-ignore
    if (state.port?.setSignals) await state.port.setSignals({ break: true })
    await new Promise(r => setTimeout(r, 1)) // 100us+ BREAK 推奨
    // @ts-ignore
    if (state.port?.setSignals) await state.port.setSignals({ break: false })
    await state.writer.write(frame)
  } catch (e) {
    // 失敗時はサイレント (UI 側で connection state を監視)
  }
}

export function getLastDmxFrame(): Uint8Array {
  return state.lastFrame
}

// 各フィクスチャの DMX アドレスを返す (UI 表示用)
export function getFixtureDMXAddress(fixtureIndex: number): { start: number; end: number; channels: { ch: string; offset: number }[] } {
  const start = 1 + fixtureIndex * 4
  return {
    start,
    end: start + 3,
    channels: [
      { ch: 'INT', offset: 0 },
      { ch: 'R', offset: 1 },
      { ch: 'G', offset: 2 },
      { ch: 'B', offset: 3 },
    ],
  }
}
