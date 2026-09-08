import { Fragment } from "react"

type Props = { content: string; className?: string }

function safeUrl(value: string, image = false) {
  if (image && /^data:image\/(?:png|jpeg|webp);base64,[a-z0-9+/=]+$/i.test(value)) return value
  if (image) return null
  try {
    const url = new URL(value)
    return url.protocol === "https:" || (!image && url.protocol === "mailto:") ? url.toString() : null
  } catch { return null }
}

function inline(text: string) {
  const parts = text.split(/(!?\[[^\]]*\]\([^)]*\)|\*\*[^*]+\*\*|__[^_]+__|\*[^*]+\*|_[^_]+_)/g)
  return parts.map((part, index) => {
    const image = part.match(/^!\[([^\]]*)\]\(([^)]*)\)$/)
    if (image) {
      const src = safeUrl(image[2], true)
      return src ? <img key={index} src={src} alt={image[1]} className="my-3 max-h-80 rounded-md border object-contain" loading="lazy" /> : part
    }
    const link = part.match(/^\[([^\]]+)\]\(([^)]*)\)$/)
    if (link) {
      const href = safeUrl(link[2])
      return href ? <a key={index} href={href} target="_blank" rel="noreferrer" className="text-primary underline underline-offset-2">{link[1]}</a> : part
    }
    if ((part.startsWith("**") && part.endsWith("**")) || (part.startsWith("__") && part.endsWith("__"))) return <strong key={index}>{part.slice(2, -2)}</strong>
    if ((part.startsWith("*") && part.endsWith("*")) || (part.startsWith("_") && part.endsWith("_"))) return <em key={index}>{part.slice(1, -1)}</em>
    return <Fragment key={index}>{part}</Fragment>
  })
}

/** Renders the small, intentionally safe Markdown subset supported by the editor. */
export function InstructionContent({ content, className }: Props) {
  const lines = content.split(/\r?\n/)
  const nodes: React.ReactNode[] = []
  let list: string[] = []
  const flushList = () => { if (list.length) { nodes.push(<ul key={`list-${nodes.length}`} className="my-2 list-disc space-y-1 pl-5">{list.map((item, index) => <li key={index}>{inline(item)}</li>)}</ul>); list = [] } }

  lines.forEach((line, index) => {
    const heading = line.match(/^(#{1,3})\s+(.+)$/)
    const item = line.match(/^[-*]\s+(.+)$/)
    if (item) { list.push(item[1]); return }
    flushList()
    if (!line.trim()) { nodes.push(<div key={`space-${index}`} className="h-3" />); return }
    if (heading) {
      const Heading = heading[1].length === 1 ? "h3" : heading[1].length === 2 ? "h4" : "h5"
      nodes.push(<Heading key={index} className="mt-3 font-semibold first:mt-0">{inline(heading[2])}</Heading>)
      return
    }
    nodes.push(<p key={index} className="min-h-5">{inline(line)}</p>)
  })
  flushList()
  return <div className={className}>{nodes}</div>
}
