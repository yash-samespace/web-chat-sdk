/**
 * Socket Service for Chat SDK
 * Handles WebSocket connection for real-time chat functionality
 */

import { getSocketEndpoint, uuidv7 } from './utils.js'
import {
  getCredentials,
  getExternalId,
  addMessage,
  toggleTypingStatus,
  setTransport
} from './chat.js'

const PING_INTERVAL = 10000
const SOCKET_TIMEOUT = 5000

/**
 * @typedef {Object} SocketSession
 * @property {WebSocket} [socket]
 * @property {boolean} previouslyConnected
 * @property {boolean} socketDisconnected
 * @property {NodeJS.Timeout} [pingInterval]
 * @property {NodeJS.Timeout} [socketDisconnectedTimeout]
 * @property {NodeJS.Timeout} [socketConnectionTimeout]
 */

/**
 * Socket Events
 */
export const SocketEvents = {
  MESSAGE: 'message',
  TYPING: 'typing',
  TYPING_STOP: 'typingOff',
  END: 'end'
}

/**
 * Create a new socket session
 * @returns {SocketSession}
 */
function createSession() {
  return {
    socket: null,
    previouslyConnected: false,
    socketDisconnected: false,
    pingInterval: null,
    socketDisconnectedTimeout: null,
    socketConnectionTimeout: null
  }
}

/** @type {SocketSession} */
let currentSession = createSession()

/**
 * Stop ping interval
 */
function stopPingInterval() {
  if (currentSession.pingInterval) {
    clearInterval(currentSession.pingInterval)
    currentSession.pingInterval = null
  }
}

/**
 * Start ping interval
 */
function startPingInterval() {
  stopPingInterval()

  currentSession.pingInterval = setInterval(() => {
    if (currentSession.socket && currentSession.socket.readyState === WebSocket.OPEN) {
      send({ type: 'ping' })
      console.log('Sending keep-alive ping')
    } else {
      console.log('Socket not open, stopping ping interval')
      stopPingInterval()
    }
  }, PING_INTERVAL)
}

/**
 * Clear all timeouts
 */
function clearAllTimeouts() {
  stopPingInterval()
  if (currentSession.socketDisconnectedTimeout) {
    clearTimeout(currentSession.socketDisconnectedTimeout)
    currentSession.socketDisconnectedTimeout = null
  }
  if (currentSession.socketConnectionTimeout) {
    clearTimeout(currentSession.socketConnectionTimeout)
    currentSession.socketConnectionTimeout = null
  }
}

/**
 * Handle socket connected state
 */
function handleSocketConnected() {
  console.log('handleSocketConnected')
  currentSession.socketDisconnected = false
  setTransport('socket')
}

/**
 * Handle socket disconnected state
 */
function handleSocketDisconnected() {
  console.log('handleSocketDisconnected')
  currentSession.socketDisconnected = true
  setTransport('sse')
}

/**
 * Connect to socket
 * @param {{ token: string, sessionId?: string }} payload
 * @returns {Promise<boolean>}
 */
export function connectSocket(payload) {
  return new Promise((fulfill, reject) => {
    if (
      currentSession.socket &&
      (currentSession.socket.readyState === WebSocket.CONNECTING ||
        currentSession.socket.readyState === WebSocket.OPEN)
    ) {
      console.log('Socket in connecting/open state, returning.')
      fulfill(currentSession.socket.readyState === WebSocket.OPEN)
      return
    }

    console.log('Initializing socket connection..')
    const credentials = getCredentials()
    if (!credentials || !credentials.endpoint) {
      reject(new Error('SDK not initialized. Please initialize SDK first.'))
      return
    }

    const socketEndpoint = getSocketEndpoint(credentials.endpoint)
    if (!socketEndpoint) {
      reject(
        new Error(
          'Invalid endpoint while initializing SDK. Please check the endpoint and try again.'
        )
      )
      return
    }

    const externalId = getExternalId()
    const queryParams = new URLSearchParams({
      externalId
    })

    if (payload.sessionId) {
      queryParams.set('sessionId', payload.sessionId)
    }
    if (payload.requestId) {
      queryParams.set('requestId', payload.requestId)
    }
    if (credentials.token) {
      queryParams.set('token', credentials.token)
    }

    const socketUrl = `${socketEndpoint}?${queryParams.toString()}`
    currentSession.socket = new WebSocket(socketUrl)

    currentSession.socket.onopen = () => {
      console.log('-------- socket connected --------')
      currentSession.previouslyConnected = true
      handleSocketConnected()
      send({ type: 'ping' })
      clearTimeout(currentSession.socketConnectionTimeout)
      startPingInterval()
      fulfill(true)
    }

    currentSession.socket.onmessage = (event) => {
      const message = JSON.parse(event.data)
      handleSocketEvent(message)
    }

    currentSession.socket.onerror = (error) => {
      console.error('Socket error:', error)
      setTransport('sse')
      reject(error)
    }

    currentSession.socket.onclose = (ws) => {
      console.log('-------- socket disconnected --------: ', ws.code, ws.reason)

      if (ws.target === currentSession.socket) {
        if (ws.code === 1006) {
          // abnormal closure
          if (currentSession.previouslyConnected) {
            handleSocketDisconnected()
          } else {
            addMessage({
              errorText: 'Unable to establish connection',
              done: true,
              timestamp: new Date().toISOString()
            })
          }
          clearTimeout(currentSession.socketConnectionTimeout)
        }

        currentSession.socket = null
        clearAllTimeouts()
      }
    }

    if (!currentSession.previouslyConnected) {
      currentSession.socketConnectionTimeout = setTimeout(() => {
        console.error('Socket connection timed out')
        addMessage({
          errorText: 'Unable to establish connection',
          done: true,
          timestamp: new Date().toISOString()
        })
        reject(new Error('Socket connection timed out'))
      }, SOCKET_TIMEOUT)
    }
  })
}

