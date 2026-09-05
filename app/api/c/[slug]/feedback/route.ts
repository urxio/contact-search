import { NextRequest, NextResponse } from "next/server"

import { auditEvent, requireMembership, validateMutationOrigin } from "@/lib/auth"
import { apiError, assertMultiTenantEnabled, RouteContext } from "../../_shared"

const PLATFORM_ADMIN_EMAIL = "borisnikaz@gmail.com"
const RESEND_EMAIL_API = "https://api.resend.com/emails"

export async function POST(request: NextRequest, { params }: RouteContext) {
  try {
    assertMultiTenantEnabled()
    validateMutationOrigin(request)
    const auth = await requireMembership(params.slug)
    const body = await request.json()
    const type = body.type === "bug" || body.type === "feedback" ? body.type : null
    const message = typeof body.message === "string" ? body.message.trim() : ""

    if (!type) return NextResponse.json({ error: "Choose whether this is a bug report or feedback." }, { status: 400 })
    if (!message || message.length > 3000) {
      return NextResponse.json({ error: "Your message must be between 1 and 3,000 characters." }, { status: 400 })
    }

    const apiKey = process.env.RESEND_API_KEY
    const from = process.env.FEEDBACK_FROM_EMAIL
    if (!apiKey || !from) {
      console.error("Feedback email is not configured: RESEND_API_KEY and FEEDBACK_FROM_EMAIL are required")
      return NextResponse.json({ error: "Feedback email is not configured. Please contact the platform administrator." }, { status: 503 })
    }

    const kind = type === "bug" ? "Bug report" : "Feedback"
    const emailResponse = await fetch(RESEND_EMAIL_API, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from,
        to: [PLATFORM_ADMIN_EMAIL],
        reply_to: auth.user.email,
        subject: `${kind} from ${auth.user.displayName}`,
        text: [
          `${kind} from Name Search`,
          "",
          message,
          "",
          "---",
          `Reporter: ${auth.user.displayName}`,
          `Email: ${auth.user.email}`,
          `Workspace: ${auth.congregation.name} (${auth.congregation.slug})`,
        ].join("\n"),
      }),
    })

    if (!emailResponse.ok) {
      console.error("Feedback email delivery failed:", emailResponse.status, await emailResponse.text())
      return NextResponse.json({ error: "Your message could not be sent. Please try again." }, { status: 502 })
    }

    await auditEvent({
      actorUserId: auth.user.id,
      congregationId: auth.congregation.id,
      action: "platform_feedback.sent",
      targetType: "platform_admin",
      targetId: PLATFORM_ADMIN_EMAIL,
      metadata: { type, messageLength: message.length },
    })
    return NextResponse.json({ ok: true })
  } catch (error) {
    return apiError(error)
  }
}
