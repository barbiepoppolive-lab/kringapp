/// <reference types="vitest/config" />
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import type { Plugin } from 'vite'

/** KRING_NOINDEX=1 (preview deploys such as /preview-6nov/) adds <meta name="robots" content="noindex,nofollow">. */
function kringNoindex(): Plugin {
  return {
    name: 'kring-noindex',
    transformIndexHtml(html) {
      const env = (globalThis as { process?: { env?: Record<string, string | undefined> } }).process?.env ?? {}
      if (env.KRING_NOINDEX !== '1') return html
      return html.replace('<meta charset="UTF-8" />', '<meta charset="UTF-8" />\n    <meta name="robots" content="noindex,nofollow" />')
    },
  }
}

export default defineConfig({
  define: { __KR8_RELEASE__: JSON.stringify('kring-web@' + new Date().toISOString().slice(0, 16).replace(/[-:T]/g, '')) },
  plugins: [react(), kringNoindex()],
  server: {
    allowedHosts: ['localhost', '127.0.0.1', 'kringapp.com', 'www.kringapp.com'],
    watch: {
      ignored: ['**/release-packages/**'],
    },
  },
  preview: {
    allowedHosts: ['localhost', '127.0.0.1', 'kringapp.com', 'www.kringapp.com'],
  },
  build: {
    sourcemap: false,
    minify: 'esbuild',
    rollupOptions: {
      input: { main: 'index.html', admin: 'admin.html', staff: 'staff.html', stand: 'stand.html', owner: 'owner.html', lineCallback: 'line-callback.html' },
      output: {
        manualChunks(id) {
          // supabase-js is only fetched when V5 live sign-in is on (VITE_AUTH_LIVE=1), so keep it out of the eager vendor chunk
          if (id.includes('node_modules/@supabase/')) return 'supabase'
          // on-device face check: only downloaded when a member starts "Get verified"
          if (id.includes('node_modules/@vladmandic/')) return 'faceapi'
          // print files (stand.html only): jsPDF and its optional helpers stay out of the app's vendor chunk
          if (/node_modules\/(jspdf|html2canvas|dompurify|canvg|fflate|fast-png|iobuffer|pako|core-js|raf|rgbcolor|stackblur-canvas|svg-pathdata|performance-now|@babel\/runtime)\//.test(id)) return 'pdf'
          if (id.includes('node_modules')) return 'vendor'
        },
      },
    },
  },
  esbuild: {
    legalComments: 'none',
  },
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./src/test/setup.ts'],
    testTimeout: 15000,
  },
})
