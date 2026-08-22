"use client"

import { useEffect } from "react"
import { SEARCH_ACTIVITY_BUCKET_MS, SEARCH_ACTIVITY_IDLE_MS, searchActivityBucketStart, searchActivityQualifies } from "@/lib/search-activity"

const SAMPLE_MS = 5_000

type PendingBucket = { seconds: number; sentSeconds: number }

export function useSearchActivity(slug?: string) {
  useEffect(() => {
    if (!slug) return
    const workspaceSlug = slug
    const buckets = new Map<number, PendingBucket>()
    let lastInteraction = Date.now()
    let lastSample = Date.now()
    let wasActive = false
    let disposed = false

    const markInteraction = () => { lastInteraction = Date.now() }
    const isActive = () => searchActivityQualifies({ visibilityState: document.visibilityState, focused: document.hasFocus(), lastInteractionAt: lastInteraction })

    function sendBucket(bucketStartedAt: number, bucket: PendingBucket) {
      if (bucket.seconds <= bucket.sentSeconds) return
      const activeSeconds = Math.min(30, Math.max(1, Math.round(bucket.seconds)))
      bucket.sentSeconds = activeSeconds
      fetch(`/api/c/${encodeURIComponent(workspaceSlug)}/stats/activity`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ bucketStartedAt: new Date(bucketStartedAt).toISOString(), activeSeconds }),
        keepalive: true,
      }).catch(() => {
        if (!disposed) bucket.sentSeconds = 0
      })
    }

    function flush(force = false) {
      const currentBucket = searchActivityBucketStart(Date.now())
      for (const [startedAt, bucket] of buckets) {
        if (force || startedAt < currentBucket) sendBucket(startedAt, bucket)
        if (startedAt < currentBucket - SEARCH_ACTIVITY_IDLE_MS) buckets.delete(startedAt)
      }
    }

    function sample() {
      const now = Date.now()
      const active = isActive()
      if (active && wasActive) {
        const elapsed = Math.min(SAMPLE_MS / 1000, Math.max(0, (now - lastSample) / 1000))
        const midpoint = now - elapsed * 500
        const bucketStartedAt = searchActivityBucketStart(midpoint)
        const bucket = buckets.get(bucketStartedAt) ?? { seconds: 0, sentSeconds: 0 }
        bucket.seconds = Math.min(30, bucket.seconds + elapsed)
        buckets.set(bucketStartedAt, bucket)
      }
      wasActive = active
      lastSample = now
      flush(false)
    }

    function pauseAndFlush() {
      sample()
      wasActive = false
      flush(true)
    }

    const interactionEvents: Array<keyof WindowEventMap> = ["pointerdown", "keydown", "scroll"]
    interactionEvents.forEach((event) => window.addEventListener(event, markInteraction, { passive: true }))
    window.addEventListener("blur", pauseAndFlush)
    window.addEventListener("pagehide", pauseAndFlush)
    document.addEventListener("visibilitychange", pauseAndFlush)
    const timer = window.setInterval(sample, SAMPLE_MS)

    return () => {
      disposed = true
      window.clearInterval(timer)
      pauseAndFlush()
      interactionEvents.forEach((event) => window.removeEventListener(event, markInteraction))
      window.removeEventListener("blur", pauseAndFlush)
      window.removeEventListener("pagehide", pauseAndFlush)
      document.removeEventListener("visibilitychange", pauseAndFlush)
    }
  }, [slug])
}
