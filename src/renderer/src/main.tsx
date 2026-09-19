import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import { App } from './App'
import { applyTheme, getStoredTheme } from './lib/theme'

applyTheme(getStoredTheme())

declare global {
  interface Window {
    __tttShowError?: (msg: string) => void
  }
}

const root = createRoot(document.getElementById('root')!, {
  // Without this an uncaught render error unmounts everything and leaves a blank window.
  onUncaughtError: (err, info) => {
    const e = err as Error
    console.error(err, info.componentStack)
    queueMicrotask(() => window.__tttShowError?.(`${e?.stack ?? String(err)}\n${info.componentStack ?? ''}`))
  }
})
root.render(
  <StrictMode>
    <App />
  </StrictMode>
)
