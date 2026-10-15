import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

/**
 * VITE_API_URL is inlined into the bundle at build time (src/lib/api.ts), and
 * without it the deployed app quietly points at http://localhost:4000 — it
 * loads, then shows "API unreachable". On Vercel that is always a mistake, so
 * fail the build and say what to set; anywhere else keep it to a warning,
 * because a local `npm run build` may legitimately target the dev API.
 */
export default defineConfig(({ command, mode }) => {
  const apiUrl = process.env.VITE_API_URL ?? loadEnv(mode, process.cwd(), 'VITE_').VITE_API_URL
  if (command === 'build' && !apiUrl) {
    const detail =
      'VITE_API_URL is not set — the built app would call http://localhost:4000. ' +
      'Set it to the deployed API URL and rebuild (Vercel: Project → Settings → Environment Variables → Production).'
    if (process.env.VERCEL) throw new Error(detail)
    console.warn(`warning: ${detail}`)
  }
  return {
    plugins: [react(), tailwindcss()],
  }
})
