import { normalizeSurname, validSurname } from "@/lib/surname-countries"

export type OriginSource = { title: string; url: string }
export type SurnameOrigin = { country: string; explanation: string; sources: OriginSource[] }
export type SurnameOriginEntry = {
  surname: string
  origins: SurnameOrigin[]
  researchedAt: string
}

type WebOutput = {
  status?: unknown
  usage?: { server_tool_use?: { web_search_requests?: unknown } }
  output?: Array<{
    type?: unknown
    action?: { sources?: Array<{ url?: unknown; title?: unknown }> }
    annotations?: Array<{ type?: unknown; url?: unknown; title?: unknown }>
    content?: Array<{ type?: unknown; text?: unknown; annotations?: Array<{ type?: unknown; url?: unknown; title?: unknown }> }>
  }>
}

function safeUrl(value: unknown): string | null {
  if (typeof value !== "string" || value.length > 2048) return null
  try {
    const url = new URL(value)
    if (url.protocol !== "https:" && url.protocol !== "http:") return null
    url.hash = ""
    return url.toString()
  } catch { return null }
}

function parseJsonAnswer(text: string): unknown {
  try { return JSON.parse(text) } catch { /* Some providers append prose after JSON. */ }
  const start = text.indexOf("{")
  if (start < 0) throw new Error("Invalid origin research answer")
  let depth = 0
  let quoted = false
  let escaped = false
  for (let index = start; index < text.length; index += 1) {
    const character = text[index]
    if (quoted) {
      if (escaped) escaped = false
      else if (character === "\\") escaped = true
      else if (character === '"') quoted = false
    } else if (character === '"') quoted = true
    else if (character === "{") depth += 1
    else if (character === "}" && --depth === 0) {
      try { return JSON.parse(text.slice(start, index + 1)) }
      catch { throw new Error("Invalid origin research answer") }
    }
  }
  throw new Error("Invalid origin research answer")
}

export function parseOriginResponse(response: WebOutput): SurnameOrigin[] {
  if (response.status !== "completed" || !Array.isArray(response.output)) throw new Error("Incomplete origin research")
  const searchCalls = response.output.filter((item) => item.type === "web_search_call" || item.type === "openrouter:web_search")
  if (!searchCalls.length && !(Number(response.usage?.server_tool_use?.web_search_requests) > 0)) {
    throw new Error("Origin research did not search the web")
  }

  const cited = new Map<string, OriginSource>()
  for (const call of searchCalls) {
    for (const source of call.action?.sources ?? []) {
      const url = safeUrl(source.url)
      if (url) cited.set(url, { url, title: typeof source.title === "string" ? source.title.slice(0, 160) : new URL(url).hostname })
    }
  }
  const textParts: string[] = []
  for (const item of response.output) {
    if (item.type !== "message") continue
    for (const annotation of item.annotations ?? []) {
      if (annotation.type !== "url_citation") continue
      const url = safeUrl(annotation.url)
      if (url) cited.set(url, { url, title: typeof annotation.title === "string" ? annotation.title.slice(0, 160) : new URL(url).hostname })
    }
    for (const content of item.content ?? []) {
      if (content.type !== "output_text" || typeof content.text !== "string") continue
      textParts.push(content.text)
      for (const annotation of content.annotations ?? []) {
        if (annotation.type !== "url_citation") continue
        const url = safeUrl(annotation.url)
        if (url) cited.set(url, { url, title: typeof annotation.title === "string" ? annotation.title.slice(0, 160) : new URL(url).hostname })
      }
    }
  }
  if (!textParts.length) throw new Error("Origin research returned no answer")
  const parsed = parseJsonAnswer(textParts.join("\n"))
  const candidates = (parsed as { origins?: unknown } | null)?.origins
  if (!Array.isArray(candidates)) throw new Error("Invalid origin research answer")

  const seen = new Set<string>()
  const origins: SurnameOrigin[] = []
  for (const candidate of candidates) {
    if (!candidate || typeof candidate !== "object") continue
    const country = typeof candidate.country === "string" ? candidate.country.trim().slice(0, 80) : ""
    const explanation = typeof candidate.explanation === "string" ? candidate.explanation.trim().slice(0, 500) : ""
    if (!country || !explanation || seen.has(country.toLocaleLowerCase("en"))) continue
    const urls: unknown[] = Array.isArray(candidate.source_urls) ? candidate.source_urls
      : Array.isArray(candidate.sources) ? candidate.sources : []
    const sources = Array.from(new Set(urls.map(safeUrl).filter((url): url is string => Boolean(url))))
      .map((url) => cited.get(url)).filter((source): source is OriginSource => Boolean(source)).slice(0, 3)
    if (!sources.length) continue
    seen.add(country.toLocaleLowerCase("en"))
    origins.push({ country, explanation, sources })
    if (origins.length === 2) break
  }
  return origins
}

export { normalizeSurname, validSurname }
