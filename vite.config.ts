import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { readFileSync } from 'fs'

const tauriConf = JSON.parse(readFileSync('src-tauri/tauri.conf.json', 'utf-8'))

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    // Yjs decides what a shared type is with `instanceof`, so two module
    // instances of it make `value instanceof Y.Text` false for a perfectly
    // good Y.Text — text would read back as empty and nothing would say why.
    // One copy is installed; this keeps Vite from pre-bundling a second
    // instance for a dependency that imports it.
    dedupe: ['yjs', 'y-protocols'],
  },
  server: {
    // Fixed, and away from Vite's default 5173 because the desktop shell loads
    // this port by URL (`devUrl` in src-tauri/tauri.conf.json). On the default
    // port, any other Vite project already running takes 5173, Atelier
    // silently moves to 5174, and `tauri:dev` then shows the *other* project's
    // app in the Atelier window with no error. strictPort turns that into a
    // failure to start instead.
    port: 1420,
    strictPort: true,
    // The hosted server runs separately in development. Proxying these two
    // paths to it means the editor talks to the same origin it will in
    // production, so session cookies and the document socket behave the same
    // here as they do there rather than needing CORS only in development.
    proxy: {
      "/api": { target: "http://localhost:3006", changeOrigin: false },
      "/sync": { target: "http://localhost:3006", ws: true, changeOrigin: false },
    },
  },
  define: {
    __APP_VERSION__: JSON.stringify(tauriConf.version),
  },
  build: {
    chunkSizeWarningLimit: 1500,
  },
})
