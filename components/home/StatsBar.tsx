"use client"

import { CheckCircle2, XCircle, CircleSlash, Globe } from "lucide-react"

interface StatsBarProps {
  total: number
  notChecked: number
  potentiallyFrench: number
  notFrench: number
  detected: number
}

export function StatsBar({ total, notChecked, potentiallyFrench, notFrench, detected }: StatsBarProps) {
  const checkedPct = total > 0
    ? Math.round(((potentiallyFrench + notFrench + detected) / total) * 100)
    : 0

  return (
    <div className="mb-6 rounded-2xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 shadow-sm overflow-hidden">
      {/* Header row with progress */}
      <div className="flex items-center justify-between px-5 py-3 border-b border-gray-100 dark:border-gray-800">
        <span className="text-sm font-semibold text-gray-700 dark:text-gray-300">Statistics</span>
        <div className="flex items-center gap-2.5">
          <div className="w-20 h-0.5 bg-gray-100 dark:bg-gray-800 rounded-full overflow-hidden">
            <div
              className="h-full bg-gradient-to-r from-indigo-500 to-purple-500 rounded-full transition-all duration-500"
              style={{ width: `${checkedPct}%` }}
            />
          </div>
          <span className="text-xs font-semibold text-gray-500 dark:text-gray-400 tabular-nums w-8 text-right">{checkedPct}%</span>
          <span className="text-xs text-gray-400">checked</span>
        </div>
      </div>

      {/* Stat tiles */}
      <div className="grid grid-cols-2 sm:grid-cols-4 divide-x divide-y sm:divide-y-0 divide-gray-100 dark:divide-gray-800">
        <div className="flex items-center gap-3 px-5 py-4">
          <div className="h-9 w-9 rounded-xl bg-blue-50 dark:bg-blue-900/20 flex items-center justify-center shrink-0">
            <XCircle className="h-4.5 w-4.5 text-blue-500" />
          </div>
          <div>
            <p className="text-2xl font-bold text-gray-900 dark:text-white leading-none">{notChecked}</p>
            <p className="text-xs text-gray-400 mt-0.5">Not Checked</p>
          </div>
        </div>

        <div className="flex items-center gap-3 px-5 py-4">
          <div className="h-9 w-9 rounded-xl bg-green-50 dark:bg-green-900/20 flex items-center justify-center shrink-0">
            <CheckCircle2 className="h-4.5 w-4.5 text-green-500" />
          </div>
          <div>
            <p className="text-2xl font-bold text-gray-900 dark:text-white leading-none">{potentiallyFrench}</p>
            <p className="text-xs text-gray-400 mt-0.5">Pot. French</p>
          </div>
        </div>

        <div className="flex items-center gap-3 px-5 py-4">
          <div className="h-9 w-9 rounded-xl bg-red-50 dark:bg-red-900/20 flex items-center justify-center shrink-0">
            <CircleSlash className="h-4.5 w-4.5 text-red-500" />
          </div>
          <div>
            <p className="text-2xl font-bold text-gray-900 dark:text-white leading-none">{notFrench}</p>
            <p className="text-xs text-gray-400 mt-0.5">Not French</p>
          </div>
        </div>

        <div className="flex items-center gap-3 px-5 py-4">
          <div className="h-9 w-9 rounded-xl bg-yellow-50 dark:bg-yellow-900/20 flex items-center justify-center shrink-0">
            <Globe className="h-4.5 w-4.5 text-yellow-500" />
          </div>
          <div>
            <p className="text-2xl font-bold text-gray-900 dark:text-white leading-none">{detected}</p>
            <p className="text-xs text-gray-400 mt-0.5">Detected</p>
          </div>
        </div>
      </div>
    </div>
  )
}
