/**
 * Socket Service for Call SDK
 * Handles WebRTC call functionality without depending on external state
 * Uses callbacks to communicate state changes to the consumer
 */

import { getCallServerEndpoint } from './utils.js'
import { getCredentials, getExternalId, updateSessionId } from './chat.js'

/**
 * @typedef {Object} CallCallbacks
 * @property {(status: string) => void} [onCallStatus] - Called when call status changes
 * @property {(error: string | null) => void} [onCallError] - Called when call error occurs
 */

/**
 * @typedef {Object} CallSession
 * @property {string} [sessionId]
 * @property {WebSocket} [socket]
 * @property {RTCPeerConnection} [peerConnection]
 * @property {MediaStream} [localStream]
 * @property {MediaStream} [remoteStream]
 * @property {HTMLAudioElement} [remoteAudio]
 * @property {boolean} isMuted
 * @property {string} callStatus
 * @property {NodeJS.Timeout} [pingInterval]
 * @property {number} pingCount
 * @property {number | null} lastPongTime
 * @property {CallCallbacks} callbacks
 */

/**
 * Create a new call session
 * @param {CallCallbacks} [callbacks={}]
 * @returns {CallSession}
 */
function createSession(callbacks = {}) {
  return {
    sessionId: undefined,
    socket: null,
    peerConnection: null,
    localStream: null,
    remoteStream: null,
    remoteAudio: null,
    isMuted: false,
    callStatus: 'disconnected',
    pingInterval: null,
    pingCount: 0,
    lastPongTime: null,
    callbacks
  }
}

/** @type {CallSession} */
let currentSession = createSession()

const rtcConfig = {
  iceServers: [{ urls: 'stun:stun.l.google.com:19302' }, { urls: 'stun:stun1.l.google.com:19302' }]
}

/**
 * Set callbacks for the current session
 * @param {CallCallbacks} callbacks
 */
export function setCallCallbacks(callbacks) {
  currentSession.callbacks = { ...currentSession.callbacks, ...callbacks }
}

/**
 * Clean up the current session
 */
function cleanup() {
  if (currentSession.peerConnection) {
    currentSession.peerConnection.close()
    currentSession.peerConnection = null
  }

  if (currentSession.localStream) {
    currentSession.localStream.getTracks().forEach((track) => track.stop())
    currentSession.localStream = null
  }

  if (currentSession.remoteStream) {
    currentSession.remoteStream = null
  }

  if (currentSession.remoteAudio) {
    currentSession.remoteAudio.srcObject = null
    if (currentSession.remoteAudio.parentNode) {
      currentSession.remoteAudio.parentNode.removeChild(currentSession.remoteAudio)
    }
    currentSession.remoteAudio = null
  }

  if (currentSession.socket) {
    currentSession.socket.close()
    currentSession.socket = null
  }

  stopPingInterval()

  const callbacks = currentSession.callbacks
  currentSession = createSession(callbacks)

  console.log('Call session cleaned up')
}

/**
 * Update call status and notify callback
 * @param {string} status
 */
function setCallStatus(status) {
  currentSession.callStatus = status
  currentSession.callbacks.onCallStatus?.(status)
}

/**
 * Update call error and notify callback
 * @param {string | null} error
 */
function setCallError(error) {
  currentSession.callbacks.onCallError?.(error)
}

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
      currentSession.pingCount++
      const pingMessage = {
        type: 'ping',
        timestamp: Date.now(),
        count: currentSession.pingCount
      }
      sendEvent(pingMessage)
      console.log(`Sending keep-alive ping #${currentSession.pingCount}`)
    } else {
      console.log('Socket not open, stopping ping interval')
      stopPingInterval()
    }
  }, 10000)
}

/**
 * Handle pong response
 */
function handlePong() {
  currentSession.lastPongTime = Date.now()
  console.log(`Received pong #${currentSession.pingCount}`)
}

/**
 * Send event through socket
 * @param {Object} payload
 */
function sendEvent(payload) {
  if (!currentSession.socket) {
    console.error('Failed to send event: no socket instance')
    return
  }
  if (currentSession.socket.readyState !== WebSocket.OPEN) {
    console.error('Failed to send event: socket state not open ', payload)
    return
  }

  currentSession.socket.send(JSON.stringify(payload))
}

/**
 * Get user media
 */
async function getUserMedia() {
  try {
    currentSession.localStream = await navigator.mediaDevices.getUserMedia({
      audio: true,
      video: false
    })
    console.log('Got audio media')
  } catch (error) {
    console.error(`Failed to get audio media: ${error.message}`)
    throw error
  }
}

