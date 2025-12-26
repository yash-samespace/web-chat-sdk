/**
 * @origon/chat-sdk
 *
 * Chat SDK for Origon/Samespace - provides core chat functionality
 * without UI dependencies.
 *
 * Usage:
 * ```js
 * import {
 *   authenticate,
 *   initiate,
 *   sendMessage,
 *   disconnect,
 *   getHistory,
 *   setCallbacks
 * } from '@origon/chat-sdk'
 *
 * // Authenticate first
 * const config = await authenticate({ endpoint: '...', apiKey: '...' })
 *
 * // Set up callbacks for state updates
 * setCallbacks({
 *   onMessage: (msg) => console.log('New message:', msg),
 *   onMessagesUpdate: (messages) => updateUI(messages),
 *   onTyping: (isTyping) => showTypingIndicator(isTyping),
 *   onError: (error) => console.error(error)
 * })
 *
 * // Start a chat session
 * const { sessionId, messages } = await initiate()
 *
 * // Send messages
 * await sendMessage({ text: 'Hello!' })
 *
 * // Disconnect when done
 * disconnect()
 * ```
 */

// HTTP API functions
export { authenticate, getHistory, getMessages, configure } from './http.js'

// Chat functions
export { initialize, startChat, sendMessage, disconnect, setCallbacks } from './chat.js'

// Call functions
export {
  startCall,
  disconnectCall,
  toggleMute,
  getLocalStream,
  getInboundAudioEnergy,
  getOutboundAudioEnergy,
  setCallCallbacks
} from './call.js'

// Constants
export { MESSAGE_ROLES } from './constants.js'
