/**
 * Utility functions for the Chat SDK
 */

export function uuidv7() {
  const timestamp = Date.now()
  const bytes = new Uint8Array(16)
  crypto.getRandomValues(bytes)

  // Set timestamp (48 bits)
  bytes[0] = (timestamp >> 40) & 0xff
  bytes[1] = (timestamp >> 32) & 0xff
  bytes[2] = (timestamp >> 24) & 0xff
  bytes[3] = (timestamp >> 16) & 0xff
  bytes[4] = (timestamp >> 8) & 0xff
  bytes[5] = timestamp & 0xff

  // Set version 7 (0111)
  bytes[6] = (bytes[6] & 0x0f) | 0x70

  // Set variant (10xx)
  bytes[8] = (bytes[8] & 0x3f) | 0x80

  const hex = [...bytes].map((b) => b.toString(16).padStart(2, '0')).join('')
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`
}

export function getDeviceId() {
  if (localStorage.getItem('chatDeviceId')) {
    return localStorage.getItem('chatDeviceId')
  }

  const deviceId = uuidv7()
  localStorage.setItem('chatDeviceId', deviceId)
  return deviceId
}

export function parseJwt(token) {
  try {
    const base64Url = token.split('.')[1]
    const base64 = base64Url.replace(/-/g, '+').replace(/_/g, '/')
    const jsonPayload = decodeURIComponent(
      atob(base64)
        .split('')
        .map(function (c) {
          return '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2)
        })
        .join('')
    )

    return JSON.parse(jsonPayload)
  } catch {
    return null
  }
}

export async function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

export function getSocketEndpoint(baseUrl) {
  let socketEndpoint
  try {
    const url = new URL(baseUrl)
    socketEndpoint = `wss://${url.hostname}${url.pathname}/wss`
  } catch {
    console.error('Invalid base URL: ', baseUrl)
  }
  return socketEndpoint
}

export function getCallServerEndpoint(baseUrl) {
  let socketEndpoint
  try {
    const url = new URL(baseUrl)
    socketEndpoint = `wss://${url.hostname}${url.pathname}/audio`
  } catch {
    console.error('getCallServerEndpoint: Invalid base URL: ', baseUrl)
  }
  return socketEndpoint
}