/**
 * Create peer connection
 */
function createPeerConnection() {
  currentSession.peerConnection = new RTCPeerConnection(rtcConfig)

  currentSession.peerConnection.onicecandidate = (event) => {
    if (event.candidate) {
      sendEvent({
        type: 'ice',
        data: {
          candidate: JSON.stringify(event.candidate)
        }
      })
    }
  }

  currentSession.peerConnection.ontrack = (event) => {
    console.log('Received remote audio stream')
    currentSession.remoteStream = event.streams[0]

    if (!currentSession.remoteAudio) {
      currentSession.remoteAudio = document.createElement('audio')
      currentSession.remoteAudio.autoplay = true
      currentSession.remoteAudio.controls = false
      document.body.appendChild(currentSession.remoteAudio)
    }
    currentSession.remoteAudio.srcObject = currentSession.remoteStream
    // explicitly kick off playback and catch any policy/gesture errors
    currentSession.remoteAudio
      .play()
      .then(() => console.log('🔊 remote audio playing'))
      .catch((err) => console.error('❌ playback error:', err))
  }

  currentSession.peerConnection.onconnectionstatechange = () => {
    const newState = currentSession.peerConnection.connectionState
    console.log(`Connection state: ${newState}`)

    if (newState === 'connected') {
      setCallStatus('connected')
    } else if (newState === 'disconnected' || newState === 'closed') {
      setCallStatus('disconnected')
      disconnectCall()
    }
  }

  currentSession.peerConnection.oniceconnectionstatechange = () => {
    console.log(`ICE connection state: ${currentSession.peerConnection.iceConnectionState}`)
  }
}

/**
 * Connect socket
 * @param {{ sessionId?: string }} payload
 */
function connectSocket(payload) {
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

    // Extract hostname from endpoint
    const socketEndpoint = getCallServerEndpoint(credentials.endpoint)
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
    if (credentials.token) {
      queryParams.set('token', credentials.token)
    }

    const socketUrl = `${socketEndpoint}?${queryParams.toString()}`
    currentSession.socket = new WebSocket(socketUrl)

    currentSession.socket.onopen = (event) => {
      console.log('Socket connection established: ', event)
      startPingInterval()
      fulfill(true)
    }

    currentSession.socket.onmessage = (event) => {
      const data = JSON.parse(event.data)
      handleCallServerEvent(data)
    }

    currentSession.socket.onerror = (error) => {
      console.error('Socket error: ', error)
      setCallStatus('error')
      setCallError(error.message || 'Unable to connect voice')
      reject(error)
    }

    currentSession.socket.onclose = (event) => {
      console.log('Socket connection closed: ', event)
      stopPingInterval()
    }
  })
}

/**
 * Handle call server event
 * @param {Object} action
 */
function handleCallServerEvent(action) {
  console.log('Handling socket server event: ', action)

  switch (action.type) {
    case 'pong':
      handlePong()
      break

    case 'answer':
      handleAnswer(action.data)
      break

    case 'ice':
      handleIceCandidate(action.data)
      break

    case 'renegotiationOffer':
      handleRenegotiationOffer(action.data)
      break
    case 'end':
      disconnectCall()
      break
    case 'error':
      setCallStatus('error')
      setCallError(action.error || 'Unable to connect voice')
      break

    default:
      console.log('Unknown call event type: ', action.type)
      break
  }
}

/**
 * Handle answer
 * @param {Object} data
 */
async function handleAnswer(data) {
  try {
    console.log('Received answer')

    currentSession.sessionId = data.sessionId
    // Update chat session with the new sessionId and notify controller
    updateSessionId(data.sessionId)

    if (currentSession.peerConnection) {
      const answer = new RTCSessionDescription({
        type: 'answer',
        sdp: data.sdp
      })
      console.log('Setting remote description answer: ', answer)
      await currentSession.peerConnection.setRemoteDescription(answer)
      console.log('Remote description set')
    }
  } catch (error) {
    console.error(`Failed to handle answer: ${error.message}`)
  }
}

/**
 * Handle ICE candidate
 * @param {Object} data
 */
async function handleIceCandidate(data) {
  try {
    if (currentSession.peerConnection) {
      const candidate = new RTCIceCandidate(JSON.parse(data.candidate))
      await currentSession.peerConnection.addIceCandidate(candidate)
      console.log('Added ICE candidate')
    }
  } catch (error) {
    console.error(`Failed to add ICE candidate: ${error.message}`)
  }
}

