"use client"

import { useEffect, useState } from "react"

interface FloatingProgressProps {
  total: number
  notChecked: number
  potentiallyFrench: number
  notFrench: number
  detected: number
}

export function FloatingProgress({
  total,
  notChecked,
  potentiallyFrench,
  notFrench,
  detected,
}: FloatingProgressProps) {
  const [scrollProgress, setScrollProgress] = useState(0)
  const [visible, setVisible] = useState(false)

  // Track scroll position for scroll progress indicator
  useEffect(() => {
    const handleScroll = () => {
      const scrollTop = window.scrollY
      const docHeight = document.documentElement.scrollHeight - window.innerHeight
      const progress = docHeight > 0 ? (scrollTop / docHeight) * 100 : 0
      setScrollProgress(Math.min(progress, 100))
      setVisible(scrollTop > 80)
    }
    window.addEventListener("scroll", handleScroll, { passive: true })
    return () => window.removeEventListener("scroll", handleScroll)
  }, [])

  if (total === 0 || !visible) return null

  const segments = [
    {
      label: "Potentially French",
      count: potentiallyFrench,
      color: "bg-green-500",
      dot: "bg-green-500",
    },
    {
      label: "Detected",
      count: detected,
      color: "bg-purple-500",
      dot: "bg-purple-500",
    },
    {
      label: "Not French",
      count: notFrench,
      color: "bg-red-400",
      dot: "bg-red-400",
    },
    {
      label: "Not Checked",
      count: notChecked,
      color: "bg-gray-200 dark:bg-gray-700",
      dot: "bg-gray-400",
    },
  ]

  return (
    <div className="fixed right-4 top-1/2 -translate-y-1/2 z-50 flex flex-col items-center gap-3">
      {/* Card */}
      <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-xl shadow-xl p-1.5 flex flex-col items-center gap-2 w-8">

        {/* Scroll progress — thin vertical bar */}
        <div className="w-1.5 h-14 bg-gray-100 dark:bg-gray-800 rounded-full overflow-hidden">
          <div
            className="w-full bg-gradient-to-b from-blue-400 to-purple-500 rounded-full transition-all duration-150"
            style={{ height: `${scrollProgress}%` }}
          />
        </div>

        {/* Divider */}
        <div className="w-4 h-px bg-gray-200 dark:bg-gray-700" />

        {/* Status dots */}
        <div className="flex flex-col gap-1 items-center">
          {segments.map((seg) => (
            <div key={seg.label} className="group relative flex items-center justify-center">
              <div className={`w-1.5 h-1.5 rounded-full ${seg.dot}`} />
              {/* Tooltip on hover */}
              <div className="absolute right-full mr-2 hidden group-hover:flex items-center gap-1.5 bg-gray-900 dark:bg-gray-700 text-white text-xs rounded-lg px-2 py-1 whitespace-nowrap shadow-lg">
                <div className={`w-2 h-2 rounded-full ${seg.dot} flex-shrink-0`} />
                {seg.label}: <span className="font-semibold">{seg.count}</span>
              </div>
            </div>
          ))}
        </div>

        {/* Total */}
        <div className="text-[8px] font-medium text-gray-400 dark:text-gray-500 text-center leading-tight">
          {total}
        </div>
      </div>
    </div>
  )
}
