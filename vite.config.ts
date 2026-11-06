import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// `tauri android dev` su un telefono vero imposta TAURI_DEV_HOST con l'IP del PC: il server di Vite deve
// ascoltare lì e l'HMR passa da una porta a parte. Senza la variabile (desktop, emulatore) resta su localhost.
const host = process.env.TAURI_DEV_HOST

export default defineConfig({
  plugins: [react(), tailwindcss()],

  server: {
    // La stessa di `devUrl` in tauri.conf.json: se è occupata meglio fermarsi che aprirne un'altra.
    port: 5173,
    strictPort: true,
    host: host || false,
    hmr: host ? { protocol: 'ws', host, port: 1421 } : undefined,
    watch: {
      ignored: ['**/src-tauri/**'],
    },
  },
})