/**
 * Handle renegotiation offer
 * @param {Object} data
 */
async function handleRenegotiationOffer(data) {
  try {
    console.log('Received renegotiation offer')

    if (currentSession.peerConnection) {
      const offer = new RTCSessionDescription({
        type: 'offer',
        sdp: data.sdp
      })
      console.log('Setting remote description offer: ', offer)
      await currentSession.peerConnection.setRemoteDescription(offer)
      console.log('Remote description set')

      const answer = await currentSession.peerConnection.createAnswer()
      await currentSession.peerConnection.setLocalDescription(answer)

      sendEvent({
        type: 'renegotiationAnswer',
        data: {
          sdp: answer.sdp
        }
      })
    }
  } catch (error) {
    console.error(`Failed to handle renegotiation offer: ${error.message}`)
  }
}

/**
 * Start a call
 * @param {{ sessionId?: string }} payload
 */
export async function startCall(payload = {}) {
  try {
    if (currentSession.callStatus === 'connecting' || currentSession.callStatus === 'connected') {
      console.log(`Call already in ${currentSession.callStatus} state`)
      return
    }

    console.log('Starting audio call...')
    setCallStatus('connecting')
    setCallError(null)

    currentSession.sessionId = payload.sessionId

    await getUserMedia()

    createPeerConnection()

    currentSession.localStream.getTracks().forEach((track) => {
      currentSession.peerConnection.addTrack(track, currentSession.localStream)
      console.log(`Added ${track.kind} track`)
    })
    await connectSocket(payload)
    const offer = await currentSession.peerConnection.createOffer()
    await currentSession.peerConnection.setLocalDescription(offer)

    sendEvent({
      type: 'offer',
      data: {
        sdp: offer.sdp
      }
    })

    console.log('Call initiated successfully')
  } catch (error) {
    console.log('error: ', error)
    console.error(`Failed to start call: ${error.message}`)
    setCallStatus('error')
    setCallError(error.message || 'Unable to connect voice')
    cleanup()
  }
}

/**
 * Disconnect call
 */
export function disconnectCall() {
  sendEvent({
    type: 'end'
  })
  if (currentSession.socket) {
    currentSession.socket.close()
    currentSession.socket = null
  }
  setCallStatus('disconnected')
  if (currentSession.peerConnection) {
    currentSession.peerConnection.close()
    currentSession.peerConnection = null
  }
  if (currentSession.localStream) {
    currentSession.localStream.getTracks().forEach((track) => track.stop())
    currentSession.localStream = null
  }
  cleanup()
}

/**
 * Toggle mute
 * @returns {boolean}
 */
export function toggleMute() {
  if (currentSession.localStream) {
    const audioTrack = currentSession.localStream.getAudioTracks()[0]
    if (audioTrack) {
      audioTrack.enabled = !audioTrack.enabled
      currentSession.isMuted = !audioTrack.enabled
      console.log(`Audio ${currentSession.isMuted ? 'muted' : 'unmuted'}`)
      return currentSession.isMuted
    }
  }
  return false
}

/**
 * Get local stream
 * @returns {MediaStream | null}
 */
export function getLocalStream() {
  return currentSession.localStream
}

/**
 * Get inbound audio energy
 * @returns {Promise<number>}
 */
export function getInboundAudioEnergy() {
  return new Promise((resolve, reject) => {
    if (!currentSession.peerConnection) {
      reject(new Error('no peer connection'))
      return
    }
    currentSession.peerConnection
      .getStats()
      .then((stats) => {
        stats.forEach((report) => {
          if (report.type == 'inbound-rtp') {
            resolve(report.totalAudioEnergy)
          }
        })
        reject(new Error('no inbound-rtp stats found'))
      })
      .catch((err) => {
        reject(err)
      })
  })
}

/**
 * Get outbound audio energy (not implemented in original, but may be needed)
 * @returns {Promise<number>}
 */
export function getOutboundAudioEnergy() {
  return new Promise((resolve, reject) => {
    if (!currentSession.peerConnection) {
      reject(new Error('no peer connection'))
      return
    }
    currentSession.peerConnection
      .getStats()
      .then((stats) => {
        stats.forEach((report) => {
          if (report.type == 'outbound-rtp') {
            resolve(report.totalAudioEnergy)
          }
        })
        reject(new Error('no outbound-rtp stats found'))
      })
      .catch((err) => {
        reject(err)
      })
  })
}
