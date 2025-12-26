# @origonai/web-chat-sdk

A lightweight, UI-agnostic Chat and Voice SDK for integrating Origon/Samespace chat and real-time voice call capabilities into your web applications.

## Features

- 🗨️ **Real-time Chat** — Send and receive messages with streaming support
- 🎙️ **Voice Calls** — WebRTC-based audio calls with full control
- 🔄 **Live Agent Support** — Seamless handoff to human agents
- 📜 **Chat History** — Retrieve and resume previous sessions
- 🎯 **Framework Agnostic** — Works with React, Vue, Svelte, vanilla JS, or any framework
- 📦 **Zero UI Dependencies** — Bring your own UI components

## Installation

```bash
npm install @origonai/web-chat-sdk
# or
yarn add @origonai/web-chat-sdk
```

## Quick Start

### Basic Chat Example

```javascript
import {
  initialize,
  startChat,
  sendMessage,
  disconnect,
  setCallbacks
} from '@origonai/web-chat-sdk'

// 1. Set up callbacks for state updates
setCallbacks({
  onMessageAdd: (message) => {
    console.log('New message:', message)
  },
  onMessageUpdate: (index, updatedMsg) => {
    console.log('Message updated at index:', index, updatedMsg)
  },
  onTyping: (isTyping) => {
    console.log('Live Agent is typing:', isTyping)
  },
  onSessionUpdate: (sessionId) => {
    console.log('Session ID:', sessionId)
  },
  onLiveAgentMode: (isLiveAgent) => {
    console.log('Live agent mode:', isLiveAgent)
  }
})

// 2. Initialize with your endpoint
initialize({
  endpoint: 'https://your-origon-endpoint.com/api/chat'
})

// 3. Start a chat session
const { sessionId, messages, configData } = await startChat()

// 4. Send messages
await sendMessage({ text: 'Hello!' })

// 5. Disconnect when done
disconnect()
```

### Voice Call Example

```javascript
import {
  initialize,
  startCall,
  disconnectCall,
  toggleMute,
  setCallCallbacks
} from '@origonai/web-chat-sdk'

// 1. Set up call callbacks
setCallCallbacks({
  onCallStatus: (status) => {
    console.log('Call status:', status) // 'connecting' | 'connected' | 'disconnected' | 'error'
  },
  onCallError: (error) => {
    console.error('Call error:', error)
  }
})

// 2. Initialize (same as chat)
initialize({
  endpoint: 'https://your-origon-endpoint.com/api/chat'
})

// 3. Start a voice call
await startCall()

// 4. Toggle mute
const isMuted = toggleMute()

// 5. End the call
disconnectCall()
```

## API Reference

### Configuration & Authentication

#### `initialize(credentials)`

Initializes the SDK with your credentials.

```javascript
initialize({
  endpoint: string,     // Required: Your Origon API endpoint
  token?: string,       // Optional: JWT token for authenticated users
  externalId?: string   // Optional: Custom user identifier
})
```

#### `authenticate(credentials)`

Authenticates and retrieves configuration from the server.

```javascript
const config = await authenticate({
  endpoint: 'https://your-origon-endpoint.com/api/chat'
})
```

#### `configure(credentials)`

Configures the API service with an endpoint (called automatically by `authenticate`).

```javascript
configure({ endpoint: 'https://your-endpoint.com/api/chat' })
```

---

### Chat Functions

#### `setCallbacks(callbacks)`

Sets callback functions for chat events.

```javascript
setCallbacks({
  onMessageAdd: (message: Message) => void,
  onMessageUpdate: (index: number, updatedMsg: Message) => void,
  onTyping: (isTyping: boolean) => void,
  onLiveAgentMode: (isLiveAgent: boolean) => void,
  onSessionUpdate: (sessionId: string) => void
})
```

#### `startChat(payload?)`

Starts a new chat session or resumes an existing one.

```javascript
const result = await startChat({
  sessionId?: string  // Optional: Resume an existing session
})

// Returns:
// {
//   sessionId: string,
//   messages: Message[],
//   configData: object
// }
```

#### `sendMessage(message)`

Sends a message in the current chat session. Returns a Promise that resolves with the session ID when the bot response is complete.

```javascript
const sessionId = await sendMessage({
  text: string,   // Required: Message text
  html?: string   // Optional: HTML content
})
```

#### `disconnect()`

Disconnects from the current chat session and cleans up resources.

```javascript
disconnect()
```

#### `getHistory()`

Retrieves chat history for the current device/user.

```javascript
const { sessions } = await getHistory()
```

