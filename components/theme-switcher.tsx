"use client"

import { useTheme } from "next-themes"
import { useEffect, useState } from "react"
import { Button } from "@/components/ui/button"
import { LightModeIcon, DarkModeIcon } from "@/components/theme-icons"
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip"

export function ThemeSwitcher() {
  const { theme, setTheme } = useTheme()
  const [mounted, setMounted] = useState(false)

  // Avoid hydration mismatch by only rendering after mount
  useEffect(() => {
    setMounted(true)
  }, [])

  if (!mounted) {
    return (
      <Button variant="outline" size="icon" className="w-9 h-9 rounded-full">
        <span className="sr-only">Toggle theme</span>
        <div className="h-5 w-5 bg-muted rounded-full animate-pulse" />
      </Button>
    )
  }

  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            variant="outline"
            size="icon"
            onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
            className="w-9 h-9 rounded-full transition-all duration-300 ease-in-out"
            aria-label={`Switch to ${theme === "dark" ? "light" : "dark"} mode`}
          >
            {theme === "dark" ? (
              <LightModeIcon className="h-5 w-5 text-yellow-400 transition-transform duration-300 ease-in-out hover:rotate-45" />
            ) : (
              <DarkModeIcon className="h-5 w-5 text-indigo-600 transition-transform duration-300 ease-in-out hover:rotate-12" />
            )}
            <span className="sr-only">Toggle theme</span>
          </Button>
        </TooltipTrigger>
        <TooltipContent side="bottom">
          <p>Switch to {theme === "dark" ? "light" : "dark"} mode</p>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  )
}
