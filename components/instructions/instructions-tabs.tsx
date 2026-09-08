"use client"

import { useEffect, useState } from "react"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"

type Props = { children: React.ReactNode; customInstructions: React.ReactNode }

export function InstructionsTabs({ children, customInstructions }: Props) {
  const [tab, setTab] = useState("general")

  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    if (params.get("tab") === "custom") setTab("custom")
  }, [])

  useEffect(() => {
    if (tab !== "custom") return
    const instructionId = new URLSearchParams(window.location.search).get("instruction")
    if (!instructionId) return
    requestAnimationFrame(() => document.getElementById(`instruction-${instructionId}`)?.scrollIntoView({ behavior: "smooth", block: "start" }))
  }, [tab])

  return (
    <Tabs value={tab} onValueChange={setTab} className="max-w-6xl">
      <TabsList aria-label="Instruction categories">
        <TabsTrigger value="general">General intructions</TabsTrigger>
        <TabsTrigger value="custom">Congregation instructions</TabsTrigger>
      </TabsList>
      <TabsContent value="general" className="mt-6">{children}</TabsContent>
      <TabsContent value="custom" className="mt-6">{customInstructions}</TabsContent>
    </Tabs>
  )
}
