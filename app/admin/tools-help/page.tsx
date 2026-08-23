import { cookies } from "next/headers"
import { redirect } from "next/navigation"

import { AdminToolsFaq } from "@/components/admin/admin-tools-faq"

export default function AdminToolsHelpPage() {
  if (cookies().get("admin_session")?.value !== process.env.ADMIN_PASSWORD) redirect("/admin/login")
  return <AdminToolsFaq backHref="/admin" />
}
