/**
 * API Service for Chat SDK
 * Handles all HTTP requests without depending on external state
 */

import { getExternalId } from './chat.js'

const AUTHENTICATION_ERROR = 'Something went wrong initializing the chat'
const INITIALIZATION_ERROR = 'Chat SDK not initialized'

// Module-level configuration
let _config = {
  endpoint: null
}

/**
 * Configure the API service with endpoint
 * @param {{ endpoint: string }} credentials
 */
export function configure(credentials) {
  _config = {
    endpoint: credentials.endpoint
  }
}

/**
 * Get current configuration
 * @returns {{ endpoint: string | null }}
 */
export function getConfig() {
  return { ..._config }
}

/**
 * Authenticate with the chat service
 * @param {{ endpoint: string }} credentials
 * @returns {Promise<object>} Authentication response data
 */
export async function authenticate(payload) {
  const { endpoint } = payload
  const url = `${endpoint}/config`

  const response = await fetch(url, {
    method: 'GET',
    headers: {
      'Content-Type': 'application/json'
    }
  })

  if (!response.ok) {
    const errorPayload = await response.json()
    throw new Error(errorPayload?.error || AUTHENTICATION_ERROR)
  }

  const res = await response.json()
  const data = res.data

  // Store endpoint for subsequent requests
  configure({ endpoint })

  return data
}

/**
 * Get chat history for the current device
 * @returns {Promise<{ sessions: Array }>}
 */
export async function getHistory() {
  const queryParams = new URLSearchParams({
    externalId: getExternalId()
  })
  const response = await fetchRequest(`/sessions?${queryParams.toString()}`, 'GET')

  if (!response.ok) {
    throw new Error('Unable to load history, please try again later')
  }

  return response.json()
}

/**
 * Get messages for a specific session
 * @param {string} sessionId
 * @returns {Promise<{ sessionHistory: Array }>}
 */
export async function getMessages(sessionId) {
  const queryParams = new URLSearchParams({
    sessionId
  })
  const response = await fetchRequest(`/session?${queryParams.toString()}`, 'GET')

  if (!response.ok) {
    throw new Error('Unable to load messages, please try again later')
  }

  return response.json()
}

/**
 * Internal fetch request helper
 * @param {string} pathname
 * @param {string} method
 * @param {object|null} body
 * @returns {Promise<Response>}
 */
async function fetchRequest(pathname, method = 'GET', body = null) {
  const { endpoint } = _config

  if (!endpoint) {
    throw new Error(INITIALIZATION_ERROR)
  }

  const url = `${endpoint}${pathname}`

  return fetch(url, {
    headers: {
      'Content-Type': 'application/json'
    },
    method,
    body: body ? JSON.stringify(body) : null
  })
}
