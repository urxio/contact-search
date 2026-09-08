"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import { ArrowDown, ArrowUp, Bold, Heading2, ImagePlus, Italic, Link, List, Pencil, Plus, Trash2 } from "lucide-react"
import { toast } from "sonner"
import type { CongregationInstruction } from "@/lib/congregation-instructions"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { InstructionContent } from "@/components/instructions/instruction-content"

type Props = { slug: string; initialInstructions: CongregationInstruction[]; canManage: boolean }

const dataImage = /^data:image\/(?:png|jpeg|webp);base64,[a-z0-9+/=]+$/i
const escapeHtml = (value: string) => value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;")

function markdownToEditorHtml(content: string) {
  return content.split(/\r?\n/).map((line) => line.split(/(!\[[^\]]*\]\(data:image\/(?:png|jpeg|webp);base64,[^)]+\))/gi).map((part) => {
    const image = part.match(/^!\[([^\]]*)\]\(([^)]*)\)$/)
    return image && dataImage.test(image[2]) ? `<img src="${image[2]}" alt="${escapeHtml(image[1])}" />` : escapeHtml(part)
  }).join("") || "<br />").join("<br />")
}

function editorToMarkdown(editor: HTMLElement) {
  const read = (node: Node): string => {
    if (node.nodeType === Node.TEXT_NODE) return node.textContent || ""
    if (!(node instanceof HTMLElement)) return ""
    if (node.tagName === "BR") return "\n"
    if (node.tagName === "IMG") return dataImage.test(node.getAttribute("src") || "") ? `![${node.getAttribute("alt") || "Instruction image"}](${node.getAttribute("src")})` : ""
    const text = Array.from(node.childNodes).map(read).join("")
    if (["B", "STRONG"].includes(node.tagName)) return `**${text}**`
    if (["I", "EM"].includes(node.tagName)) return `*${text}*`
    if (node.tagName === "LI") return `- ${text}\n`
    if (node.tagName === "A") { const href = node.getAttribute("href") || ""; return /^https:|^mailto:/.test(href) ? `[${text}](${href})` : text }
    if (/^H[1-3]$/.test(node.tagName)) return `## ${text}\n`
    if (["DIV", "P", "UL", "OL"].includes(node.tagName)) return `${text}\n`
    return text
  }
  return Array.from(editor.childNodes).map(read).join("").replace(/\n{3,}/g, "\n\n").trim()
}

