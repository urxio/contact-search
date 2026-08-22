export const SEARCH_ACTIVITY_BUCKET_MS = 30_000
export const SEARCH_ACTIVITY_IDLE_MS = 2 * 60_000

export function searchActivityQualifies(input: {
  visibilityState: DocumentVisibilityState
  focused: boolean
  lastInteractionAt: number
  now?: number
}) {
  const now = input.now ?? Date.now()
  return input.visibilityState === "visible" && input.focused && now - input.lastInteractionAt < SEARCH_ACTIVITY_IDLE_MS
}

export function searchActivityBucketStart(timestamp: number) {
  return Math.floor(timestamp / SEARCH_ACTIVITY_BUCKET_MS) * SEARCH_ACTIVITY_BUCKET_MS
}
