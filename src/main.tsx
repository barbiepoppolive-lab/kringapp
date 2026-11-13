import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App'
import { bootstrapTheme } from './lib/theme'
import './design/fonts.css'
import './design/tokens.css'
import './design/floating.css'
import './index.css'
import { installFloatingVisibility } from './design/floating'

// OPUS-A6: restore persisted 🌙 Tonight Mode before first paint (no daylight flash on reload / PWA relaunch)
bootstrapTheme()
installFloatingVisibility()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
