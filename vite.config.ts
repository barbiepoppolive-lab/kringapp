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

/** J1: one version string per build, baked into the bundle and written to /app/version.json (served no-cache). */
const RELEASE = 'kring-web@' + new Date().toISOString().slice(0, 16).replace(/[-:T]/g, '')
function kringVersionFile(): Plugin {
  return {
    name: 'kring-version-file',
    apply: 'build',
    generateBundle() {
      this.emitFile({ type: 'asset', fileName: 'version.json', source: JSON.stringify({ v: RELEASE }) + '\n' })
    },
  }
}

/** 0081 instant face check: the wasm runtimes are served from /app/models/ (self-hosted, same version as the npm packages, never a
 *  CDN): MediaPipe's from models/mp/wasm/, onnxruntime-web's from models/ort/. Copied from node_modules at build time; the dev
 *  server serves them from there too. */
const WASM_FILES: Record<string, string> = {
  'models/mp/wasm/vision_wasm_internal.js': '@mediapipe/tasks-vision/wasm/vision_wasm_internal.js',
  'models/mp/wasm/vision_wasm_internal.wasm': '@mediapipe/tasks-vision/wasm/vision_wasm_internal.wasm',
  'models/mp/wasm/vision_wasm_nosimd_internal.js': '@mediapipe/tasks-vision/wasm/vision_wasm_nosimd_internal.js',
  'models/mp/wasm/vision_wasm_nosimd_internal.wasm': '@mediapipe/tasks-vision/wasm/vision_wasm_nosimd_internal.wasm',
  'models/ort/ort-wasm-simd-threaded.mjs': 'onnxruntime-web/dist/ort-wasm-simd-threaded.mjs',
  'models/ort/ort-wasm-simd-threaded.wasm': 'onnxruntime-web/dist/ort-wasm-simd-threaded.wasm',
}
function kringFaceWasm(): Plugin {
  const src = (k: string) => new URL('./node_modules/' + WASM_FILES[k], import.meta.url)
  return {
    name: 'kring-face-wasm',
    async generateBundle() {
      const { readFile } = await import('node:fs/promises')
      for (const k of Object.keys(WASM_FILES)) this.emitFile({ type: 'asset', fileName: k, source: await readFile(src(k)) })
    },
    configureServer(server) {
      server.middlewares.use(async (req, res, next) => {
        const path = (req.url || '').split('?')[0]
        const k = Object.keys(WASM_FILES).find((f) => path.endsWith('/' + f))
        if (!k) return next()
        const { readFile } = await import('node:fs/promises')
        res.setHeader('Content-Type', k.endsWith('.wasm') ? 'application/wasm' : 'text/javascript')
        res.end(await readFile(src(k)))
      })
    },
  }
}

export default defineConfig({
  define: { __KR8_RELEASE__: JSON.stringify(RELEASE) },
  plugins: [react(), kringNoindex(), kringVersionFile(), kringFaceWasm()],
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
          // Vite's own dynamic-import helper must live in the always-loaded vendor chunk. Left to Rollup it landed in the 770 kB
          // "pdf" chunk, so every visitor downloaded jsPDF on the first screen (audit 15 Nov, finding 5).
          if (id.includes('vite/preload-helper') || id.includes('commonjsHelpers')) return 'vendor'
          // supabase-js is only fetched when V5 live sign-in is on (VITE_AUTH_LIVE=1), so keep it out of the eager vendor chunk
          if (id.includes('node_modules/@supabase/')) return 'supabase'
          // LIFF SDK: only fetched in a LIFF open (VITE_LIFF_ID builds), never in the eager vendor chunk
          if (/node_modules\/(@line|@liff|whatwg-fetch|tiny-sha256)\//.test(id)) return 'liff'
          // on-device face check: only downloaded when a member starts "Get verified"
          if (id.includes('node_modules/@vladmandic/')) return 'faceapi'
          if (id.includes('node_modules/@mediapipe/')) return 'mediapipe'
          if (/node_modules\/(onnxruntime-web|onnxruntime-common)\//.test(id)) return 'ort'
          // print files (stand.html only): jsPDF and its optional helpers stay out of the app's vendor chunk
          if (/node_modules\/(jspdf|html2canvas|dompurify|canvg|fflate|fast-png|iobuffer|pako|core-js|raf|rgbcolor|stackblur-canvas|svg-pathdata|performance-now|@babel\/runtime)\//.test(id)) return 'pdf'
          // K-006 (18 Nov): mediabunny (Reel trim/transcode, 8 MB source) is only used by the Reel composer (lazy reelTranscode.ts),
          // and Sentry is loaded after the first screen (lib/sentryLazy.ts). Both were swept into the eager vendor chunk below.
          if (id.includes('node_modules/mediabunny/')) return 'mediabunny'
          if (id.includes('node_modules/@sentry/') || id.includes('node_modules/@sentry-internal/')) return 'sentry'
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
