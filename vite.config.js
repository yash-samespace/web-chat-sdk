import { defineConfig } from 'vite'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { dirname } from 'node:path'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

export default defineConfig({
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    lib: {
      entry: resolve(__dirname, 'src/index.js'),
      name: 'OrigonChatSDK',
      formats: ['es'],
      fileName: () => 'origon-chat-sdk.js'
    },
    rollupOptions: {
      // External dependencies that shouldn't be bundled
      external: ['@microsoft/fetch-event-source']
    },
    target: 'es2018',
    sourcemap: true,
    minify: 'esbuild'
  }
})
