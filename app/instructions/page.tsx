import Link from "next/link"
import { ExternalLink, Presentation, Search } from "lucide-react"

import { ThemeSwitcher } from "@/components/theme-switcher"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"

const presentationUrl =
  "https://docs.google.com/presentation/d/1ycSduWrylr_MVjJFY58KAG2TLTpiN7vR_4G7Jdrugww/edit?usp=sharing"

export const metadata = {
  title: "Instructions",
  description: "Instructions and training materials for Name Search.",
}

export default function InstructionsPage() {
  return (
    <main className="min-h-screen bg-muted/30">
      <header className="border-b bg-background/90 backdrop-blur-xl">
        <div className="mx-auto flex h-16 max-w-4xl items-center justify-between px-4 sm:px-6">
          <Link
            href="/"
            className="inline-flex min-h-11 items-center gap-2 rounded-xl px-2 text-sm font-semibold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <Search className="h-4 w-4 text-primary" aria-hidden="true" />
            Name Search
          </Link>
          <ThemeSwitcher className="h-11 w-11 rounded-xl shadow-none hover:translate-y-0 hover:bg-muted" />
        </div>
      </header>

      <section className="mx-auto max-w-4xl px-4 py-16 sm:px-6 sm:py-24">
        <div className="max-w-2xl">
          <p className="mb-3 text-sm font-semibold uppercase tracking-[0.16em] text-primary">Getting started</p>
          <h1 className="text-balance text-4xl font-bold tracking-tight sm:text-5xl">Instructions</h1>
          <p className="mt-5 text-lg leading-8 text-muted-foreground">
            Use the training presentation below for a guided walkthrough of Name Search.
          </p>
        </div>

        <Card className="mt-10 max-w-2xl border-primary/15 shadow-sm">
          <CardHeader>
            <div className="mb-2 flex h-11 w-11 items-center justify-center rounded-xl bg-primary/10 text-primary">
              <Presentation className="h-5 w-5" aria-hidden="true" />
            </div>
            <CardTitle>Training presentation</CardTitle>
            <CardDescription>
              Open the Google Slides guide in a new tab to follow the step-by-step instructions.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button asChild className="gap-2">
              <a href={presentationUrl} target="_blank" rel="noreferrer">
                Open Google Slides
                <ExternalLink className="h-4 w-4" aria-hidden="true" />
              </a>
            </Button>
          </CardContent>
        </Card>
      </section>
    </main>
  )
}
