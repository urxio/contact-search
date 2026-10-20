"use client"

import { useEffect, useState } from "react"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"

type Props = { children: React.ReactNode; customInstructions: React.ReactNode; adminInstructions?: React.ReactNode }

export function InstructionsTabs({ children, customInstructions, adminInstructions }: Props) {
  const [tab, setTab] = useState("general")
  const hasAdminTab = Boolean(adminInstructions)

  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    if (params.get("tab") === "custom") setTab("custom")
    if (params.get("tab") === "admin" && hasAdminTab) setTab("admin")
  }, [hasAdminTab])

  useEffect(() => {
    if (tab !== "custom" && tab !== "admin") return
    const instructionId = new URLSearchParams(window.location.search).get("instruction")
    if (!instructionId) return
    const anchor = tab === "admin" ? `admin-instruction-${instructionId}` : `instruction-${instructionId}`
    requestAnimationFrame(() => document.getElementById(anchor)?.scrollIntoView({ behavior: "smooth", block: "start" }))
  }, [tab])

  return (
    <Tabs value={tab} onValueChange={setTab} className="max-w-6xl">
      <TabsList aria-label="Instruction categories">
        <TabsTrigger value="general">General instructions</TabsTrigger>
        <TabsTrigger value="custom">Congregation instructions</TabsTrigger>
        {adminInstructions ? <TabsTrigger value="admin">Admin instructions</TabsTrigger> : null}
      </TabsList>
      <TabsContent value="general" className="mt-6">{children}</TabsContent>
      <TabsContent value="custom" className="mt-6">{customInstructions}</TabsContent>
      {adminInstructions ? <TabsContent value="admin" className="mt-6">{adminInstructions}</TabsContent> : null}
    </Tabs>
  )
}
