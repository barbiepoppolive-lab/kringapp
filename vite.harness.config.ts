/**
 * Screenshot-harness build only (tot-harness.html → src/v8/totHarness.tsx), kept apart from vite.config.ts so the
 * harness page can never be emitted into dist/ or deployed. Build it with:
 *   npx vite build --config vite.harness.config.ts --outDir <somewhere outside the repo>
 */
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  base: './',
  define: { __KR8_RELEASE__: JSON.stringify('kring-web@harness') },
  plugins: [react()],
  build: {
    sourcemap: false,
    emptyOutDir: true,
    rollupOptions: { input: { harness: 'tot-harness.html' } },
  },
})
