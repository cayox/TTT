import { useCallback, useEffect, useState } from 'react'

export type Theme = 'light' | 'dark' | 'system'
export type ResolvedTheme = 'light' | 'dark'

const KEY = 'ttt-theme'
const mq = () => window.matchMedia('(prefers-color-scheme: dark)')

export function resolveTheme(theme: Theme): ResolvedTheme {
  return theme === 'system' ? (mq().matches ? 'dark' : 'light') : theme
}

/** Sets data-theme on <html>. 'system' removes it so CSS follows prefers-color-scheme. */
export function applyTheme(theme: Theme): void {
  const el = document.documentElement
  if (theme === 'system') el.removeAttribute('data-theme')
  else el.setAttribute('data-theme', theme)
  el.dataset.themePref = theme
  window.dispatchEvent(new CustomEvent('ttt-theme', { detail: theme }))
}

export function getStoredTheme(): Theme {
  try {
    const v = localStorage.getItem(KEY)
    if (v === 'light' || v === 'dark' || v === 'system') return v
  } catch {
    /* ignore */
  }
  return 'system'
}

export function useTheme(initial?: Theme) {
  const [theme, setThemeState] = useState<Theme>(() => initial ?? getStoredTheme())
  const [resolved, setResolved] = useState<ResolvedTheme>(() => resolveTheme(theme))

  useEffect(() => {
    applyTheme(theme)
    setResolved(resolveTheme(theme))
    if (theme !== 'system') return
    const m = mq()
    const on = () => setResolved(m.matches ? 'dark' : 'light')
    m.addEventListener('change', on)
    return () => m.removeEventListener('change', on)
  }, [theme])

  const setTheme = useCallback((t: Theme) => {
    try {
      localStorage.setItem(KEY, t)
    } catch {
      /* ignore */
    }
    setThemeState(t)
  }, [])

  return { theme, resolved, setTheme }
}
