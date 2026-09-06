import { notFound, redirect } from "next/navigation"
import { ExternalLink, Presentation } from "lucide-react"

import { AuthError, requireMembership } from "@/lib/auth"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { PageFrame } from "@/components/workspace/page-frame"

const presentationUrl =
  "https://docs.google.com/presentation/d/1ycSduWrylr_MVjJFY58KAG2TLTpiN7vR_4G7Jdrugww/edit?usp=sharing"

export default async function InstructionsPage({ params }: { params: { slug: string } }) {
  try {
    await requireMembership(params.slug)
  } catch (error) {
    if (error instanceof AuthError && error.status === 401) {
      redirect(`/auth/sign-in?next=/c/${encodeURIComponent(params.slug)}/instructions`)
    }
    notFound()
  }

  return (
    <PageFrame
      eyebrow="Getting started"
      title="Instructions"
      description="Use the training presentation for a guided walkthrough of Name Search."
      className="max-w-6xl"
    >
      <Card className="max-w-2xl">
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
    </PageFrame>
  )
}
