"use client"

import { ThemeProvider as NextThemesProvider } from "next-themes"
import type { ThemeProviderProps } from "next-themes"
import { useEffect } from "react"

export function EnhancedThemeProvider({ children, ...props }: ThemeProviderProps) {
  // Add a class to the body when dark mode is active
  useEffect(() => {
    const observer = new MutationObserver((mutations) => {
      mutations.forEach((mutation) => {
        if (
          mutation.type === "attributes" &&
          mutation.attributeName === "class" &&
          mutation.target instanceof HTMLElement
        ) {
          const isDark = mutation.target.classList.contains("dark")
          document.body.classList.toggle("dark-theme-active", isDark)
        }
      })
    })

    observer.observe(document.documentElement, { attributes: true })

    return () => observer.disconnect()
  }, [])

  // Always render the provider: swapping it in after mount changed the tree
  // shape and remounted the whole app (re-running every effect and fetch).
  return <NextThemesProvider {...props}>{children}</NextThemesProvider>
}
