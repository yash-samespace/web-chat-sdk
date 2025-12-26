/**
 * Chat Service for Chat SDK
 * Handles real-time chat functionality without depending on external state
 * Uses callbacks to communicate state changes to the consumer
 */

import { fetchEventSource } from '@microsoft/fetch-event-source'
import { getMessages, authenticate } from './http.js'
import { getDeviceId, sleep } from './utils.js'
import { MESSAGE_ROLES } from './constants.js'

/**
 * @typedef {Object} ChatCallbacks
 * @property {(message: Object) => void} [onMessageAdd] - Called when a new message is added
 * @property {(index: number, updatedMsg: Object) => void} [onMessageUpdate] - Called when an existing message is updated
 * @property {(sessionId: string) => void} [onSessionUpdate] - Called when session ID is updated
 */

/**
 * @typedef {Object} ChatSession
 * @property {string} sessionId
 * @property {string} sseUrl
 * @property {string} [requestId]
 * @property {AbortController} [abortController]
 * @property {string} [lastStreamId]
 * @property {Array} messages
 * @property {ChatCallbacks} callbacks
 */

/**
 * Create a new chat session
 * @param {ChatCallbacks} [callbacks={}]
 * @returns {ChatSession}
 */
function createSession(callbacks = {}) {
  return {
    credentials: undefined,
    authenticated: false,
    configData: undefined,
    sessionId: undefined,
    requestId: undefined,
    sseUrl: undefined,
    abortController: undefined,
    lastStreamId: undefined,
    messages: [],
    callbacks
  }
}

/** @type {ChatSession} */
let currentSession = createSession()

/**
 * Set callbacks for the current session
 * @param {ChatCallbacks} callbacks
 */
export function setCallbacks(callbacks) {
  currentSession.callbacks = { ...currentSession.callbacks, ...callbacks }
}

/**
 * Initialize the chat session
 * @param {Object} credentials - Credentials for the chat
 */
export function initialize(credentials) {
  console.log('Initializing chat...', credentials)
  currentSession.credentials = credentials
  if (credentials.token) {
    currentSession.authenticated = true
  }
}

/**
 * Get current chat session credentials
 * @returns {{ endpoint: string, apiKey: string } | undefined}
 */
export function getCredentials() {
  return currentSession.credentials
}

/**
 * Update the session ID and notify via callback
 * @param {string} sessionId - The new session ID
 */
export function updateSessionId(sessionId) {
  if (sessionId && sessionId !== currentSession.sessionId) {
    currentSession.sessionId = sessionId
    currentSession.callbacks.onSessionUpdate?.(sessionId)
  }
}

/**
 * Initiate a new chat session or resume an existing one
 * @param {Object} credentials - Credentials for the chat
 * @param {Object} payload - Payload for the chat. It contains sessionId (optional)
 * @param {string} [payload.sessionId] - Optional session ID to resume
 * @returns {Promise<{ sessionId: string, messages: Array }>}
 */
export async function startChat(payload = {}) {
  try {
    console.log('startChat: ', payload, currentSession)

    let configData = null
    if (!currentSession.authenticated) {
      configData = await authenticate(currentSession.credentials)
      currentSession.authenticated = true
      currentSession.configData = configData
    } else {
      configData = currentSession.configData
    }

    let messages = []

    if (payload.sessionId) {
      const messagesRes = await getMessages(payload.sessionId)
      messages = (messagesRes?.sessionHistory ?? []).map((msg) => ({
        id: msg.id,
        text: msg.text,
        role: msg.youtubeVideo
          ? MESSAGE_ROLES.BOT // for youtube video messages, role is "system" from backend, we need to make it "assistant"
          : msg.role,
        timestamp: msg.timestamp,
        video: msg.youtubeVideo,
        channel: msg.channel,
        done: true
      }))
    }

    const searchParams = new URLSearchParams({
      externalId: getExternalId()
    })
    currentSession.sseUrl = `${currentSession.credentials.endpoint}?${searchParams.toString()}`
    currentSession.sessionId = payload.sessionId
    currentSession.messages = messages

    console.log('Chat initiated successfully')

    return {
      sessionId: currentSession.sessionId,
      messages,
      configData
    }
  } catch (error) {
    console.error(`Failed to start chat: ${error.message}`)
    cleanup()
    throw error
  }
}

/**
 * Disconnect from the current chat session
 */
export function disconnect() {
  cleanup()
}

/**
 * Clean up the current session
 */
function cleanup() {
  if (currentSession.abortController) {
    currentSession.abortController.abort()
  }

  const { callbacks, credentials } = currentSession
  currentSession = createSession(callbacks)
  currentSession.credentials = credentials

  console.log('Chat session cleaned up')
}

