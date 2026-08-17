import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { readFileSync } from 'fs'

const tauriConf = JSON.parse(readFileSync('src-tauri/tauri.conf.json', 'utf-8'))

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    // Fixed, and away from Vite's default 5173 because the desktop shell loads
    // this port by URL (`devUrl` in src-tauri/tauri.conf.json). On the default
    // port, any other Vite project already running takes 5173, Atelier
    // silently moves to 5174, and `tauri:dev` then shows the *other* project's
    // app in the Atelier window with no error. strictPort turns that into a
    // failure to start instead.
    port: 1420,
    strictPort: true,
  },
  define: {
    __APP_VERSION__: JSON.stringify(tauriConf.version),
  },
  build: {
    chunkSizeWarningLimit: 1500,
  },
})
