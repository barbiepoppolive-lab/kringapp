import '@testing-library/jest-dom/vitest'
import { cleanup } from '@testing-library/react'
import { afterEach, beforeAll } from 'vitest'

if (typeof window !== 'undefined') {
  window.scrollTo = () => {}
}

afterEach(() => {
  cleanup()
})

// 16 Nov perf 2: zh/hi/ja/ko V5 strings are separate lazy files in the app; tests see every language from the start.
import { loadV5Lang } from '../v8/v5Strings'
beforeAll(async () => { await Promise.all(['zh', 'hi', 'ja', 'ko'].map((l) => loadV5Lang(l))) })
