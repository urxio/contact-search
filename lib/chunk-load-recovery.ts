const CHUNK_ERROR_PATTERNS = [
  /ChunkLoadError/i,
  /Loading chunk \d+ failed/i,
  /Failed to fetch dynamically imported module/i,
  /Importing a module script failed/i,
]

export function isChunkLoadError(error: Pick<Error, "name" | "message">) {
  const detail = `${error.name} ${error.message}`
  return CHUNK_ERROR_PATTERNS.some((pattern) => pattern.test(detail))
}

export function chunkReloadStorageKey(pathname: string) {
  return `name-search:chunk-reload:${pathname}`
}