export function getExternalId() {
  if (currentSession.credentials?.externalId) {
    return currentSession.credentials.externalId
  }
  return getDeviceId()
}

/**
 * Send a message in the current chat session
 * @param {{ text: string, html?: string }} message
 * @returns {Promise<string>}
 */
export function sendMessage({ text, html }) {
  return new Promise((resolve, reject) => {
    ;(async () => {
      try {
        // Add user message
        const userMessage = {
          role: MESSAGE_ROLES.USER,
          text,
          html,
          timestamp: new Date().toISOString()
        }
        currentSession.messages = [...currentSession.messages, userMessage]
        currentSession.callbacks.onMessageAdd?.(userMessage)

        await sleep(200)

        const loadingMessage = {
          role: MESSAGE_ROLES.BOT,
          text: '',
          loading: true
        }
        currentSession.messages = [...currentSession.messages, loadingMessage]
        currentSession.callbacks.onMessageAdd?.(loadingMessage)

        const url = new URL(currentSession.sseUrl)
        if (currentSession.sessionId) {
          url.searchParams.set('sessionId', currentSession.sessionId)
        }
        if (currentSession.requestId) {
          url.searchParams.set('requestId', currentSession.requestId)
        }

        currentSession.lastStreamId = undefined

        // Create a new abort controller for this request
        currentSession.abortController = new AbortController()

        const headers = {
          'Content-Type': 'application/json'
        }
        if (currentSession.credentials?.token) {
          headers.Authorization = `Bearer ${currentSession.credentials.token}`
        }

        await fetchEventSource(url.toString(), {
          method: 'POST',
          headers,
          body: JSON.stringify({
            message: text,
            html
          }),
          signal: currentSession.abortController.signal,
          onopen: async (response) => {
            if (!response.ok) {
              console.error('Failed to send message bad response: ', response)
              throw new Error('Failed to send message')
            }
          },
          onmessage: (event) => {
            console.log('Event: ', event)
            const data = JSON.parse(event.data)

            if (data.status === 'connected') {
              currentSession.sessionId = data.sessionId
              currentSession.requestId = data.requestId
            } else if (data.message !== undefined) {
              // If streamId changes, start a new assistant message
              if (data.streamId !== undefined) {
                if (currentSession.lastStreamId === undefined) {
                  currentSession.lastStreamId = data.streamId
                } else if (data.streamId !== currentSession.lastStreamId) {
                  currentSession.lastStreamId = data.streamId
                  const newBotMessage = {
                    role: MESSAGE_ROLES.BOT,
                    text: '',
                    loading: true
                  }
                  currentSession.messages = [...currentSession.messages, newBotMessage]
                  currentSession.callbacks.onMessageAdd?.(newBotMessage)
                }
              }

              // Update the last message with new content
              const lastIndex = currentSession.messages.length - 1
              const lastMsg = currentSession.messages[lastIndex]
              const updatedMsg = {
                ...lastMsg,
                loading: false,
                text: (lastMsg.text || '') + data.message,
                done: data.done ?? lastMsg.done
              }
              currentSession.messages = currentSession.messages.map((msg, index) =>
                index === lastIndex ? updatedMsg : msg
              )

              currentSession.callbacks.onMessageUpdate?.(lastIndex, updatedMsg)

              if (data.done) {
                resolve(currentSession.sessionId)
              }

              // Store session info for reuse
              currentSession.sessionId = data.session_id ?? currentSession.sessionId
              currentSession.requestId = data.requestId ?? currentSession.requestId
            } else if (data.error) {
              const errorMessage = 'Failed to connect to the system'
              const lastIndex = currentSession.messages.length - 1
              const lastMsg = currentSession.messages[lastIndex]
              const updatedMsg = {
                ...lastMsg,
                loading: false,
                errorText: errorMessage
              }
              currentSession.messages = currentSession.messages.map((msg, index) =>
                index === lastIndex ? updatedMsg : msg
              )
              currentSession.callbacks.onMessageUpdate?.(lastIndex, updatedMsg)
              reject(new Error(errorMessage))
            }
          },
          onerror: (error) => {
            throw error // Rethrow to stop retries
          },
          openWhenHidden: true
        })
      } catch (error) {
        console.error('Failed to send message: ', error)
        const errorMessage = 'Failed to connect to the system'
        const lastIndex = currentSession.messages.length - 1
        const lastMsg = currentSession.messages[lastIndex]
        const updatedMsg = {
          ...lastMsg,
          loading: false,
          errorText: lastMsg.done ? undefined : error.message || errorMessage,
          done: true
        }
        currentSession.messages = currentSession.messages.map((msg, index) =>
          index === lastIndex ? updatedMsg : msg
        )
        currentSession.callbacks.onMessageUpdate?.(lastIndex, updatedMsg)
        reject(error)
      }
    })()
  })
}
