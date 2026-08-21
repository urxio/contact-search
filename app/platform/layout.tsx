import { notFound, redirect } from "next/navigation"
import { PlatformHeader } from "@/components/workspace/platform-header"
import { AuthError, requirePlatformAdmin } from "@/lib/auth"

export const dynamic = "force-dynamic"

export default async function PlatformLayout({ children }: { children: React.ReactNode }) {
  try {
    await requirePlatformAdmin()
  } catch (error) {
    if (error instanceof AuthError && error.status === 401) redirect("/auth/sign-in?next=/platform")
    notFound()
  }
  return (
    <div className="admin-shell min-h-screen">
      <PlatformHeader />
      {children}
    </div>
  )
}
