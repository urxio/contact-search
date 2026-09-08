"use client"

import { useState } from "react"
import { ArrowDown, ArrowUp, Pencil, Plus, Trash2 } from "lucide-react"
import { toast } from "sonner"
import type { CongregationInstruction } from "@/lib/congregation-instructions"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"

type Props = { slug: string; initialInstructions: CongregationInstruction[]; canManage: boolean }

export function CustomInstructions({ slug, initialInstructions, canManage }: Props) {
  const [instructions, setInstructions] = useState(initialInstructions)
  const [editing, setEditing] = useState<CongregationInstruction | null>(null)
  const [title, setTitle] = useState("")
  const [body, setBody] = useState("")
  const [busy, setBusy] = useState(false)

  const endpoint = `/api/c/${encodeURIComponent(slug)}/instructions`
  function openCreate() { setEditing({ id: 0, title: "", body: "", position: instructions.length, revision: 0 }); setTitle(""); setBody("") }
  function openEdit(instruction: CongregationInstruction) { setEditing(instruction); setTitle(instruction.title); setBody(instruction.body) }

  async function save() {
    if (!editing || !title.trim() || !body.trim()) return
    setBusy(true)
    try {
      const response = await fetch(endpoint, { method: editing.id ? "PATCH" : "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(editing.id ? { id: editing.id, title, body } : { title, body }) })
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
    <section className="mt-12 max-w-4xl" aria-labelledby="congregation-instructions-heading">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div><h2 id="congregation-instructions-heading" className="text-xl font-semibold">Congregation instructions</h2><p className="mt-1 text-sm text-muted-foreground">Additional guidance from your congregation administrators.</p></div>
        {canManage ? <Button onClick={openCreate} className="gap-2"><Plus className="h-4 w-4" />Add instruction</Button> : null}
      </div>
      {instructions.length ? <div className="mt-5 space-y-4">{instructions.map((instruction, index) => <Card key={instruction.id}><CardHeader className="gap-2"><div className="flex items-start justify-between gap-3"><CardTitle className="text-base">{instruction.title}</CardTitle>{canManage ? <div className="flex shrink-0 gap-1"><Button aria-label={`Move ${instruction.title} up`} variant="ghost" size="icon" disabled={index === 0 || busy} onClick={() => void reorder([...instructions.slice(0, index - 1), instruction, instructions[index - 1], ...instructions.slice(index + 1)])}><ArrowUp className="h-4 w-4" /></Button><Button aria-label={`Move ${instruction.title} down`} variant="ghost" size="icon" disabled={index === instructions.length - 1 || busy} onClick={() => void reorder([...instructions.slice(0, index), instructions[index + 1], instruction, ...instructions.slice(index + 2)])}><ArrowDown className="h-4 w-4" /></Button><Button aria-label={`Edit ${instruction.title}`} variant="ghost" size="icon" disabled={busy} onClick={() => openEdit(instruction)}><Pencil className="h-4 w-4" /></Button><Button aria-label={`Delete ${instruction.title}`} variant="ghost" size="icon" className="text-destructive hover:text-destructive" disabled={busy} onClick={() => void remove(instruction)}><Trash2 className="h-4 w-4" /></Button></div> : null}</div><CardDescription className="whitespace-pre-wrap leading-6">{instruction.body}</CardDescription></CardHeader></Card>)}</div> : <Card className="mt-5"><CardContent className="py-6 text-sm text-muted-foreground">{canManage ? "Add congregation-specific instructions for members here." : "There are no additional congregation instructions right now."}</CardContent></Card>}
      <Dialog open={Boolean(editing)} onOpenChange={(open) => { if (!open && !busy) setEditing(null) }}><DialogContent className="sm:max-w-lg"><DialogHeader><DialogTitle>{editing?.id ? "Edit instruction" : "Add instruction"}</DialogTitle><DialogDescription>Members will be notified in Name Search when this instruction is published or updated.</DialogDescription></DialogHeader><div className="space-y-4"><div className="space-y-2"><Label htmlFor="instruction-title">Title</Label><Input id="instruction-title" value={title} maxLength={120} onChange={(event) => setTitle(event.target.value)} /></div><div className="space-y-2"><Label htmlFor="instruction-body">Instructions</Label><Textarea id="instruction-body" value={body} maxLength={5000} rows={8} onChange={(event) => setBody(event.target.value)} /></div></div><DialogFooter><Button disabled={busy || !title.trim() || !body.trim()} onClick={() => void save()}>{busy ? "Saving…" : "Save instruction"}</Button></DialogFooter></DialogContent></Dialog>
    </section>
  )
}
