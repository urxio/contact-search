"use client"

import { useEffect } from "react"
import { SEARCH_ACTIVITY_BUCKET_MS, SEARCH_ACTIVITY_IDLE_MS, searchActivityBucketStart } from "@/lib/search-activity"

const SAMPLE_MS = 5_000

type PendingBucket = { seconds: number; sentSeconds: number }

export function useSearchActivity(slug?: string) {
  useEffect(() => {
    if (!slug) return
    const workspaceSlug = slug
    const buckets = new Map<number, PendingBucket>()
    let lastInteraction = Date.now()
    let lastSample = Date.now()
    let disposed = false

    const markInteraction = () => { lastInteraction = Date.now() }
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

    function addElapsed(startedAt: number, endedAt: number) {
      let cursor = startedAt
      while (cursor < endedAt) {
        const bucketStartedAt = searchActivityBucketStart(cursor)
        const bucketEndsAt = bucketStartedAt + SEARCH_ACTIVITY_BUCKET_MS
        const seconds = Math.min(endedAt, bucketEndsAt) - cursor
        const bucket = buckets.get(bucketStartedAt) ?? { seconds: 0, sentSeconds: 0 }
        bucket.seconds = Math.min(30, bucket.seconds + seconds / 1000)
        buckets.set(bucketStartedAt, bucket)
        cursor += seconds
      }
    }

    function sample() {
      const now = Date.now()
      if (document.visibilityState === "visible" && document.hasFocus()) {
        const eligibleUntil = lastInteraction + SEARCH_ACTIVITY_IDLE_MS
        addElapsed(lastSample, Math.max(lastSample, Math.min(now, eligibleUntil)))
      }
      lastSample = now
      flush(false)
    }

    function pauseAndFlush() {
      sample()
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