/**
 * Send data through socket
 * @param {Object} data
 */
export function send(data) {
  console.log('sending socket event: ', data.type)
  if (currentSession.socketDisconnected || !currentSession.socket) {
    return
  }
  currentSession.socket.send(JSON.stringify({ ...data, eventId: data.eventId || uuidv7() }))
}

/**
 * Send data through socket and wait for acknowledgment
 * @param {Object} data
 * @returns {Promise<Object>}
 */
export function sendWithAck(data) {
  return new Promise((resolve, reject) => {
    if (!currentSession.socket) {
      console.error('sendWithAck: socket instance not found or not connected')
      reject(new Error('Socket instance not found or not connected'))
      return
    }

    const autoRejectTimeout = setTimeout(() => {
      reject(new Error('Timeout'))
    }, 5000)

    const eventId = data.eventId || uuidv7()

    const onMessage = (event) => {
      const eventData = JSON.parse(event.data)
      if (eventData.eventId === eventId) {
        clearTimeout(autoRejectTimeout)
        currentSession.socket.removeEventListener('message', onMessage)
        if (eventData.data) {
          resolve(eventData.data)
        } else {
          reject(new Error(eventData.error?.message ?? 'Unknown error'))
        }
      }
    }
    currentSession.socket.addEventListener('message', onMessage)
    currentSession.socket.send(JSON.stringify({ ...data, eventId }))
  })
}

/**
 * Handle socket event
 * @param {Object} event
 */
function handleSocketEvent(event) {
  console.log('received socket event: ', event.type)

  switch (event.type) {
    case 'pong': {
      if (currentSession.socketDisconnected) {
        handleSocketConnected()
      }
      if (currentSession.socketDisconnectedTimeout) {
        clearTimeout(currentSession.socketDisconnectedTimeout)
      }
      currentSession.socketDisconnectedTimeout = setTimeout(() => {
        console.log('---- socket ping timeout ----')
        handleSocketDisconnected()
      }, PING_INTERVAL + 1000)
      break
    }
    case SocketEvents.TYPING: {
      toggleTypingStatus(true)
      break
    }
    case SocketEvents.TYPING_STOP: {
      toggleTypingStatus(false)
      break
    }
    case SocketEvents.MESSAGE: {
      const { eventId, data } = event
      if (!eventId) {
        addMessage({
          ...data,
          done: true,
          timestamp: new Date().toISOString()
        })
      }
      break
    }
    case SocketEvents.END: {
      disconnect()
      break
    }
    default:
      break
  }
}

/**
 * Reconnect to socket
 */
export function reconnect() {
  if (currentSession.socket) {
    send({ type: 'ping' })
  }
}

/**
 * Disconnect socket
 */
export function disconnect() {
  console.log('Disconnecting socket')
  if (currentSession.socket) {
    currentSession.socket.close(1000)
  }
  currentSession.previouslyConnected = false
  clearAllTimeouts()
  currentSession.socket = null
  setTransport('sse')
}

/**
 * Check if socket is connected
 * @returns {boolean}
 */
export function isConnected() {
  return (
    currentSession.socket !== null &&
    currentSession.socket.readyState === WebSocket.OPEN &&
    !currentSession.socketDisconnected
  )
}

/**
 * Check if socket is disconnected
 * @returns {boolean}
 */
export function isDisconnected() {
  return currentSession.socketDisconnected
}