#### `getMessages(sessionId)`

Retrieves messages for a specific session.

```javascript
const { sessionHistory } = await getMessages('session-id')
```

---

### Call Functions

#### `setCallCallbacks(callbacks)`

Sets callback functions for call events.

```javascript
setCallCallbacks({
  onCallStatus: (status: string) => void,
  onCallError: (error: string | null) => void
})
```

#### `startCall(payload?)`

Initiates a WebRTC voice call.

```javascript
await startCall({
  sessionId?: string  // Optional: Associate with existing chat session
})
```

#### `disconnectCall()`

Ends the current voice call and cleans up resources.

```javascript
disconnectCall()
```

#### `toggleMute()`

Toggles microphone mute state.

```javascript
const isMuted = toggleMute() // Returns: boolean
```

#### `getLocalStream()`

Returns the local MediaStream for the current call.

```javascript
const stream = getLocalStream() // Returns: MediaStream | null
```

#### `getInboundAudioEnergy()`

Gets the total audio energy of the inbound audio stream (useful for visualizations).

```javascript
const energy = await getInboundAudioEnergy() // Returns: number
```

#### `getOutboundAudioEnergy()`

Gets the total audio energy of the outbound audio stream.

```javascript
const energy = await getOutboundAudioEnergy() // Returns: number
```

---

### Constants

#### `MESSAGE_ROLES`

Enum for message roles in the chat.

```javascript
import { MESSAGE_ROLES } from '@origonai/web-chat-sdk'

MESSAGE_ROLES.BOT // 'assistant' - AI/bot responses
MESSAGE_ROLES.USER // 'user' - End user messages
MESSAGE_ROLES.AGENT // 'agent' - Human agent messages
MESSAGE_ROLES.SYSTEM // 'system' - System notifications
```

---

## Types

### Message

```typescript
interface Message {
  id?: string
  text: string
  html?: string
  role: 'assistant' | 'user' | 'agent' | 'system'
  timestamp?: string
  loading?: boolean
  done?: boolean
  errorText?: string
  video?: object // YouTube video data
  channel?: string
}
```

### ChatCallbacks

```typescript
interface ChatCallbacks {
  onMessageAdd?: (message: Message) => void
  onMessageUpdate?: (index: number, updatedMsg: Message) => void
  onTyping?: (isTyping: boolean) => void
  onLiveAgentMode?: (isLiveAgent: boolean) => void
  onSessionUpdate?: (sessionId: string) => void
}
```

### CallCallbacks

```typescript
interface CallCallbacks {
  onCallStatus?: (status: 'connecting' | 'connected' | 'disconnected' | 'error') => void
  onCallError?: (error: string | null) => void
}
```

---

## Advanced Usage

### Resuming a Previous Session

```javascript
// Get session from history
const { sessions } = await getHistory()
const previousSession = sessions[0]

// Resume the session
const { messages } = await startChat({
  sessionId: previousSession.sessionId
})
```

### Authenticated Users

```javascript
initialize({
  endpoint: 'https://your-endpoint.com/api/chat',
  token: 'your-jwt-token',
  externalId: 'user-123'
})
```

### Combining Chat and Voice

```javascript
import {
  initialize,
  startChat,
  sendMessage,
  startCall,
  disconnectCall,
  setCallbacks,
  setCallCallbacks
} from '@origonai/web-chat-sdk'

// Set up both chat and call callbacks
setCallbacks({
  onMessageAdd: (message) => addMessageToUI(message),
  onMessageUpdate: (index, updatedMsg) => updateMessageInUI(index, updatedMsg),
  onSessionUpdate: (sessionId) => saveSession(sessionId)
})

setCallCallbacks({
  onCallStatus: (status) => updateCallUI(status)
})

initialize({ endpoint: 'https://your-endpoint.com/api/chat' })

// Start chat
const { sessionId } = await startChat()

// Later, start a voice call in the same session
await startCall({ sessionId })

// Messages and voice share the same session
await sendMessage({ text: 'Can you hear me?' })
```

### Audio Visualization

```javascript
// Create an audio level meter
async function updateAudioLevel() {
  try {
    const inbound = await getInboundAudioEnergy()
    const outbound = await getOutboundAudioEnergy()

    updateVisualization({ inbound, outbound })
  } catch (e) {
    // Handle no active call
  }
}

setInterval(updateAudioLevel, 100)
```

---

## Browser Support

- Chrome 80+
- Firefox 78+
- Safari 14+
- Edge 80+

Voice calls require WebRTC support and microphone permissions.

---

## License

MIT © Origon
