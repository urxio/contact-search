"use client"

import { ThemeProvider as NextThemesProvider } from "next-themes"
import type { ThemeProviderProps } from "next-themes"
import { useEffect, useState } from "react"

export function EnhancedThemeProvider({ children, ...props }: ThemeProviderProps) {
  const [mounted, setMounted] = useState(false)

  // Prevent flash of unstyled content
  useEffect(() => {
    setMounted(true)
  }, [])

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

  if (!mounted) {
    return <>{children}</>
  }

  return <NextThemesProvider {...props}>{children}</NextThemesProvider>
}