export function CustomInstructions({ slug, initialInstructions, canManage }: Props) {
  const [instructions, setInstructions] = useState(initialInstructions)
  const [editing, setEditing] = useState<CongregationInstruction | null>(null)
  const [title, setTitle] = useState("")
  const [body, setBody] = useState("")
  const [busy, setBusy] = useState(false)
  const editorRef = useRef<HTMLDivElement | null>(null)
  const imageInputRef = useRef<HTMLInputElement>(null)

  const endpoint = `/api/c/${encodeURIComponent(slug)}/instructions`
  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    const instructionId = Number(params.get("instruction"))
    const revision = Number(params.get("revision"))
    if (!Number.isSafeInteger(instructionId) || instructionId < 1 || !Number.isSafeInteger(revision) || revision < 1) return
    void fetch(`${endpoint}/views`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ instructionId, revision }) })
  }, [endpoint])
  function openCreate() { setEditing({ id: 0, title: "", body: "", position: instructions.length, revision: 0 }); setTitle(""); setBody("") }
  function openEdit(instruction: CongregationInstruction) { setEditing(instruction); setTitle(instruction.title); setBody(instruction.body) }

  const setEditor = useCallback((element: HTMLDivElement | null) => {
    editorRef.current = element
    if (element && editing) element.innerHTML = markdownToEditorHtml(editing.body)
  }, [editing])

  function format(command: string, value?: string) { editorRef.current?.focus(); document.execCommand(command, false, value); if (editorRef.current) setBody(editorToMarkdown(editorRef.current)) }

  async function addImage(file: File) {
    if (!/image\/(png|jpeg|webp)/.test(file.type)) { toast.error("Choose a PNG, JPEG, or WebP image."); return }
    if (file.size > 10 * 1024 * 1024) { toast.error("Choose an image smaller than 10 MB."); return }
    try {
      const dataUrl = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader()
        reader.onload = () => typeof reader.result === "string" ? resolve(reader.result) : reject(new Error("Could not read image"))
        reader.onerror = () => reject(new Error("Could not read image"))
        reader.readAsDataURL(file)
      })
      const image = await new Promise<HTMLImageElement>((resolve, reject) => {
        const element = new Image()
        element.onload = () => resolve(element); element.onerror = () => reject(new Error("Could not process image")); element.src = dataUrl
      })
      const scale = Math.min(1, 1600 / Math.max(image.width, image.height))
      const canvas = document.createElement("canvas")
      canvas.width = Math.max(1, Math.round(image.width * scale)); canvas.height = Math.max(1, Math.round(image.height * scale))
      canvas.getContext("2d")?.drawImage(image, 0, 0, canvas.width, canvas.height)
      let compressed = canvas.toDataURL("image/webp", 0.82)
      for (let quality = 0.72; compressed.length > 500_000 && quality >= 0.42; quality -= 0.1) compressed = canvas.toDataURL("image/webp", quality)
      if (compressed.length > 500_000) throw new Error("This image is still too large after compression. Please choose a smaller image.")
      const alt = file.name.replace(/\.[^.]+$/, "").replace(/[\[\]()]/g, "").slice(0, 100) || "Instruction image"
      editorRef.current?.focus()
      document.execCommand("insertImage", false, compressed)
      if (editorRef.current) setBody(editorToMarkdown(editorRef.current))
      toast.success("Image added. Save the instruction to publish it.")
    } catch (error) { toast.error(error instanceof Error ? error.message : "Unable to add image") }
  }

  function uploadImage(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]
    event.target.value = ""
    if (file) void addImage(file)
  }

  function pasteImage(event: React.ClipboardEvent<HTMLDivElement>) {
    const item = [...event.clipboardData.items].find((candidate) => /image\/(png|jpeg|webp)/.test(candidate.type))
    const file = item?.getAsFile()
    if (!file) return
    event.preventDefault()
    void addImage(file)
  }

  async function save() {
    const instructionBody = editorRef.current ? editorToMarkdown(editorRef.current) : body
    if (!editing || !title.trim() || !instructionBody.trim()) return
    setBody(instructionBody)
    setBusy(true)
    try {
      const response = await fetch(endpoint, { method: editing.id ? "PATCH" : "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(editing.id ? { id: editing.id, title, body: instructionBody } : { title, body: instructionBody }) })
      const result = await response.json()
      if (!response.ok) throw new Error(result.error || "Unable to save instruction")
      setInstructions((current) => editing.id ? current.map((item) => item.id === editing.id ? result.instruction : item) : [...current, result.instruction])
      setEditing(null); toast.success(editing.id ? "Instruction updated." : "Instruction published.")
    } catch (error) { toast.error(error instanceof Error ? error.message : "Unable to save instruction") } finally { setBusy(false) }
  }

  async function reorder(next: CongregationInstruction[]) {
    const previous = instructions; setInstructions(next)
    try {
      const response = await fetch(endpoint, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ order: next.map((item) => item.id) }) })
      const result = await response.json()
      if (!response.ok) throw new Error(result.error || "Unable to reorder instructions")
      setInstructions(result.instructions)
    } catch (error) { setInstructions(previous); toast.error(error instanceof Error ? error.message : "Unable to reorder instructions") }
  }

  async function remove(instruction: CongregationInstruction) {
    if (!window.confirm(`Delete “${instruction.title}”?`)) return
    setBusy(true)
    try {
      const response = await fetch(`${endpoint}?id=${instruction.id}`, { method: "DELETE" })
      const result = await response.json()
      if (!response.ok) throw new Error(result.error || "Unable to delete instruction")
      setInstructions((current) => current.filter((item) => item.id !== instruction.id)); toast.success("Instruction deleted.")
    } catch (error) { toast.error(error instanceof Error ? error.message : "Unable to delete instruction") } finally { setBusy(false) }
  }

  return (
    <section className="max-w-4xl" aria-labelledby="congregation-instructions-heading">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div><h2 id="congregation-instructions-heading" className="text-xl font-semibold">Congregation instructions</h2><p className="mt-1 text-sm text-muted-foreground">Additional guidance from your congregation administrators.</p></div>
        {canManage ? <Button onClick={openCreate} className="gap-2"><Plus className="h-4 w-4" />Add instruction</Button> : null}
      </div>
      {instructions.length ? <div className="mt-5 space-y-4">{instructions.map((instruction, index) => <Card key={instruction.id} id={`instruction-${instruction.id}`} className={index === 0 ? "ring-1 ring-blue-400/50 shadow-[0_0_24px_rgba(59,130,246,0.16)]" : undefined}><CardHeader className="gap-2"><div className="flex items-start justify-between gap-3"><CardTitle className="text-base">{instruction.title}</CardTitle>{canManage ? <div className="flex shrink-0 gap-1"><Button aria-label={`Move ${instruction.title} up`} variant="ghost" size="icon" disabled={index === 0 || busy} onClick={() => void reorder([...instructions.slice(0, index - 1), instruction, instructions[index - 1], ...instructions.slice(index + 1)])}><ArrowUp className="h-4 w-4" /></Button><Button aria-label={`Move ${instruction.title} down`} variant="ghost" size="icon" disabled={index === instructions.length - 1 || busy} onClick={() => void reorder([...instructions.slice(0, index), instructions[index + 1], instruction, ...instructions.slice(index + 2)])}><ArrowDown className="h-4 w-4" /></Button><Button aria-label={`Edit ${instruction.title}`} variant="ghost" size="icon" disabled={busy} onClick={() => openEdit(instruction)}><Pencil className="h-4 w-4" /></Button><Button aria-label={`Delete ${instruction.title}`} variant="ghost" size="icon" className="text-destructive hover:text-destructive" disabled={busy} onClick={() => void remove(instruction)}><Trash2 className="h-4 w-4" /></Button></div> : null}</div><InstructionContent content={instruction.body} className="text-sm leading-6 text-muted-foreground" /></CardHeader></Card>)}</div> : <Card className="mt-5"><CardContent className="py-6 text-sm text-muted-foreground">{canManage ? "Add congregation-specific instructions for members here." : "There are no additional congregation instructions right now."}</CardContent></Card>}
      <Dialog open={Boolean(editing)} onOpenChange={(open) => { if (!open && !busy) setEditing(null) }}><DialogContent className="max-h-[calc(100dvh-2rem)] w-[calc(100%-2rem)] overflow-y-auto sm:max-w-2xl"><DialogHeader><DialogTitle>{editing?.id ? "Edit instruction" : "Add instruction"}</DialogTitle><DialogDescription>Format text, paste an image, or upload one from your device. Members will be notified when this is published or updated.</DialogDescription></DialogHeader><div className="space-y-4"><div className="space-y-2"><Label htmlFor="instruction-title">Title</Label><Input id="instruction-title" value={title} maxLength={120} onChange={(event) => setTitle(event.target.value)} /></div><div className="space-y-2"><Label htmlFor="instruction-body">Instructions</Label><div className="flex flex-wrap gap-1 rounded-t-md border border-b-0 bg-muted/40 p-1"><Button type="button" variant="ghost" size="sm" aria-label="Bold" onClick={() => format("bold")}><Bold className="h-4 w-4" /></Button><Button type="button" variant="ghost" size="sm" aria-label="Italic" onClick={() => format("italic")}><Italic className="h-4 w-4" /></Button><Button type="button" variant="ghost" size="sm" aria-label="Heading" onClick={() => format("formatBlock", "h2")}><Heading2 className="h-4 w-4" /></Button><Button type="button" variant="ghost" size="sm" aria-label="Bulleted list" onClick={() => format("insertUnorderedList")}><List className="h-4 w-4" /></Button><Button type="button" variant="ghost" size="sm" aria-label="Link" onClick={() => { const url = window.prompt("Paste an HTTPS URL")?.trim(); if (url?.startsWith("https://")) format("createLink", url) }}><Link className="h-4 w-4" /></Button><Button type="button" variant="ghost" size="sm" aria-label="Upload image from device" onClick={() => imageInputRef.current?.click()}><ImagePlus className="h-4 w-4" /><span className="ml-1">Upload</span></Button><Input ref={imageInputRef} type="file" accept="image/png,image/jpeg,image/webp" className="hidden" onChange={uploadImage} /></div><div ref={setEditor} id="instruction-body" contentEditable suppressContentEditableWarning role="textbox" aria-multiline="true" className="min-h-48 max-h-72 overflow-y-auto rounded-b-md border bg-background px-3 py-2 text-sm leading-6 outline-none focus-visible:ring-2 focus-visible:ring-ring [&_img]:my-2 [&_img]:max-h-56 [&_img]:max-w-full [&_img]:rounded-md [&_img]:object-contain" onInput={(event) => setBody(editorToMarkdown(event.currentTarget))} onPaste={pasteImage} /><p className="text-xs text-muted-foreground">Paste a PNG, JPEG, or WebP image directly into the editor.</p><div className="rounded-md border bg-muted/20 p-3"><p className="mb-2 text-xs font-medium text-muted-foreground">Preview</p>{body.trim() ? <InstructionContent content={body} className="text-sm leading-6" /> : <p className="text-sm text-muted-foreground">Your formatted instruction will appear here.</p>}</div></div></div><DialogFooter><Button disabled={busy || !title.trim() || !body.trim() || body.length > 750000} onClick={() => void save()}>{busy ? "Saving…" : "Save instruction"}</Button></DialogFooter></DialogContent></Dialog>
    </section>
  )
}
