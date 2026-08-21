import { NextResponse } from "next/server"
import { AuthError } from "@/lib/auth"

export type RouteContext = { params: { slug: string } }

export function assertMultiTenantEnabled() {
  if (process.env.MULTI_TENANT_ENABLED !== "true") {
    throw new AuthError(404, "Not found")
  }
}

export function apiError(error: unknown) {
  if (error instanceof AuthError) {
    return NextResponse.json({ error: error.message }, { status: error.status })
  }
  console.error("Tenant API error:", error)
  return NextResponse.json({ error: "Internal server error" }, { status: 500 })
}

export function integer(value: unknown): number | null {
  const parsed = Number.parseInt(String(value ?? ""), 10)
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : null
}

export function safeDownloadName(value: string) {
  return value.replace(/[^a-zA-Z0-9._-]+/g, "-").replace(/^-+|-+$/g, "") || "download"
}

export function canManageAll(context: {
  user: { isPlatformAdmin: boolean }
  membership: { role: "member" | "admin" } | null
}) {
  return context.user.isPlatformAdmin || context.membership?.role === "admin"
}
